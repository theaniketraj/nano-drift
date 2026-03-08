import * as vscode from 'vscode';
import type { CommandDeps } from './index';

/** Unique panel instance — reuse if already open. */
let activePanel: vscode.WebviewPanel | undefined;

export function showDeviceScreen(
    context: vscode.ExtensionContext,
    deps: CommandDeps
): void {
    if (activePanel) {
        activePanel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'nanoDriftScreen',
        'Device Screen',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );

    activePanel = panel;
    panel.onDidDispose(() => { activePanel = undefined; });

    const config = vscode.workspace.getConfiguration('nanoDrift');
    const daemonPort = config.get<number>('daemonPort', 27183);

    panel.webview.html = buildWebviewHtml(daemonPort);

    panel.webview.onDidReceiveMessage(
        (message: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }) => {
            if (message.type === 'tap' && message.x !== undefined && message.y !== undefined) {
                void deps.daemonClient.sendTap(message.x, message.y);
            } else if (
                message.type === 'swipe' &&
                message.x1 !== undefined && message.y1 !== undefined &&
                message.x2 !== undefined && message.y2 !== undefined
            ) {
                void deps.daemonClient.sendSwipe(message.x1, message.y1, message.x2, message.y2);
            }
        },
        undefined,
        context.subscriptions
    );
}

function buildWebviewHtml(daemonPort: number): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src ws://localhost:${daemonPort};">
    <title>Device Screen — Nano Drift</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #111;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: monospace;
        }
        #device-frame {
            position: relative;
            border: 2px solid #2a2a2a;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 40px rgba(0, 0, 0, 0.7);
        }
        #screen-canvas { display: block; cursor: crosshair; }
        #overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.7);
            color: #777;
            font-size: 13px;
            text-align: center;
            padding: 16px;
            user-select: none;
        }
        #overlay.hidden { display: none; }
    </style>
</head>
<body>
<div id="device-frame">
    <canvas id="screen-canvas" width="393" height="851"></canvas>
    <div id="overlay">Connecting to device…<br><small>Make sure the daemon is running and a device is selected.</small></div>
</div>
<script>
    const vscode = acquireVsCodeApi();
    const canvas = document.getElementById('screen-canvas');
    const ctx    = canvas.getContext('2d');
    const overlay = document.getElementById('overlay');

    let dragStart = null;

    function setStatus(msg) {
        overlay.classList.remove('hidden');
        overlay.innerHTML = msg;
    }
    function clearStatus() {
        overlay.classList.add('hidden');
    }

    // --- Input handling ---
    canvas.addEventListener('mousedown', (e) => {
        dragStart = { x: e.offsetX, y: e.offsetY };
    });
    canvas.addEventListener('mouseup', (e) => {
        if (!dragStart) return;
        const dx = Math.abs(e.offsetX - dragStart.x);
        const dy = Math.abs(e.offsetY - dragStart.y);
        const scale = canvas.width / canvas.getBoundingClientRect().width;
        if (dx < 8 && dy < 8) {
            vscode.postMessage({ type: 'tap', x: Math.round(e.offsetX * scale), y: Math.round(e.offsetY * scale) });
        } else {
            vscode.postMessage({
                type: 'swipe',
                x1: Math.round(dragStart.x * scale), y1: Math.round(dragStart.y * scale),
                x2: Math.round(e.offsetX   * scale), y2: Math.round(e.offsetY   * scale),
            });
        }
        dragStart = null;
    });

    // --- WebSocket frame receiver ---
    let ws;
    function connect() {
        ws = new WebSocket('ws://localhost:${daemonPort}/screen');
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => clearStatus();

        ws.onmessage = (event) => {
            const blob = new Blob([event.data], { type: 'image/png' });
            const url  = URL.createObjectURL(blob);
            const img  = new Image();
            img.onload = () => {
                if (img.width !== canvas.width || img.height !== canvas.height) {
                    canvas.width  = img.width;
                    canvas.height = img.height;
                }
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
            };
            img.src = url;
        };

        ws.onclose = () => {
            setStatus('Connection lost — reconnecting…');
            setTimeout(connect, 2000);
        };

        ws.onerror = () => {
            setStatus('Daemon not reachable.<br>Run <b>Android: Run on the Fly</b> first.');
        };
    }

    connect();
</script>
</body>
</html>`;
}
