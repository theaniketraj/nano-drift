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

    const { daemonClient } = deps;
    const config = vscode.workspace.getConfiguration('nanoDrift');
    const daemonPort = config.get<number>('daemonPort', 27183);

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

    panel.webview.html = buildWebviewHtml(daemonPort);

    // Send the current device screen resolution so the canvas sizes correctly
    // before the first frame arrives.
    const serial = daemonClient.getActiveDevice();
    if (serial) {
        daemonClient.getScreenSize(serial).then((size) => {
            void panel.webview.postMessage({ type: 'screenSize', width: size.width, height: size.height });
        }).catch(() => {
            // Device unavailable — webview will resize itself on the first frame
        });
    }

    panel.webview.onDidReceiveMessage(
        (message: {
            type: string;
            x?: number; y?: number;
            x1?: number; y1?: number; x2?: number; y2?: number;
            keycode?: number;
            text?: string;
        }) => {
            switch (message.type) {
                case 'tap':
                    if (message.x !== undefined && message.y !== undefined) {
                        void daemonClient.sendTap(message.x, message.y);
                    }
                    break;
                case 'swipe':
                    if (
                        message.x1 !== undefined && message.y1 !== undefined &&
                        message.x2 !== undefined && message.y2 !== undefined
                    ) {
                        void daemonClient.sendSwipe(message.x1, message.y1, message.x2, message.y2);
                    }
                    break;
                case 'key':
                    if (message.keycode !== undefined) {
                        void daemonClient.sendKey(message.keycode);
                    }
                    break;
                case 'text':
                    if (message.text) {
                        void daemonClient.sendText(message.text);
                    }
                    break;
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
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%; background: #0d0d0d;
      display: flex; flex-direction: column; align-items: center;
      overflow: hidden; user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #screen-area {
      flex: 1; display: flex; align-items: center; justify-content: center;
      width: 100%; min-height: 0; padding: 8px;
    }
    #device-frame {
      position: relative;
      border: 2px solid #252525; border-radius: 12px;
      overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.8);
    }
    #screen-canvas {
      display: block; cursor: crosshair;
      /* CSS dimensions are constrained; pixel dimensions come from the width/height attrs.
         The browser maintains aspect ratio when only one dimension is bounded. */
      max-height: calc(100vh - 96px);
      max-width:  calc(100vw  - 16px);
      width: auto; height: auto;
    }
    /* Swipe feedback overlay — same CSS size as screen-canvas */
    #drag-canvas {
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%; pointer-events: none;
    }
    #overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.78); color: #888;
      font-size: 13px; text-align: center;
      padding: 24px; gap: 8px;
    }
    #overlay.hidden { display: none; }
    #overlay b { color: #bbb; }
    #overlay small { font-size: 11px; color: #555; }
    /* Toolbar */
    #toolbar {
      width: 100%; height: 48px;
      background: #161616; border-top: 1px solid #252525;
      display: flex; align-items: center; justify-content: center;
      gap: 6px; padding: 0 16px; flex-shrink: 0;
    }
    #toolbar button {
      background: #222; border: 1px solid #333; border-radius: 6px;
      color: #aaa; font-size: 13px; cursor: pointer;
      padding: 5px 10px; height: 30px; min-width: 36px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.1s, color 0.1s;
    }
    #toolbar button:hover  { background: #2d2d2d; color: #ddd; }
    #toolbar button:active { background: #3a3a3a; transform: scale(0.95); }
    .tb-sep  { flex: 1; }
    #fps { color: #444; font-size: 11px; font-family: monospace; min-width: 56px; text-align: right; }
  </style>
</head>
<body>
<div id="screen-area">
  <div id="device-frame">
    <canvas id="screen-canvas" width="393" height="851"></canvas>
    <canvas id="drag-canvas"   width="393" height="851"></canvas>
    <div id="overlay">
      <span>Connecting to device&hellip;</span>
      <small>Select a device, then open this panel.</small>
    </div>
  </div>
</div>
<div id="toolbar">
  <button id="btn-back"   title="Back">&#8592; Back</button>
  <button id="btn-home"   title="Home">&#9675; Home</button>
  <button id="btn-recent" title="Recent Apps">&#9776; Apps</button>
  <span class="tb-sep"></span>
  <button id="btn-vup"    title="Volume Up">Vol +</button>
  <button id="btn-vdn"    title="Volume Down">Vol &minus;</button>
  <span class="tb-sep" style="max-width:12px;flex:unset"></span>
  <span id="fps">-- fps</span>
</div>
<script>
(function () {
  'use strict';

  var vscode     = acquireVsCodeApi();
  var canvas     = document.getElementById('screen-canvas');
  var dragCanvas = document.getElementById('drag-canvas');
  var ctx        = canvas.getContext('2d');
  var dctx       = dragCanvas.getContext('2d');
  var overlay    = document.getElementById('overlay');
  var fpsEl      = document.getElementById('fps');

  // ── Overlay ───────────────────────────────────────────────────────────
  function setOverlay(html) {
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function clearOverlay() { overlay.classList.add('hidden'); }

  // ── Canvas resize ─────────────────────────────────────────────────────
  function resizeCanvas(w, h) {
    if (canvas.width === w && canvas.height === h) return;
    canvas.width     = w;  canvas.height     = h;
    dragCanvas.width = w;  dragCanvas.height = h;
  }

  // ── FPS counter ───────────────────────────────────────────────────────
  var lastTs = 0, frameN = 0, fpsSmooth = 0;
  function tickFps() {
    var now = performance.now();
    if (lastTs > 0) {
      var dt = now - lastTs;
      fpsSmooth = fpsSmooth * 0.85 + (1000 / dt) * 0.15;
      if (++frameN % 8 === 0) fpsEl.textContent = fpsSmooth.toFixed(1) + ' fps';
    }
    lastTs = now;
  }

  // ── Frame rendering ───────────────────────────────────────────────────
  function onFrame(data) {
    var blob = new Blob([data], { type: 'image/png' });
    createImageBitmap(blob).then(function (bmp) {
      tickFps();
      resizeCanvas(bmp.width, bmp.height);
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      clearOverlay();
    }).catch(function () {
      // Fallback: Object-URL path for older runtimes
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        tickFps();
        resizeCanvas(img.width, img.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        clearOverlay();
      };
      img.src = url;
    });
  }

  // ── Mouse input ───────────────────────────────────────────────────────
  var dragPt = null;

  function toDevice(e) {
    var r  = canvas.getBoundingClientRect();
    var sx = canvas.width  / r.width;
    var sy = canvas.height / r.height;
    return { x: Math.round((e.clientX - r.left) * sx),
             y: Math.round((e.clientY - r.top)  * sy) };
  }

  canvas.addEventListener('mousedown', function (e) {
    dragPt = toDevice(e);
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', function (e) {
    if (!dragPt) return;
    var cur = toDevice(e);
    dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
    // Swipe line
    dctx.beginPath();
    dctx.moveTo(dragPt.x, dragPt.y);
    dctx.lineTo(cur.x, cur.y);
    dctx.strokeStyle = 'rgba(99,179,237,0.85)';
    dctx.lineWidth   = Math.max(3, dragCanvas.width / 128);
    dctx.lineCap     = 'round';
    dctx.stroke();
    // Endpoint dot
    dctx.beginPath();
    dctx.arc(cur.x, cur.y, Math.max(6, dragCanvas.width / 72), 0, Math.PI * 2);
    dctx.fillStyle = 'rgba(99,179,237,0.65)';
    dctx.fill();
  });

  canvas.addEventListener('mouseup', function (e) {
    if (!dragPt) return;
    dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
    var end = toDevice(e);
    var dx  = end.x - dragPt.x, dy = end.y - dragPt.y;
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
      vscode.postMessage({ type: 'tap', x: end.x, y: end.y });
    } else {
      vscode.postMessage({ type: 'swipe', x1: dragPt.x, y1: dragPt.y, x2: end.x, y2: end.y });
    }
    dragPt = null;
  });

  canvas.addEventListener('mouseleave', function () {
    if (dragPt) {
      dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
      dragPt = null;
    }
  });

  // ── Keyboard input ────────────────────────────────────────────────────
  // Maps JS KeyboardEvent.key → Android keyevent keycode
  var KEYCODES = {
    'Enter':      66,   // KEYCODE_ENTER
    'Backspace':  67,   // KEYCODE_DEL
    'Delete':    112,   // KEYCODE_FORWARD_DEL
    'Tab':        61,   // KEYCODE_TAB
    'Escape':    111,   // KEYCODE_ESCAPE
    'ArrowLeft':  21,   // KEYCODE_DPAD_LEFT
    'ArrowRight': 22,   // KEYCODE_DPAD_RIGHT
    'ArrowUp':    19,   // KEYCODE_DPAD_UP
    'ArrowDown':  20,   // KEYCODE_DPAD_DOWN
    ' ':          62,   // KEYCODE_SPACE (avoids %s encoding quirk in sendText)
  };

  document.addEventListener('keydown', function (e) {
    // Pass through Ctrl/Cmd/Alt combos to VS Code
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var kc = KEYCODES[e.key];
    if (kc !== undefined) {
      e.preventDefault();
      vscode.postMessage({ type: 'key', keycode: kc });
    } else if (e.key.length === 1) {
      e.preventDefault();
      vscode.postMessage({ type: 'text', text: e.key });
    }
  });

  // ── Hardware-key toolbar ──────────────────────────────────────────────
  function hwKey(id, kc) {
    document.getElementById(id).addEventListener('click', function () {
      vscode.postMessage({ type: 'key', keycode: kc });
    });
  }
  hwKey('btn-back',    4);   // KEYCODE_BACK
  hwKey('btn-home',    3);   // KEYCODE_HOME
  hwKey('btn-recent', 187);  // KEYCODE_APP_SWITCH
  hwKey('btn-vup',    24);   // KEYCODE_VOLUME_UP
  hwKey('btn-vdn',    25);   // KEYCODE_VOLUME_DOWN

  // ── Messages from extension (e.g. initial screen size) ───────────────
  window.addEventListener('message', function (ev) {
    var msg = ev.data;
    if (msg && msg.type === 'screenSize') resizeCanvas(msg.width, msg.height);
  });

  // ── WebSocket — binary screen stream on /screen ───────────────────────
  var ws;
  function connect() {
    ws = new WebSocket('ws://localhost:${daemonPort}/screen');
    ws.binaryType = 'arraybuffer';

    ws.onopen = function () {
      setOverlay('<span>Waiting for first frame&hellip;</span><small>Make sure a device is selected.</small>');
    };
    ws.onmessage = function (ev) { onFrame(ev.data); };
    ws.onclose = function () {
      setOverlay('<span>Connection lost &mdash; reconnecting&hellip;</span>');
      setTimeout(connect, 2000);
    };
    ws.onerror = function () {
      setOverlay('<span>Cannot reach daemon.</span><small>Run <b>Android: Run on the Fly</b> first.</small>');
    };
  }
  connect();
}());
</script>
</body>
</html>`;
}
