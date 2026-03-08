import * as http from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { AdbManager } from './adb';
import { GradleRunner } from './gradle';
import { ScreenStreamer } from './screen';

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

/**
 * WebSocket server that exposes two endpoints:
 *   /rpc     — JSON-RPC 2.0-style request/response channel
 *   /screen  — binary frame stream (PNG screenshots)
 */
export class DaemonServer {
    private readonly httpServer: http.Server;
    private readonly wss: WebSocketServer;
    private readonly adb: AdbManager;
    private readonly gradle: GradleRunner;
    private readonly screen: ScreenStreamer;
    private readonly handlers = new Map<string, RpcHandler>();

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
                this.handleRpcClient(ws);
            }
        });
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

        this.reg('adb.launch', (p) => {
            const { serial } = p as { serial: string };
            return this.adb.launch(serial);
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
            const { projectPath, args } = p as { projectPath: string; args: string[] };
            return this.gradle.build(projectPath, args);
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
            this.httpServer.listen(this.port, '127.0.0.1', () => resolve());
            this.httpServer.once('error', reject);
        });
    }

    stop(): void {
        this.screen.stop();
        this.wss.close();
        this.httpServer.close();
    }
}
