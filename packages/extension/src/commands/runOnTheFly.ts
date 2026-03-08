import * as vscode from 'vscode';
import type { CommandDeps } from './index';

export async function runOnTheFly(deps: CommandDeps): Promise<void> {
    const { statusBarManager, daemonClient } = deps;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Nano Drift: No workspace folder is open.');
        return;
    }

    try {
        statusBarManager.setBuilding();
        await daemonClient.build(workspaceFolder);

        statusBarManager.setDeploying();
        await daemonClient.deploy();

        statusBarManager.setRunning();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        statusBarManager.setError(message);
        vscode.window.showErrorMessage(`Nano Drift build failed: ${message}`, 'Show Output').then((action) => {
            if (action === 'Show Output') {
                daemonClient.showOutput();
            }
        });
    }
}
