import * as vscode from 'vscode';
import type { CommandDeps } from './index';

const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

export async function connectWifi(deps: CommandDeps): Promise<void> {
    const { daemonClient, statusBarManager } = deps;

    const ip = await vscode.window.showInputBox({
        prompt: 'Enter the device IP address',
        placeHolder: '192.168.1.42  or  192.168.1.42:5555',
        validateInput: (val) =>
            IP_PATTERN.test(val.trim()) ? null : 'Enter a valid IP address (e.g. 192.168.1.42)',
    });

    if (!ip) return;

    const address = ip.trim().includes(':') ? ip.trim() : `${ip.trim()}:5555`;

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Connecting to ${address}…`,
                cancellable: false,
            },
            () => daemonClient.connectWifi(address)
        );

        statusBarManager.setDevice(address);
        vscode.window.showInformationMessage(`Connected to ${address}`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to connect to ${address}: ${msg}`);
    }
}
