import * as vscode from 'vscode';
import { StatusBarManager } from '../statusBar';
import { DaemonClient } from '../daemon/client';
import { DiagnosticsManager } from '../diagnostics';
import { runOnTheFly } from './runOnTheFly';
import { selectDevice } from './selectDevice';
import { DeviceScreenViewProvider } from './showDeviceScreen';
import { startEmulator } from './startEmulator';
import { connectWifi } from './connectWifi';

export interface CommandDeps {
    context: vscode.ExtensionContext;
    statusBarManager: StatusBarManager;
    daemonClient: DaemonClient;
    sdkPath: string | undefined;
    diagnosticsManager: DiagnosticsManager;
}

export function registerCommands(
    context: vscode.ExtensionContext,
    deps: CommandDeps
): void {
    const screenProvider = new DeviceScreenViewProvider(context, deps);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            DeviceScreenViewProvider.viewType,
            screenProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nanoDrift.runOnTheFly', () =>
            runOnTheFly(deps)
        ),
        vscode.commands.registerCommand('nanoDrift.selectDevice', () =>
            selectDevice(deps)
        ),
        vscode.commands.registerCommand('nanoDrift.showDeviceScreen', () =>
            void vscode.commands.executeCommand('nanoDrift.deviceScreenView.focus')
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
        ),
        vscode.commands.registerCommand('nanoDrift.getStarted', async () => {
            const selection = await vscode.window.showQuickPick(
                [
                    { label: 'Open Quick Start Guide', action: 'openReadme' },
                    { label: 'Sign in with GitHub', action: 'signIn' },
                    { label: 'Select Active Device', action: 'selectDevice' },
                    { label: 'Run on the Fly', action: 'runOnTheFly' },
                ],
                {
                    title: 'Nano Drift: Get Started',
                    placeHolder: 'Choose the next step',
                }
            );

            if (!selection) return;

            if (selection.action === 'openReadme') {
                const readmeUri = vscode.Uri.joinPath(deps.context.extensionUri, 'README.md');
                await vscode.commands.executeCommand('markdown.showPreview', readmeUri);
                return;
            }

            if (selection.action === 'signIn') {
                await vscode.commands.executeCommand('nanoDrift.signInGitHub');
                return;
            }

            if (selection.action === 'selectDevice') {
                await vscode.commands.executeCommand('nanoDrift.selectDevice');
                return;
            }

            if (selection.action === 'runOnTheFly') {
                await vscode.commands.executeCommand('nanoDrift.runOnTheFly');
            }
        }),
        vscode.commands.registerCommand('nanoDrift.signInGitHub', async () => {
            try {
                const session = await vscode.authentication.getSession('github', ['read:user'], {
                    createIfNone: true,
                });

                await vscode.commands.executeCommand('setContext', 'nanoDrift.githubAuthed', Boolean(session));

                if (session) {
                    vscode.window.showInformationMessage(
                        `Nano Drift: Signed in to GitHub as ${session.account.label}.`
                    );
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Nano Drift: GitHub sign-in failed. ${message}`);
            }
        })
    );
}
