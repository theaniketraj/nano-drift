import * as vscode from 'vscode';

export type StatusBarState = 'idle' | 'building' | 'deploying' | 'running' | 'error';

export class StatusBarManager {
    private readonly deviceItem: vscode.StatusBarItem;
    private readonly actionItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext) {
        this.deviceItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.actionItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );

        this.deviceItem.command = 'nanoDrift.selectDevice';
        this.actionItem.command = 'nanoDrift.runOnTheFly';

        this.deviceItem.show();
        this.actionItem.show();

        context.subscriptions.push(this.deviceItem, this.actionItem);
    }

    setDevice(name: string): void {
        this.deviceItem.text = `$(device-mobile) ${name}`;
        this.deviceItem.tooltip = 'Click to select a different device';
    }

    setNoDevice(): void {
        this.deviceItem.text = '$(device-mobile) No Device';
        this.deviceItem.tooltip = 'Click to select or connect a device';
    }

    setIdle(): void {
        this.setNoDevice();
        this.actionItem.text = '$(run) Run on the Fly';
        this.actionItem.tooltip = 'Build and deploy to the active device';
        this.actionItem.backgroundColor = undefined;
    }

    setBuilding(): void {
        this.actionItem.text = '$(sync~spin) Building…';
        this.actionItem.tooltip = 'Incremental Gradle build in progress';
        this.actionItem.backgroundColor = undefined;
    }

    setDeploying(): void {
        this.actionItem.text = '$(cloud-upload) Deploying…';
        this.actionItem.tooltip = 'Installing APK on device';
        this.actionItem.backgroundColor = undefined;
    }

    setRunning(): void {
        this.actionItem.text = '$(debug-start) Running';
        this.actionItem.tooltip = 'App is running on device';
        this.actionItem.backgroundColor = undefined;
    }

    setError(message: string): void {
        this.actionItem.text = '$(error) Build Failed';
        this.actionItem.tooltip = message;
        this.actionItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }

    dispose(): void {
        this.deviceItem.dispose();
        this.actionItem.dispose();
    }
}
