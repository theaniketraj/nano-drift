import * as vscode from 'vscode';
import { StatusBarManager } from './statusBar';
import { registerCommands } from './commands';
import { DaemonClient } from './daemon/client';
import { DiagnosticsManager } from './diagnostics';
import { detectAndroidSdk } from './sdk';

let daemonClient: DaemonClient | undefined;
let statusBarManager: StatusBarManager | undefined;
let diagnosticsManager: DiagnosticsManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('[nano-drift] Activating...');

    const sdkPath = await detectAndroidSdk();
    if (!sdkPath) {
        const action = await vscode.window.showWarningMessage(
            'Nano Drift: ANDROID_HOME is not set. The Android SDK is required.',
            'Open Settings',
            'Dismiss'
        );
        if (action === 'Open Settings') {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'nanoDrift.androidHome'
            );
        }
    }

    statusBarManager = new StatusBarManager(context);
    daemonClient = new DaemonClient(context);
    diagnosticsManager = new DiagnosticsManager();
    context.subscriptions.push(diagnosticsManager);

    // ------------------------------------------------------------------ //
    //  Wire build progress events → status bar + diagnostics
    // ------------------------------------------------------------------ //
    context.subscriptions.push(
        daemonClient.onBuildProgress((event) => {
            switch (event.stage) {
                case 'building':
                    statusBarManager?.setBuilding();
                    diagnosticsManager?.clear();
                    break;
                case 'deploying':
                    statusBarManager?.setDeploying();
                    break;
                case 'done':
                    statusBarManager?.setRunning();
                    if (event.errors && event.errors.length > 0) {
                        diagnosticsManager?.update(event.errors);
                    }
                    break;
                case 'error': {
                    const msg = event.message ?? 'Build failed.';
                    statusBarManager?.setError(msg);
                    if (event.errors && event.errors.length > 0) {
                        diagnosticsManager?.update(event.errors);
                    }
                    vscode.window
                        .showErrorMessage(`Nano Drift: ${msg.split('\n')[0]}`, 'Show Output')
                        .then((action) => {
                            if (action === 'Show Output') daemonClient?.showOutput();
                        });
                    break;
                }
            }
        })
    );

    registerCommands(context, { statusBarManager, daemonClient, sdkPath, diagnosticsManager });

    await vscode.commands.executeCommand('setContext', 'nanoDrift.active', true);
    statusBarManager.setIdle();

    // ------------------------------------------------------------------ //
    //  Auto-start file watcher if enabled
    // ------------------------------------------------------------------ //
    await maybeStartWatcher(daemonClient);

    // Re-evaluate watcher when settings change
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('nanoDrift.autoRunOnSave')) {
                const enabled = vscode.workspace
                    .getConfiguration('nanoDrift')
                    .get<boolean>('autoRunOnSave', true);
                if (enabled) {
                    await maybeStartWatcher(daemonClient!);
                } else {
                    await daemonClient?.stopWatcher().catch(() => undefined);
                }
            }
        })
    );

    console.log('[nano-drift] Active.');
}

export function deactivate(): void {
    daemonClient?.dispose();
    statusBarManager?.dispose();
    diagnosticsManager?.dispose();
}

// ---------------------------------------------------------------------------

async function maybeStartWatcher(client: DaemonClient): Promise<void> {
    const config = vscode.workspace.getConfiguration('nanoDrift');
    if (!config.get<boolean>('autoRunOnSave', true)) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return;

    // Resolve package name: user setting takes priority, then auto-detect
    let packageName = config.get<string>('packageName', '').trim() || undefined;
    if (!packageName) {
        try {
            packageName = await client.detectPackage(workspaceFolder);
            console.log(`[nano-drift] Detected package: ${packageName}`);
        } catch {
            // Not an Android project or manifest not found — silently skip watcher
            return;
        }
    }

    try {
        await client.startWatcher(workspaceFolder, packageName);
        console.log(`[nano-drift] File watcher started for: ${workspaceFolder}`);
    } catch (err) {
        console.warn('[nano-drift] Could not start file watcher:', err);
    }
}
