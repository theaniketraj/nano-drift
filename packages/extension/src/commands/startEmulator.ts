import * as vscode from 'vscode';
import type { CommandDeps } from './index';

export async function startEmulator(deps: CommandDeps): Promise<void> {
    const { daemonClient, statusBarManager } = deps;

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

    // Snapshot current device serials before starting the emulator so that
    // waitForBoot can detect the newly spawned emulator-XXXX entry.
    let knownSerials: string[] = [];
    try {
        knownSerials = (await daemonClient.listDevices()).map((d) => d.serial);
    } catch {
        // ignore — waitForBoot will still detect any new emulator
    }

    try {
        await daemonClient.startEmulator(selected.label);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to start emulator: ${msg}`);
        return;
    }

    // Wait for the emulator to finish booting, showing cancellable progress.
    let newSerial: string | undefined;
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Waiting for "${selected.label}" to boot…`,
            cancellable: true,
        },
        async (_progress, token) => {
            const bootPromise = daemonClient.waitForBoot(knownSerials).then((s) => {
                newSerial = s;
            });
            // If the user cancels we stop waiting but don't kill the emulator.
            await Promise.race([
                bootPromise,
                new Promise<void>((resolve) => token.onCancellationRequested(resolve)),
            ]);
        }
    );

    if (newSerial) {
        daemonClient.setActiveDevice(newSerial);
        statusBarManager.setDevice(selected.label, 'emulator');
        vscode.window.showInformationMessage(
            `Emulator "${selected.label}" is booted and set as the active device.`
        );
    } else {
        // User cancelled the wait
        vscode.window.showInformationMessage(
            `Emulator "${selected.label}" is starting in the background. Use "Select Active Device" once it boots.`
        );
    }
}
