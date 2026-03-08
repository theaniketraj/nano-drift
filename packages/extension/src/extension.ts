import * as vscode from 'vscode';
import { StatusBarManager } from './statusBar';
import { registerCommands } from './commands';
import { DaemonClient } from './daemon/client';
import { detectAndroidSdk } from './sdk';

let daemonClient: DaemonClient | undefined;
let statusBarManager: StatusBarManager | undefined;

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

    registerCommands(context, { statusBarManager, daemonClient, sdkPath });

    await vscode.commands.executeCommand('setContext', 'nanoDrift.active', true);
    statusBarManager.setIdle();

    console.log('[nano-drift] Active.');
}

export function deactivate(): void {
    daemonClient?.dispose();
    statusBarManager?.dispose();
}
