import * as vscode from 'vscode';
import type { CommandDeps } from './index';

const IP_PORT_PATTERN = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

export async function connectWifi(deps: CommandDeps): Promise<void> {
    const { daemonClient, statusBarManager } = deps;

    // Ask whether to pair first (Android 11+) or connect directly
    const mode = await vscode.window.showQuickPick(
        [
            {
                label: '$(plug) Connect directly',
                description: 'Android ≤ 10 or already paired',
                id: 'direct',
            },
            {
                label: '$(lock) Pair first (Android 11+)',
                description: 'Use the pairing code shown in Developer Options',
                id: 'pair',
            },
        ],
        { placeHolder: 'How would you like to connect over Wi-Fi?' }
    );

    if (!mode) return;

    if (mode.id === 'pair') {
        await pairAndConnect(daemonClient, statusBarManager);
    } else {
        await connectDirect(daemonClient, statusBarManager);
    }
}

async function pairAndConnect(
    daemonClient: CommandDeps['daemonClient'],
    statusBarManager: CommandDeps['statusBarManager']
): Promise<void> {
    const pairAddress = await vscode.window.showInputBox({
        prompt: 'Enter the pairing address shown in Developer Options',
        placeHolder: '192.168.1.42:37263',
        validateInput: (v) =>
            IP_PORT_PATTERN.test(v.trim()) ? null : 'Enter address as IP:port (e.g. 192.168.1.42:37263)',
    });
    if (!pairAddress) return;

    const code = await vscode.window.showInputBox({
        prompt: 'Enter the pairing code shown in Developer Options',
        placeHolder: '123456',
        validateInput: (v) =>
            /^\d{6}$/.test(v.trim()) ? null : 'Enter the 6-digit pairing code',
    });
    if (!code) return;

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Pairing with ${pairAddress.trim()}…`,
                cancellable: false,
            },
            () => daemonClient.pairDevice(pairAddress.trim(), code.trim())
        );
        vscode.window.showInformationMessage(`Paired with ${pairAddress.trim()}. Now connect.`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Pairing failed: ${msg}`);
        return;
    }

    // After pairing, proceed to normal connect (may use a different port)
    await connectDirect(daemonClient, statusBarManager);
}

async function connectDirect(
    daemonClient: CommandDeps['daemonClient'],
    statusBarManager: CommandDeps['statusBarManager']
): Promise<void> {
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
