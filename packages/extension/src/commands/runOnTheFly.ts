import * as vscode from 'vscode';
import type { CommandDeps } from './index';

export async function runOnTheFly(deps: CommandDeps): Promise<void> {
    const { statusBarManager, daemonClient, diagnosticsManager } = deps;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Nano Drift: No workspace folder is open.');
        return;
    }

    // Resolve package name: user setting → auto-detect
    const config = vscode.workspace.getConfiguration('nanoDrift');
    let packageName = config.get<string>('packageName', '').trim() || undefined;
    if (!packageName) {
        try {
            packageName = await daemonClient.detectPackage(workspaceFolder);
        } catch {
            vscode.window.showErrorMessage(
                'Nano Drift: Could not detect package name. ' +
                'Set "nanoDrift.packageName" in settings.'
            );
            return;
        }
    }

    try {
        statusBarManager.setBuilding();
        diagnosticsManager.clear();

        // The build RPC call also launches the app on the active device.
        // Progress lines are streamed via push events wired in extension.ts.
        const errors = await daemonClient.build(workspaceFolder, packageName);

        if (errors.length > 0) {
            diagnosticsManager.update(errors);
        }

        statusBarManager.setRunning();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        statusBarManager.setError(message);
        vscode.window
            .showErrorMessage(`Nano Drift build failed: ${message.split('\n')[0]}`, 'Show Output')
            .then((action) => {
                if (action === 'Show Output') {
                    daemonClient.showOutput();
                }
            });
    }
}

