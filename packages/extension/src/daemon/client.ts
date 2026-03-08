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

interface RpcMessage {
    id: string;
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

    constructor(context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('nanoDrift');
        this.port = config.get<number>('daemonPort', 27183);
        this.outputChannel = vscode.window.createOutputChannel('Nano Drift');
        context.subscriptions.push(this.outputChannel);
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
                ws.on('message', this.handlePush.bind(this));
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
    //  Push message handler (future: build progress events)
    // ------------------------------------------------------------------ //

    private handlePush(raw: WebSocket.RawData): void {
        try {
            const msg = JSON.parse(raw.toString()) as RpcMessage;
            if (!msg.id) {
                // Push notification from daemon
                this.outputChannel.appendLine(`[daemon push] ${JSON.stringify(msg)}`);
            }
        } catch {
            // ignore malformed frames
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

    setActiveDevice(serial: string): void {
        this.activeDevice = serial;
        void this.rpc('devices.setActive', { serial });
    }

    async build(projectPath: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('nanoDrift');
        const gradleArgs = config.get<string[]>('gradleArgs', ['installDebug', '--parallel']);
        return this.rpc<void>('gradle.build', { projectPath, args: gradleArgs });
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

    async stop(): Promise<void> {
        this.ws?.close();
        this.ws = undefined;
        this.daemonProcess?.kill();
        this.daemonProcess = undefined;
    }

    dispose(): void {
        void this.stop();
        this.outputChannel.dispose();
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
