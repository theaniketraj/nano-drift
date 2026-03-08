import * as http from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { AdbManager, DeviceInfo } from './adb';
import { GradleRunner, BuildError } from './gradle';
import { ScreenStreamer } from './screen';
import { FileWatcher } from './watcher';

type RpcHandler = (params: unknown) => Promise<unknown>;

interface RpcRequest {
    id: string;
    method: string;
    params?: unknown;
}

interface RpcResponse {
    id: string;
    result?: unknown;
    error?: string;
}

export interface WatcherOptions {
    projectPath: string;
    packageName?: string;
    gradleArgs: string[];
}

/**
 * WebSocket server that exposes two endpoints:
 *   /rpc     — JSON-RPC request/response channel + push notifications
 *   /screen  — binary frame stream (PNG screenshots)
 */
export class DaemonServer {
    private readonly httpServer: http.Server;
    private readonly wss: WebSocketServer;
    private readonly adb: AdbManager;
    private readonly gradle: GradleRunner;
    private readonly screen: ScreenStreamer;
    private readonly handlers = new Map<string, RpcHandler>();

    /** All open RPC WebSocket connections — used for push broadcasts. */
    private readonly rpcClients = new Set<WebSocket>();

    /** Per-project watcher instances (supports multi-root workspaces). */
    private readonly watchers = new Map<string, FileWatcher>();
    /** Per-project watcher options. */
    private readonly watcherOptionsMap = new Map<string, WatcherOptions>();
    /** Per-project build-in-progress flags. */
    private readonly buildInProgress = new Map<string, boolean>();
    /** Per-project debounce timers. */
    private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    /** Device list polling (every 3 s) for plug/unplug detection. */
    private devicePollInterval: ReturnType<typeof setInterval> | undefined;
    private cachedDeviceSerials: string[] = [];

    constructor(private readonly port: number) {
        this.httpServer = http.createServer();
        this.wss = new WebSocketServer({ server: this.httpServer });
        this.adb = new AdbManager();
        this.gradle = new GradleRunner();
        this.screen = new ScreenStreamer(this.adb);

        this.registerHandlers();

        this.wss.on('connection', (ws, req) => {
            const url = req.url ?? '/';
            if (url.startsWith('/screen')) {
                this.screen.addClient(ws);
            } else {
                this.rpcClients.add(ws);
                ws.on('close', () => this.rpcClients.delete(ws));
                this.handleRpcClient(ws);
            }
        });
    }

    // ------------------------------------------------------------------ //
    //  Push broadcast
    // ------------------------------------------------------------------ //

    push(method: string, params: unknown): void {
        const frame = JSON.stringify({ method, params });
        for (const client of this.rpcClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(frame);
            }
        }
    }

    // ------------------------------------------------------------------ //
    //  Device list polling (plug/unplug detection)
    // ------------------------------------------------------------------ //

    private startDevicePolling(): void {
        this.devicePollInterval = setInterval(() => {
            void (async () => {
                try {
                    const devices: DeviceInfo[] = await this.adb.listDevices();
                    const serials = devices.map((d) => d.serial).sort();
                    const prev = this.cachedDeviceSerials;
                    if (JSON.stringify(serials) !== JSON.stringify(prev)) {
                        this.cachedDeviceSerials = serials;
                        this.push('devices.changed', devices);
                    }
                } catch {
                    // adb not available yet — ignore silently
                }
            })();
        }, 3_000);
    }

    // ------------------------------------------------------------------ //
    //  Auto build-deploy cycle (triggered by file watcher)
    // ------------------------------------------------------------------ //

    private scheduleAutoBuild(opts: WatcherOptions): void {
        const key = opts.projectPath;
        const existing = this.debounceTimers.get(key);
        if (existing !== undefined) clearTimeout(existing);
        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            void this.runBuildCycle(opts);
        }, 300);
        this.debounceTimers.set(key, timer);
    }

    private async runBuildCycle(opts: WatcherOptions): Promise<void> {
        const key = opts.projectPath;
        if (this.buildInProgress.get(key)) return;
        this.buildInProgress.set(key, true);

        try {
            this.push('build.progress', { stage: 'building', projectPath: opts.projectPath });
            console.log(`[nano-drift-daemon] Build started: ${opts.projectPath}`);

            const errors = await this.gradle.build(
                opts.projectPath,
                opts.gradleArgs,
                (line) => this.push('build.progress', { stage: 'output', line })
            );

            this.push('build.progress', { stage: 'deploying' });
            console.log('[nano-drift-daemon] Deploying…');

            const serial =
                this.adb.getActiveDevice() ??
                await this.adb.firstOnlineDevice();

            if (!serial) throw new Error('No device available for deployment.');

            await this.adb.launch(serial, opts.packageName);

            this.push('build.progress', { stage: 'done', errors });
            console.log('[nano-drift-daemon] Deployed successfully.');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const buildErrors: BuildError[] =
                (err as { buildErrors?: BuildError[] }).buildErrors ?? [];
            this.push('build.progress', { stage: 'error', message, errors: buildErrors });
            console.error('[nano-drift-daemon] Build failed:', message);
        } finally {
            this.buildInProgress.set(key, false);
        }
    }

    // ------------------------------------------------------------------ //
    //  RPC handler registration
    // ------------------------------------------------------------------ //

    private reg(method: string, fn: RpcHandler): void {
        this.handlers.set(method, fn);
    }

    private registerHandlers(): void {
        this.reg('devices.list', () => this.adb.listDevices());

        this.reg('devices.setActive', (p) => {
            const { serial } = p as { serial: string };
            this.adb.setActiveDevice(serial);
            return Promise.resolve(null);
        });

        this.reg('emulator.listAvds', () => this.adb.listAvds());

        this.reg('emulator.start', (p) => {
            const { avdName } = p as { avdName: string };
            return this.adb.startEmulator(avdName);
        });

        this.reg('adb.connectWifi', (p) => {
            const { address } = p as { address: string };
            return this.adb.connectWifi(address);
        });

        this.reg('adb.pair', (p) => {
            const { address, code } = p as { address: string; code: string };
            return this.adb.pairDevice(address, code);
        });

        this.reg('emulator.waitForBoot', (p) => {
            const { knownSerials } = p as { knownSerials: string[] };
            return this.adb.waitForBoot(knownSerials);
        });

        this.reg('screen.getSize', (p) => {
            const { serial } = p as { serial: string };
            return this.adb.getScreenSize(serial);
        });

        this.reg('adb.sendText', (p) => {
            const { serial, text } = p as { serial: string; text: string };
            return this.adb.sendText(serial, text);
        });

        this.reg('adb.sendKey', (p) => {
            const { serial, keycode } = p as { serial: string; keycode: number };
            return this.adb.sendKey(serial, keycode);
        });

        this.reg('adb.launch', (p) => {
            const { serial, packageName } = p as { serial: string; packageName?: string };
            return this.adb.launch(serial, packageName);
        });

        this.reg('adb.tap', (p) => {
            const { serial, x, y } = p as { serial: string; x: number; y: number };
            return this.adb.tap(serial, x, y);
        });

        this.reg('adb.swipe', (p) => {
            const { serial, x1, y1, x2, y2 } = p as {
                serial: string; x1: number; y1: number; x2: number; y2: number;
            };
            return this.adb.swipe(serial, x1, y1, x2, y2);
        });

        this.reg('gradle.build', (p) => {
            const { projectPath, args, packageName } = p as {
                projectPath: string;
                args: string[];
                packageName?: string;
            };
            return this.gradle
                .build(projectPath, args, (line) =>
                    this.push('build.progress', { stage: 'output', line })
                )
                .then(async (errors) => {
                    // Auto-launch after a manual build too
                    const serial =
                        this.adb.getActiveDevice() ??
                        await this.adb.firstOnlineDevice();
                    if (serial) {
                        await this.adb.launch(serial, packageName);
                    }
                    return errors;
                });
        });

        this.reg('watcher.start', (p) => {
            const { projectPath, packageName, gradleArgs } = p as {
                projectPath: string;
                packageName?: string;
                gradleArgs?: string[];
            };
            const opts: WatcherOptions = {
                projectPath,
                packageName,
                gradleArgs: gradleArgs ?? ['installDebug', '--parallel'],
            };
            // Stop existing watcher for this path before replacing it.
            const existing = this.watchers.get(projectPath);
            if (existing) { existing.stop(); this.watchers.delete(projectPath); }
            const w = new FileWatcher();
            w.watch(projectPath, () => this.scheduleAutoBuild(opts));
            this.watchers.set(projectPath, w);
            this.watcherOptionsMap.set(projectPath, opts);
            console.log(`[nano-drift-daemon] Watching ${projectPath}`);
            return Promise.resolve(null);
        });

        this.reg('watcher.stop', (p) => {
            const { projectPath } = p as { projectPath?: string };
            if (projectPath) {
                const w = this.watchers.get(projectPath);
                if (w) { w.stop(); this.watchers.delete(projectPath); }
                this.watcherOptionsMap.delete(projectPath);
                const t = this.debounceTimers.get(projectPath);
                if (t !== undefined) { clearTimeout(t); this.debounceTimers.delete(projectPath); }
                console.log(`[nano-drift-daemon] Watcher stopped for ${projectPath}`);
            } else {
                this.stopAllWatchers();
                console.log('[nano-drift-daemon] All watchers stopped.');
            }
            return Promise.resolve(null);
        });

        this.reg('adb.detectPackage', (p) => {
            const { projectPath } = p as { projectPath: string };
            return this.adb.detectPackage(projectPath);
        });
    }

    // ------------------------------------------------------------------ //
    //  RPC client connection
    // ------------------------------------------------------------------ //

    private handleRpcClient(ws: WebSocket): void {
        ws.on('message', (raw: RawData) => {
            void this.dispatch(ws, raw);
        });
    }

    private async dispatch(ws: WebSocket, raw: RawData): Promise<void> {
        let id = '__unknown__';
        try {
            const req = JSON.parse(raw.toString()) as RpcRequest;
            id = req.id;

            const handler = this.handlers.get(req.method);
            if (!handler) {
                this.respond(ws, { id, error: `Unknown method: ${req.method}` });
                return;
            }

            const result = await handler(req.params ?? {});
            this.respond(ws, { id, result });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.respond(ws, { id, error: message });
        }
    }

    private respond(ws: WebSocket, msg: RpcResponse): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }

    // ------------------------------------------------------------------ //
    //  Lifecycle
    // ------------------------------------------------------------------ //

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.httpServer.listen(this.port, '127.0.0.1', () => {
                this.startDevicePolling();
                resolve();
            });
            this.httpServer.once('error', reject);
        });
    }

    private stopAllWatchers(): void {
        for (const t of this.debounceTimers.values()) clearTimeout(t);
        this.debounceTimers.clear();
        for (const w of this.watchers.values()) w.stop();
        this.watchers.clear();
        this.watcherOptionsMap.clear();
    }

    stop(): void {
        if (this.devicePollInterval !== undefined) {
            clearInterval(this.devicePollInterval);
            this.devicePollInterval = undefined;
        }
        this.stopAllWatchers();
        this.screen.stop();
        this.wss.close();
        this.httpServer.close();
    }
}

