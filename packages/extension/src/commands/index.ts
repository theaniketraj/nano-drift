import * as vscode from 'vscode';
import { StatusBarManager } from '../statusBar';
import { DaemonClient } from '../daemon/client';
import { DiagnosticsManager } from '../diagnostics';
import { runOnTheFly } from './runOnTheFly';
import { selectDevice } from './selectDevice';
import { showDeviceScreen } from './showDeviceScreen';
import { startEmulator } from './startEmulator';
import { connectWifi } from './connectWifi';

export interface CommandDeps {
    statusBarManager: StatusBarManager;
    daemonClient: DaemonClient;
    sdkPath: string | undefined;
    diagnosticsManager: DiagnosticsManager;
}

export function registerCommands(
    context: vscode.ExtensionContext,
    deps: CommandDeps
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('nanoDrift.runOnTheFly', () =>
            runOnTheFly(deps)
        ),
        vscode.commands.registerCommand('nanoDrift.selectDevice', () =>
            selectDevice(deps)
        ),
        vscode.commands.registerCommand('nanoDrift.showDeviceScreen', () =>
            showDeviceScreen(context, deps)
        ),
        vscode.commands.registerCommand('nanoDrift.startEmulator', () =>
            startEmulator(deps)
        ),
        vscode.commands.registerCommand('nanoDrift.connectWifi', () =>
            connectWifi(deps)
        ),
        vscode.commands.registerCommand('nanoDrift.listDevices', async () => {
            const devices = await deps.daemonClient.listDevices();
            const names = devices.map((d) => `${d.name} (${d.serial})`).join('\n') || 'No devices found.';
            vscode.window.showInformationMessage(names);
        }),
        vscode.commands.registerCommand('nanoDrift.stopDaemon', () =>
            deps.daemonClient.stop()
        )
    );
}
