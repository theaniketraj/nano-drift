import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import WebSocket from 'ws';

export interface DeviceInfo {
    serial: string;
    name: string;
    type: 'emulator' | 'device';
    state: string;
}

export interface BuildError {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    message: string;
}

export type BuildStage = 'building' | 'output' | 'deploying' | 'done' | 'error';

export interface BuildProgressEvent {
    stage: BuildStage;
    /** Present when stage === 'output' */
    line?: string;
    /** Present when stage === 'done' or 'error' */
    errors?: BuildError[];
    /** Present when stage === 'error' */
    message?: string;
    projectPath?: string;
}

interface RpcMessage {
    id?: string;
    method?: string;
    result?: unknown;
    error?: string;
    params?: unknown;
}

/**
 * Thin WebSocket JSON-RPC client that talks to the Nano Drift daemon.
 * If the daemon is not running it spawns it automatically.
 */
export class DaemonClient implements vscode.Disposable {
    private ws: WebSocket | undefined;
    private activeDevice: string | undefined;
    private readonly port: number;
    private daemonProcess: cp.ChildProcess | undefined;
    private readonly outputChannel: vscode.OutputChannel;

    private readonly _onBuildProgress = new vscode.EventEmitter<BuildProgressEvent>();
    readonly onBuildProgress = this._onBuildProgress.event;

    private readonly _onDeviceListChanged = new vscode.EventEmitter<DeviceInfo[]>();
    readonly onDeviceListChanged = this._onDeviceListChanged.event;

    constructor(context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('nanoDrift');
        this.port = config.get<number>('daemonPort', 27183);
        this.outputChannel = vscode.window.createOutputChannel('Nano Drift');
        context.subscriptions.push(this.outputChannel, this._onBuildProgress, this._onDeviceListChanged);
    }

    showOutput(): void {
        this.outputChannel.show();
    }

    // ------------------------------------------------------------------ //
    //  Connection management
    // ------------------------------------------------------------------ //

    private async ensureRunning(): Promise<void> {
        if (this.ws?.readyState === WebSocket.OPEN) return;
        try {
            await this.connect();
        } catch {
            await this.spawnDaemon();
            await this.retryConnect();
        }
    }

    private connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${this.port}/rpc`);
            ws.once('open', () => {
                this.ws = ws;
                ws.on('message', this.handleMessage.bind(this));
                ws.on('close', () => { this.ws = undefined; });
                resolve();
            });
            ws.once('error', (err) => reject(err));
        });
    }

    private async retryConnect(attempts = 12, delayMs = 500): Promise<void> {
        for (let i = 0; i < attempts; i++) {
            try {
                await this.connect();
                return;
            } catch {
                await sleep(delayMs);
            }
        }
        throw new Error('Could not connect to the Nano Drift daemon after multiple attempts.');
    }

    private spawnDaemon(): Promise<void> {
        const daemonEntry = path.join(__dirname, '..', '..', '..', 'daemon', 'out', 'index.js');
        this.outputChannel.appendLine(`[nano-drift] Spawning daemon: node "${daemonEntry}" --port ${this.port}`);

        return new Promise((resolve, reject) => {
            this.daemonProcess = cp.spawn('node', [daemonEntry, '--port', String(this.port)], {
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            this.daemonProcess.stdout?.on('data', (d: Buffer) => this.outputChannel.append(d.toString()));
            this.daemonProcess.stderr?.on('data', (d: Buffer) => this.outputChannel.append(`[ERR] ${d.toString()}`));
            this.daemonProcess.on('error', reject);

            // Give the process a moment to bind the port
            setTimeout(resolve, 200);
        });
    }

    // ------------------------------------------------------------------ //
    //  Incoming message handler (RPC responses + push notifications)
    // ------------------------------------------------------------------ //

    private handleMessage(raw: WebSocket.RawData): void {
        let msg: RpcMessage;
        try {
            msg = JSON.parse(raw.toString()) as RpcMessage;
        } catch {
            return; // ignore malformed frames
        }

        if (!msg.id && msg.method) {
            // Push notification from daemon (no id → not a response)
            this.handlePush(msg.method, msg.params);
        }
        // Responses to RPC calls are handled inline in rpc() via per-call listeners
    }

    private handlePush(method: string, params: unknown): void {
        if (method === 'build.progress') {
            const event = params as BuildProgressEvent;
            // Mirror each output line to the Output Channel
            if (event.stage === 'output' && event.line) {
                this.outputChannel.appendLine(event.line);
            }
            this._onBuildProgress.fire(event);
        } else if (method === 'devices.changed') {
            this._onDeviceListChanged.fire(params as DeviceInfo[]);
        } else {
            this.outputChannel.appendLine(`[daemon push] ${method}: ${JSON.stringify(params)}`);
        }
    }

    // ------------------------------------------------------------------ //
    //  JSON-RPC call
    // ------------------------------------------------------------------ //

    private async rpc<T>(method: string, params: unknown = {}): Promise<T> {
        await this.ensureRunning();

        return new Promise<T>((resolve, reject) => {
            const id = Math.random().toString(36).slice(2);
            const payload = JSON.stringify({ id, method, params });

            const onMsg = (raw: WebSocket.RawData) => {
                let msg: RpcMessage;
                try {
                    msg = JSON.parse(raw.toString()) as RpcMessage;
                } catch {
                    return;
                }
                if (msg.id !== id) return;
                this.ws?.off('message', onMsg);
                if (msg.error) reject(new Error(msg.error));
                else resolve(msg.result as T);
            };

            if (!this.ws) { reject(new Error('WebSocket not connected')); return; }
            this.ws.on('message', onMsg);
            this.ws.send(payload, (err) => { if (err) reject(err); });
        });
    }

    // ------------------------------------------------------------------ //
    //  Public API
    // ------------------------------------------------------------------ //

    async listDevices(): Promise<DeviceInfo[]> {
        return this.rpc<DeviceInfo[]>('devices.list');
    }

    async listAvds(): Promise<string[]> {
        return this.rpc<string[]>('emulator.listAvds');
    }

    async startEmulator(avdName: string): Promise<void> {
        return this.rpc<void>('emulator.start', { avdName });
    }

    async connectWifi(address: string): Promise<void> {
        return this.rpc<void>('adb.connectWifi', { address });
    }

    async pairDevice(address: string, code: string): Promise<void> {
        return this.rpc<void>('adb.pair', { address, code });
    }

    /**
     * Waits for a newly launched emulator to boot.
     * Pass the serials that existed *before* the emulator was started.
     * Resolves with the new emulator's serial.
     */
    async waitForBoot(knownSerials: string[]): Promise<string> {
        return this.rpc<string>('emulator.waitForBoot', { knownSerials });
    }

    setActiveDevice(serial: string): void {
        this.activeDevice = serial;
        void this.rpc('devices.setActive', { serial });
    }

    getActiveDevice(): string | undefined {
        return this.activeDevice;
    }

    async detectPackage(projectPath: string): Promise<string> {
        return this.rpc<string>('adb.detectPackage', { projectPath });
    }

    /**
     * Derives the Gradle arguments to use for a build.
     * - If `nanoDrift.gradleArgs` contains a non-flag entry (e.g. 'installRelease'),
     *   it is used as-is (full user override).
     * - Otherwise the install task is derived from `nanoDrift.buildVariant`
     *   (default 'debug' → 'installDebug') and any `--flag` entries in
     *   `gradleArgs` are appended.
     */
    private resolveGradleArgs(): string[] {
        const config = vscode.workspace.getConfiguration('nanoDrift');
        const rawArgs = config.get<string[]>('gradleArgs', ['--parallel']);
        const hasExplicitTask = rawArgs.some((a) => !a.startsWith('-'));
        if (hasExplicitTask) return rawArgs;
        const variant = config.get<string>('buildVariant', 'debug');
        const cap = variant.charAt(0).toUpperCase() + variant.slice(1);
        const flags = rawArgs.filter((a) => a.startsWith('-'));
        return [`install${cap}`, ...flags];
    }

    async startWatcher(projectPath: string, packageName?: string): Promise<void> {
        const gradleArgs = this.resolveGradleArgs();
        return this.rpc<void>('watcher.start', { projectPath, packageName, gradleArgs });
    }

    async stopWatcher(projectPath?: string): Promise<void> {
        return this.rpc<void>('watcher.stop', projectPath ? { projectPath } : {});
    }

    async build(projectPath: string, packageName?: string): Promise<BuildError[]> {
        const gradleArgs = this.resolveGradleArgs();
        return this.rpc<BuildError[]>('gradle.build', { projectPath, args: gradleArgs, packageName });
    }

    async deploy(): Promise<void> {
        if (!this.activeDevice) {
            const devices = await this.listDevices();
            if (devices.length === 0) throw new Error('No device connected. Connect a device first.');
            this.activeDevice = devices[0].serial;
        }
        return this.rpc<void>('adb.launch', { serial: this.activeDevice });
    }

    async sendTap(x: number, y: number): Promise<void> {
        return this.rpc<void>('adb.tap', { serial: this.activeDevice, x, y });
    }

    async sendSwipe(x1: number, y1: number, x2: number, y2: number): Promise<void> {
        return this.rpc<void>('adb.swipe', { serial: this.activeDevice, x1, y1, x2, y2 });
    }

    async sendText(text: string): Promise<void> {
        if (!this.activeDevice) return;
        return this.rpc<void>('adb.sendText', { serial: this.activeDevice, text });
    }

    async sendKey(keycode: number): Promise<void> {
        if (!this.activeDevice) return;
        return this.rpc<void>('adb.sendKey', { serial: this.activeDevice, keycode });
    }

    async getScreenSize(serial: string): Promise<{ width: number; height: number }> {
        return this.rpc<{ width: number; height: number }>('screen.getSize', { serial });
    }

    async stop(): Promise<void> {
        this.ws?.close();
        this.ws = undefined;
        this.daemonProcess?.kill();
        this.daemonProcess = undefined;
    }

    dispose(): void {
        void this.stop();
        this._onBuildProgress.dispose();
        this._onDeviceListChanged.dispose();
        this.outputChannel.dispose();
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

