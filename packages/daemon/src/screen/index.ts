import { execFile, spawn } from 'child_process';
import * as path from 'path';
import { WebSocket } from 'ws';
import { AdbManager } from '../adb';

function resolveAdbBin(): string {
    const sdk = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
    return sdk
        ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
        : 'adb';
}

/**
 * Streams device screen frames to all connected WebSocket /screen clients.
 *
 * Frame rate is adaptive: the delay to the next capture is calculated as
 * max(0, MIN_INTERVAL_MS - captureMs), capping throughput at ~15 fps while
 * naturally slowing down when the device is slow to respond (back-pressure).
 *
 * Future (Phase 5): replace with H.264 stream from scrcpy / ws-scrcpy.
 */
export class ScreenStreamer {
    private readonly clients = new Set<WebSocket>();
    private tickTimer: ReturnType<typeof setTimeout> | undefined;

    /** Minimum interval between frame captures — caps effective fps at ~15. */
    private static readonly MIN_INTERVAL_MS = 67;

    constructor(private readonly adb: AdbManager) {}

    addClient(ws: WebSocket): void {
        this.clients.add(ws);
        ws.on('close', () => {
            this.clients.delete(ws);
            if (this.clients.size === 0) this.stopCapture();
        });
        if (this.clients.size === 1) this.startCapture();
    }

    private startCapture(): void {
        void this.captureFrame();
    }

    private scheduleNext(captureMs: number): void {
        const delay = Math.max(0, ScreenStreamer.MIN_INTERVAL_MS - captureMs);
        this.tickTimer = setTimeout(() => void this.captureFrame(), delay);
    }

    private async captureFrame(): Promise<void> {
        if (this.clients.size === 0) return;

        const serial = this.adb.getActiveDevice();
        if (!serial) {
            // No device yet — retry in 1 s
            this.tickTimer = setTimeout(() => void this.captureFrame(), 1_000);
            return;
        }

        const t0 = Date.now();
        try {
            const frame = await this.screencap(serial);
            this.broadcast(frame);
        } catch {
            // Device temporarily unavailable; back off
            this.tickTimer = setTimeout(() => void this.captureFrame(), 500);
            return;
        }
        this.scheduleNext(Date.now() - t0);
    }

    private screencap(serial: string): Promise<Buffer> {
        const adbBin = resolveAdbBin();

        return new Promise<Buffer>((resolve, reject) => {
            execFile(
                adbBin,
                ['-s', serial, 'exec-out', 'screencap', '-p'],
                { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
                (err, stdout) => {
                    if (err) { reject(err); return; }
                    if (!stdout || stdout.length === 0) {
                        reject(new Error('Empty screencap output')); return;
                    }
                    resolve(stdout as unknown as Buffer);
                }
            );
        });
    }

    private broadcast(frame: Buffer): void {
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(frame);
            }
        }
    }

    private stopCapture(): void {
        if (this.tickTimer !== undefined) {
            clearTimeout(this.tickTimer);
            this.tickTimer = undefined;
        }
    }

    stop(): void {
        this.stopCapture();
        this.clients.clear();
    }
}

/**
 * Experimental H.264 stream via `adb exec-out screenrecord --output-format=h264 -`.
 * This keeps the same /screen transport model while reducing host CPU vs PNG snapshots.
 */
export class H264ScreenStreamer {
    private readonly clients = new Set<WebSocket>();
    private captureProcess: ReturnType<typeof spawn> | undefined;
    private restartTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly adb: AdbManager) {}

    addClient(ws: WebSocket): void {
        this.clients.add(ws);
        ws.on('close', () => {
            this.clients.delete(ws);
            if (this.clients.size === 0) this.stopCapture();
        });
        if (this.clients.size === 1) this.startCapture();
    }

    private startCapture(): void {
        if (this.captureProcess || this.clients.size === 0) return;

        const serial = this.adb.getActiveDevice();
        if (!serial) {
            this.restartTimer = setTimeout(() => this.startCapture(), 1_000);
            return;
        }

        const adbBin = resolveAdbBin();
        const child = spawn(adbBin, ['-s', serial, 'exec-out', 'screenrecord', '--output-format=h264', '-'], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.captureProcess = child;

        child.stdout?.on('data', (chunk: Buffer) => {
            for (const client of this.clients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(chunk);
                }
            }
        });

        child.on('close', () => {
            this.captureProcess = undefined;
            if (this.clients.size > 0) {
                this.restartTimer = setTimeout(() => this.startCapture(), 1_000);
            }
        });

        child.on('error', () => {
            this.captureProcess = undefined;
            if (this.clients.size > 0) {
                this.restartTimer = setTimeout(() => this.startCapture(), 1_500);
            }
        });
    }

    private stopCapture(): void {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = undefined;
        }
        this.captureProcess?.kill();
        this.captureProcess = undefined;
    }

    stop(): void {
        this.stopCapture();
        this.clients.clear();
    }
}

