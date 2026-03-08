import * as vscode from 'vscode';
import type { CommandDeps } from './index';
import type { DeviceInfo } from '../daemon/client';

export async function selectDevice(deps: CommandDeps): Promise<void> {
    const { statusBarManager, daemonClient } = deps;

    let devices: DeviceInfo[];
    try {
        devices = await daemonClient.listDevices();
    } catch {
        devices = [];
    }

    if (devices.length === 0) {
        const action = await vscode.window.showWarningMessage(
            'No Android devices found.',
            'Start Emulator',
            'Connect via Wi-Fi'
        );
        if (action === 'Start Emulator') {
            await vscode.commands.executeCommand('nanoDrift.startEmulator');
        } else if (action === 'Connect via Wi-Fi') {
            await vscode.commands.executeCommand('nanoDrift.connectWifi');
        }
        return;
    }

    const items: vscode.QuickPickItem[] = devices.map((d) => ({
        label: d.name,
        description: d.serial,
        detail: d.type === 'emulator' ? '$(vm) Emulator' : '$(device-mobile) Physical Device',
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a device to target',
        matchOnDescription: true,
    });

    if (selected?.description) {
        daemonClient.setActiveDevice(selected.description);
        statusBarManager.setDevice(selected.label);
    }
}
