import * as vscode from 'vscode';
import type { CommandDeps } from './index';
import type { DeviceInfo } from '../daemon/client';

const LAST_DEVICE_KEY = 'nanoDrift.lastDevice';

interface DeviceItem extends vscode.QuickPickItem {
    device: DeviceInfo;
}

export async function selectDevice(deps: CommandDeps): Promise<void> {
    const { context, statusBarManager, daemonClient } = deps;

    const qp = vscode.window.createQuickPick<DeviceItem>();
    qp.placeholder = 'Select a device to target';
    qp.matchOnDescription = true;
    qp.buttons = [
        { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Refresh device list' },
    ];

    const populateItems = async (): Promise<DeviceInfo[]> => {
        qp.busy = true;
        try {
            const devices = await daemonClient.listDevices();
            qp.items = devices.map((d) => ({
                label: d.name,
                description: d.serial,
                detail: d.type === 'emulator' ? '$(vm) Emulator' : '$(device-mobile) Physical Device',
                device: d,
            }));
            return devices;
        } catch {
            qp.items = [];
            return [];
        } finally {
            qp.busy = false;
        }
    };

    qp.onDidTriggerButton(() => {
        void populateItems();
    });

    qp.onDidAccept(() => {
        const sel = qp.selectedItems[0];
        if (sel) {
            daemonClient.setActiveDevice(sel.device.serial);
            statusBarManager.setDevice(sel.device.name, sel.device.type);
            void context.workspaceState.update(LAST_DEVICE_KEY, sel.device.serial);
        }
        qp.dispose();
    });

    qp.onDidHide(() => qp.dispose());

    const devices = await populateItems();
    qp.show();

    // If no devices, show a warning after the picker opens
    if (devices.length === 0) {
        qp.dispose();
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
    }
}
