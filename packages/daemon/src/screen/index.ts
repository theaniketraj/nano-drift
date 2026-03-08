import { execFile } from 'child_process';
import * as path from 'path';
import { WebSocket } from 'ws';
import { AdbManager } from '../adb';

/**
 * Streams device screen frames to all connected WebSocket /screen clients.
 *
 * Strategy (Phase 0/1): JPEG/PNG snapshots via `adb exec-out screencap -p`.
 * ~100 ms interval → ~10 fps, zero external binary dependencies.
 *
 * Future (Phase 5): replace with H.264 stream from scrcpy / ws-scrcpy.
 */
export class ScreenStreamer {
    private readonly clients = new Set<WebSocket>();
    private tickInterval: ReturnType<typeof setInterval> | undefined;
    private capturing = false;

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
        this.tickInterval = setInterval(() => {
            void this.captureFrame();
        }, 100);
    }

    private async captureFrame(): Promise<void> {
        if (this.capturing) return;
        const serial = this.adb.getActiveDevice();
        if (!serial || this.clients.size === 0) return;

        this.capturing = true;
        try {
            const frame = await this.screencap(serial);
            this.broadcast(frame);
        } catch {
            // Device may be temporarily unavailable; skip this frame
        } finally {
            this.capturing = false;
        }
    }

    private screencap(serial: string): Promise<Buffer> {
        const sdk = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
        const adbBin = sdk
            ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
            : 'adb';

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
        if (this.tickInterval !== undefined) {
            clearInterval(this.tickInterval);
            this.tickInterval = undefined;
        }
    }

    stop(): void {
        this.stopCapture();
        this.clients.clear();
    }
}
