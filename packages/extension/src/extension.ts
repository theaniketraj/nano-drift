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

    registerCommands(context, { context, statusBarManager, daemonClient, sdkPath, diagnosticsManager });

    await vscode.commands.executeCommand('setContext', 'nanoDrift.active', true);
    await refreshGitHubAuthContext();
    statusBarManager.setIdle();

    await maybeShowFirstRunOnboarding(context);

    // ------------------------------------------------------------------ //
    //  Restore last-used device from workspace state
    // ------------------------------------------------------------------ //
    const lastSerial = context.workspaceState.get<string>('nanoDrift.lastDevice');
    if (lastSerial) {
        try {
            const devices = await daemonClient.listDevices();
            const match = devices.find((d) => d.serial === lastSerial);
            if (match) {
                daemonClient.setActiveDevice(match.serial);
                statusBarManager.setDevice(match.name, match.type);
                console.log(`[nano-drift] Restored last device: ${match.serial}`);
            }
        } catch {
            // Daemon not yet up — the onDeviceListChanged subscription below will
            // attempt restoration once the device list becomes available.
        }
    }

    // ------------------------------------------------------------------ //
    //  When the device list changes, restore persisted device if not yet set
    // ------------------------------------------------------------------ //
    const client = daemonClient;
    context.subscriptions.push(
        client.onDeviceListChanged((devices) => {
            const savedSerial = context.workspaceState.get<string>('nanoDrift.lastDevice');
            if (!savedSerial) return;
            const match = devices.find((d) => d.serial === savedSerial);
            if (match) {
                client.setActiveDevice(match.serial);
                statusBarManager?.setDevice(match.name, match.type);
            }
        })
    );

    // ------------------------------------------------------------------ //
    //  Auto-start file watcher if enabled
    // ------------------------------------------------------------------ //
    await maybeStartWatcher(daemonClient);

    // Handle workspace folders added/removed at runtime
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
            for (const removed of e.removed) {
                await daemonClient?.stopWatcher(removed.uri.fsPath).catch(() => undefined);
            }
            for (const added of e.added) {
                if (daemonClient) await maybeStartWatcherForFolder(daemonClient, added.uri.fsPath);
            }
        })
    );

    // Re-evaluate watcher when settings change
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            const affectsWatcher =
                e.affectsConfiguration('nanoDrift.autoRunOnSave') ||
                e.affectsConfiguration('nanoDrift.buildVariant') ||
                e.affectsConfiguration('nanoDrift.gradleArgs');
            if (affectsWatcher) {
                // Stop all watchers and restart based on current settings.
                await daemonClient?.stopWatcher().catch(() => undefined);
                const enabled = vscode.workspace
                    .getConfiguration('nanoDrift')
                    .get<boolean>('autoRunOnSave', true);
                if (enabled) await maybeStartWatcher(daemonClient!);
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

    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
        await maybeStartWatcherForFolder(client, folder.uri.fsPath);
    }
}

async function maybeStartWatcherForFolder(client: DaemonClient, folderPath: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('nanoDrift');
    let packageName = config.get<string>('packageName', '').trim() || undefined;
    if (!packageName) {
        try {
            packageName = await client.detectPackage(folderPath);
            console.log(`[nano-drift] Detected package in ${folderPath}: ${packageName}`);
        } catch {
            // Not an Android project or manifest not found — silently skip.
            return;
        }
    }
    try {
        await client.startWatcher(folderPath, packageName);
        console.log(`[nano-drift] File watcher started for: ${folderPath}`);
    } catch (err) {
        console.warn('[nano-drift] Could not start file watcher:', err);
    }
}

async function maybeShowFirstRunOnboarding(context: vscode.ExtensionContext): Promise<void> {
    const key = 'nanoDrift.onboardingShown.v1';
    const alreadyShown = context.globalState.get<boolean>(key, false);
    if (alreadyShown) return;

    await context.globalState.update(key, true);

    const action = await vscode.window.showInformationMessage(
        'Welcome to Nano Drift. Open the quick start guide and complete GitHub sign-in to get started.',
        'Get Started',
        'Sign in with GitHub',
        'Dismiss'
    );

    if (action === 'Get Started') {
        await vscode.commands.executeCommand('nanoDrift.getStarted');
        return;
    }

    if (action === 'Sign in with GitHub') {
        await vscode.commands.executeCommand('nanoDrift.signInGitHub');
    }
}

async function refreshGitHubAuthContext(): Promise<void> {
    try {
        const session = await vscode.authentication.getSession('github', ['read:user'], {
            createIfNone: false,
        });
        await vscode.commands.executeCommand('setContext', 'nanoDrift.githubAuthed', Boolean(session));
    } catch {
        await vscode.commands.executeCommand('setContext', 'nanoDrift.githubAuthed', false);
    }
}
