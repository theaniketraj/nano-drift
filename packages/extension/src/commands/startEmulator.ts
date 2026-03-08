import * as vscode from 'vscode';
import type { CommandDeps } from './index';

export async function startEmulator(deps: CommandDeps): Promise<void> {
    const { daemonClient } = deps;

    let avds: string[];
    try {
        avds = await daemonClient.listAvds();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to list AVDs: ${msg}`);
        return;
    }

    if (avds.length === 0) {
        vscode.window.showWarningMessage(
            'No AVDs found. Create one with the Android AVD Manager first.',
            'Open Docs'
        ).then((action) => {
            if (action === 'Open Docs') {
                vscode.env.openExternal(
                    vscode.Uri.parse('https://developer.android.com/studio/run/managing-avds')
                );
            }
        });
        return;
    }

    const selected = await vscode.window.showQuickPick(
        avds.map((avd) => ({ label: avd })),
        { placeHolder: 'Select an AVD to start (headless — no GUI window)' }
    );

    if (!selected) return;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Starting ${selected.label} headless…`,
            cancellable: false,
        },
        () => daemonClient.startEmulator(selected.label)
    );

    vscode.window.showInformationMessage(
        `Emulator "${selected.label}" is starting. Use "Select Active Device" once it boots.`
    );
}
