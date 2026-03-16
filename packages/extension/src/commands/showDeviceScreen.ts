import * as vscode from 'vscode';
import type { CommandDeps } from './index';

export class DeviceScreenViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'nanoDrift.deviceScreenView';

    private _view?: vscode.WebviewView;
    private readonly _deps: CommandDeps;
    private readonly _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, deps: CommandDeps) {
        this._context = context;
        this._deps = deps;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _ctx: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        const { daemonClient } = this._deps;
        const config = vscode.workspace.getConfiguration('nanoDrift');
        const daemonPort = config.get<number>('daemonPort', 27183);
        const streamCodec = config.get<'png' | 'h264'>('streamCodec', 'png');

        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = buildWebviewHtml(daemonPort, streamCodec);

        // Send the current device screen resolution so the canvas sizes correctly
        // before the first frame arrives.
        const serial = daemonClient.getActiveDevice();
        if (serial) {
            void webviewView.webview.postMessage({ type: 'deviceName', name: serial });
            daemonClient.getScreenSize(serial).then((size) => {
                void webviewView.webview.postMessage({ type: 'screenSize', width: size.width, height: size.height });
            }).catch(() => {
                // Device unavailable — webview will resize itself on the first frame
            });
        }

        webviewView.webview.onDidReceiveMessage(
            (message: {
                type: string;
                x?: number; y?: number;
                x1?: number; y1?: number; x2?: number; y2?: number;
                duration?: number;
                keycode?: number;
                text?: string;
                url?: string;
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
                            void daemonClient.sendSwipe(message.x1, message.y1, message.x2, message.y2, message.duration);
                        }
                        break;
                    case 'key':
                      if (message.keycode !== undefined) {
                        daemonClient.sendKey(message.keycode).catch(() => undefined);
                      }
                      break;
                    case 'text':
                      if (message.text) {
                        daemonClient.sendText(message.text).catch(() => undefined);
                      }
                      break;
                    case 'openUrl':
                        if (typeof message.url === 'string') {
                            void vscode.env.openExternal(vscode.Uri.parse(message.url, true));
                        }
                        break;
                    case 'openSettings':
                        void vscode.commands.executeCommand(
                            'workbench.action.openSettings',
                            'nanoDrift'
                        );
                        break;
                    case 'runOnTheFly':
                        void vscode.commands.executeCommand('nanoDrift.runOnTheFly');
                        break;
                  case 'screenshot': {
                    void (async () => {
                      try {
                        const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
                        if (!folder) {
                          void webviewView.webview.postMessage({
                            type: 'toast',
                            level: 'error',
                            text: 'Open a workspace folder to save screenshots.'
                          });
                          return;
                        }

                        const pngBase64 = await daemonClient.screenshot();
                        const buf = Buffer.from(pngBase64, 'base64');
                        const ts = new Date().toISOString().split(':').join('-').split('.').join('-');
                        const screenshotsDir = vscode.Uri.joinPath(folder, '.nano-drift', 'screenshots');
                        await vscode.workspace.fs.createDirectory(screenshotsDir);
                        const fileName = `screenshot-${ts}.png`;
                        const outUri = vscode.Uri.joinPath(screenshotsDir, fileName);
                        await vscode.workspace.fs.writeFile(outUri, new Uint8Array(buf));
                        void webviewView.webview.postMessage({
                          type: 'toast',
                          level: 'success',
                          text: `Saved ${fileName}`
                        });
                        const choice = await vscode.window.showInformationMessage(
                          `Screenshot saved: .nano-drift/screenshots/${fileName}`,
                          'Open'
                        );
                        if (choice === 'Open') {
                          void vscode.commands.executeCommand('vscode.open', outUri);
                        }
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        void webviewView.webview.postMessage({ type: 'toast', level: 'error', text: `Screenshot failed: ${msg}` });
                        void vscode.window.showErrorMessage(`Screenshot failed: ${msg}`);
                      }
                    })();
                    break;
                  }
                  case 'rotate':
                    daemonClient.rotate()
                      .then(() => webviewView.webview.postMessage({
                        type: 'toast',
                        level: 'success',
                        text: 'Rotation toggled.'
                      }))
                      .catch((err: unknown) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        void webviewView.webview.postMessage({ type: 'toast', level: 'error', text: `Rotate failed: ${msg}` });
                        void vscode.window.showErrorMessage(
                          `Rotate failed: ${msg}`
                        );
                      });
                    break;
                  case 'killApp': {
                    void (async () => {
                      try {
                        let pkg = vscode.workspace.getConfiguration('nanoDrift').get<string>('packageName', '').trim();
                        if (!pkg) {
                          const folderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                          if (folderPath) {
                            pkg = await daemonClient.detectPackage(folderPath);
                          }
                        }
                        if (!pkg) {
                          void vscode.window.showWarningMessage('Set "nanoDrift.packageName" in settings to use Kill App.');
                          void webviewView.webview.postMessage({
                            type: 'toast',
                            level: 'error',
                            text: 'Set nanoDrift.packageName to use Kill App.'
                          });
                          return;
                        }
                        await daemonClient.forceStop(pkg);
                        void webviewView.webview.postMessage({
                          type: 'toast',
                          level: 'success',
                          text: `Force-stopped ${pkg}`
                        });
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        void webviewView.webview.postMessage({ type: 'toast', level: 'error', text: `Kill failed: ${msg}` });
                        void vscode.window.showErrorMessage(
                          `Kill failed: ${msg}`
                        );
                      }
                    })();
                    break;
                  }
                }
            },
            undefined,
            this._context.subscriptions
        );
    }

    /** Post a message into the live view (e.g. screenSize updates). */
    public postMessage(msg: unknown): void {
        void this._view?.webview.postMessage(msg);
    }
}

function buildWebviewHtml(daemonPort: number, streamCodec: 'png' | 'h264'): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src ws://localhost:${daemonPort};">
  <title>Device Screen — Nano Drift</title>
  <style>
    /* ── RESET + LAYOUT ─────────────────────────────────────────────── */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      background: transparent;
      display: flex; flex-direction: column;
      overflow: hidden; user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    /* ── HEADER ─────────────────────────────────────────────────────── */
    #header {
      height: 48px; flex-shrink: 0;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-panel-border));
      display: flex; align-items: center; padding: 0 14px; gap: 10px;
    }
    #header-left  { display: flex; align-items: center; gap: 7px; }
    #header-logo  { height: 20px; opacity: 0.85; display: block; }
    #header-title {
      font-size: 13px; font-weight: 600; letter-spacing: 0.04em;
      color: var(--vscode-foreground); white-space: nowrap;
    }
    #header-centre {
      flex: 1; display: flex; align-items: center; justify-content: center;
      gap: 8px; min-width: 0;
    }
    #device-name {
      font-size: 12px; color: var(--vscode-descriptionForeground);
      max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #state-badge {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: var(--vscode-descriptionForeground);
    }
    #badge-dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      background: #555;
    }
    #header-right { display: flex; align-items: center; gap: 2px; }
    #fps-display {
      font-size: 11px; font-family: 'SF Mono','Cascadia Code','Consolas',monospace;
      color: var(--vscode-descriptionForeground);
      min-width: 56px; text-align: right; padding-right: 6px;
      display: none;
    }
    .icon-btn {
      background: none; border: none; cursor: pointer; border-radius: 5px;
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      color: var(--vscode-icon-foreground); opacity: 0.7;
      transition: opacity 0.15s, background 0.15s;
    }
    .icon-btn:hover  { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
    .icon-btn:active { background: var(--vscode-toolbar-activeBackground); }

    /* ── SCREEN AREA ────────────────────────────────────────────────── */
    #screen-area {
      flex: 1; display: flex; align-items: center; justify-content: center;
      width: 100%; min-height: 0; padding: 12px;
      background: transparent;
    }

    /* ── PHONE FRAME (Tier 2 — physical chassis) ─────────────────────
       --bezel-bg / --bezel-side-btn are intentionally hardcoded material
       tokens. They represent anodised aluminium, not a UI surface.      */
    :root { --bezel-bg: #1a1a1c; --bezel-side-btn: #2a2a2c; }
    body.vscode-light { --bezel-bg: #c8c8cc; --bezel-side-btn: #adadb0; }
    body.vscode-high-contrast { --bezel-bg: #000; --bezel-side-btn: #444; }

    #phone-outer {
      position: relative;
      background: var(--bezel-bg);
      border-radius: 38px;
      padding: 5px 7px 8px;
      box-shadow:
        0 0 0 1px rgba(255,255,255,0.06),
        0 20px 60px rgba(0,0,0,0.7),
        inset 0 1px 0 rgba(255,255,255,0.08);
      display: flex; flex-direction: column; align-items: center;
      transition: border-radius 0.3s ease, padding 0.3s ease;
    }
    #phone-top {
      width: 100%; height: 5px;
      display: flex; align-items: center; justify-content: center;
    }
    #front-cam {
      /* Under-display camera — not visible */
      display: none;
    }

    /* ── SCREEN WRAP (Tier 3 — device screen surface) ────────────────
       background: #000 is hardcoded intentionally. The device screen is
       a self-contained universe — any Android app (any colours, any
       design) renders inside it. It must never inherit the VS Code theme
       so that neither light nor dark themes contaminate the app under
       test. Black is the screen-off baseline before the first frame.     */
    #screen-wrap {
      position: relative;
      background: #000;
      border-radius: 32px;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.5);
      transition: border-radius 0.3s ease;
    }
    #screen-canvas {
      display: block; cursor: crosshair;
      max-height: calc(100vh - 108px);
      max-width:  calc(100vw - 32px);
      width: auto; height: auto;
    }
    #drag-canvas {
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%; pointer-events: none;
    }

    /* ── OVERLAY (inside screen-wrap, over the canvas) ──────────────── */
    #overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 10px; padding: 24px; text-align: center;
      transition: opacity 0.2s ease;
    }
    #overlay.hidden { display: none; }
    #overlay-icon { font-size: 32px; line-height: 1; }
    #overlay-text {
      font-size: 13px; font-weight: 500;
      color: #ccc;
    }
    #overlay-sub { font-size: 11px; color: #666; }
    .spinner {
      width: 28px; height: 28px; border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.08);
      border-top-color: var(--vscode-progressBar-background, #007acc);
      animation: spin 0.75s linear infinite;
    }

    /* ── TOAST ───────────────────────────────────────────────────────── */
    #toast {
      position: absolute;
      right: 16px;
      bottom: 44px;
      max-width: min(320px, calc(100vw - 32px));
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: var(--vscode-notifications-background, rgba(20,20,20,0.96));
      color: var(--vscode-foreground);
      font-size: 12px;
      line-height: 1.45;
      box-shadow: 0 10px 28px rgba(0,0,0,0.28);
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
      transition: opacity 0.18s ease, transform 0.18s ease;
      z-index: 30;
    }
    #toast.show { opacity: 1; transform: translateY(0); }
    #toast.toast-success {
      border-color: rgba(76,175,80,0.45);
      background: color-mix(in srgb, var(--vscode-sideBar-background) 78%, #1d4d24 22%);
    }
    #toast.toast-error {
      border-color: rgba(224,82,82,0.45);
      background: color-mix(in srgb, var(--vscode-sideBar-background) 78%, #5a1d1d 22%);
    }

    /* ── PHONE BOTTOM CHROME ─────────────────────────────────────────── */
    #phone-bottom {
      width: 100%; height: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    #home-pill {
      width: 32%; height: 4px; border-radius: 2px;
      background: rgba(255,255,255,0.18);
    }

    /* ── SIDE BUTTONS (absolutely positioned on chassis) ────────────── */
    #btn-power, #btn-vol-up, #btn-vol-dn {
      position: absolute; right: -4px; width: 4px;
      border-radius: 2px 0 0 2px;
      background: var(--bezel-side-btn);
      box-shadow: inset -1px 0 0 rgba(0,0,0,0.5);
      cursor: pointer; transition: transform 0.08s;
    }
    #btn-power:active, #btn-vol-up:active, #btn-vol-dn:active { transform: scaleX(1.5); }
    #btn-power  { top: 22%; height: 32px; }
    #btn-vol-up { top: 38%; height: 26px; }
    #btn-vol-dn { top: 46%; height: 26px; }

    /* ── TOOLBOX ─────────────────────────────────────────────────────── */
    #toolbox { width: 100%; flex-shrink: 0; }
    #toolbox-handle {
      height: 32px; width: 100%;
      background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background));
      border-top: 1px solid var(--vscode-panel-border);
      display: flex; align-items: center; padding: 0 14px; gap: 8px;
      cursor: pointer; user-select: none;
    }
    #toolbox-chevron {
      color: var(--vscode-icon-foreground); opacity: 0.6;
      font-size: 10px; transition: transform 0.22s ease;
      display: flex; align-items: center;
    }
    #toolbox.open #toolbox-chevron { transform: rotate(180deg); }
    #toolbox-label {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
      color: var(--vscode-descriptionForeground);
    }
    #toolbox-body {
      overflow: hidden; max-height: 0;
      transition: max-height 0.22s ease;
      background: var(--vscode-sideBar-background);
    }
    #toolbox.open #toolbox-body { max-height: 200px; }
    #toolbox-inner {
      display: flex; gap: 10px; padding: 10px 14px;
      overflow-x: auto; overflow-y: hidden;
    }
    #toolbox-inner::-webkit-scrollbar { height: 4px; }
    #toolbox-inner::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 2px; }
    .tb-group {
      flex-shrink: 0; min-width: 140px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .tb-group-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground); opacity: 0.7;
    }
    .tb-row { display: flex; gap: 5px; flex-wrap: wrap; }
    .tb-btn {
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 5px; color: var(--vscode-button-secondaryForeground);
      font-size: 12px; cursor: pointer; padding: 4px 9px; height: 26px;
      display: flex; align-items: center; gap: 4px; white-space: nowrap;
      transition: background 0.12s;
    }
    .tb-btn:hover  { background: var(--vscode-button-secondaryHoverBackground); }
    .tb-btn:active { transform: scale(0.96); }
    #text-input {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px; color: var(--vscode-input-foreground);
      font-size: 12px; padding: 3px 7px; height: 26px;
      outline: none; width: 130px;
    }
    #text-input:focus { border-color: var(--vscode-focusBorder); }

    /* ── RESPONSIVE FRAME TIERS ─────────────────────────────────────── */
    /* phone (< 480px) — default, already set above */
    body.frame-phone #screen-canvas  { max-height: calc(100vh - 108px); }

    /* tablet (480–799px) */
    body.frame-tablet #phone-outer   { border-radius: 20px; padding: 5px 14px 6px; }
    body.frame-tablet #phone-top     { height: 5px; }
    body.frame-tablet #phone-bottom  { height: 12px; }
    body.frame-tablet #home-pill     { opacity: 0; }
    body.frame-tablet #screen-wrap   { border-radius: 16px; }
    body.frame-tablet #btn-power,
    body.frame-tablet #btn-vol-up,
    body.frame-tablet #btn-vol-dn    { display: none; }
    body.frame-tablet #screen-canvas { max-height: calc(100vh - 104px); }

    /* laptop (800–1199px) */
    body.frame-laptop #phone-outer  { border-radius: 8px 8px 0 0; padding: 4px 8px 0; }
    body.frame-laptop #phone-top    { height: 4px; }
    body.frame-laptop #phone-bottom {
      height: 22px;
      background: color-mix(in srgb, var(--bezel-bg) 80%, #000 20%);
      box-shadow: inset 0 4px 10px rgba(0,0,0,0.5);
    }
    body.frame-laptop #home-pill    { opacity: 0; }
    body.frame-laptop #screen-wrap  { border-radius: 5px; }
    body.frame-laptop #front-cam    { display: none; }
    body.frame-laptop #btn-power,
    body.frame-laptop #btn-vol-up,
    body.frame-laptop #btn-vol-dn   { display: none; }
    body.frame-laptop #screen-canvas { max-height: calc(100vh - 100px); }

    /* desktop (≥ 1200px) */
    body.frame-desktop #phone-outer  { border-radius: 6px 6px 0 0; padding: 3px 6px 0; }
    body.frame-desktop #phone-top    { height: 3px; }
    body.frame-desktop #phone-bottom {
      height: 30px; background: var(--bezel-bg);
      display: flex; justify-content: center; align-items: flex-end; padding-bottom: 4px;
    }
    body.frame-desktop #home-pill {
      width: 18%; height: 24px; border-radius: 2px;
      background: color-mix(in srgb, var(--bezel-bg) 60%, #000 40%);
    }
    body.frame-desktop #screen-wrap  { border-radius: 4px; }
    body.frame-desktop #front-cam   { display: none; }
    body.frame-desktop #btn-power,
    body.frame-desktop #btn-vol-up,
    body.frame-desktop #btn-vol-dn  { display: none; }
    body.frame-desktop #screen-canvas { max-height: calc(100vh - 94px); }

    /* Reduce canvas when toolbox is open (all tiers) */
    body.toolbox-open #screen-canvas { max-height: calc(100vh - 290px); }

    /* ── ANIMATIONS ─────────────────────────────────────────────────── */
    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
    .badge-pulsing { animation: pulse 1.2s ease-in-out infinite; }
  </style>
</head>
<body class="frame-phone">

<!-- ── HEADER ──────────────────────────────────────────────────────── -->
<div id="header">
  <div id="header-left">
    <svg id="header-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" opacity="0.15"/>
      <path d="M7 17V7l10 10V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span id="header-title">nano drift</span>
  </div>
  <div id="header-centre">
    <span id="device-name">No device</span>
    <div id="state-badge">
      <div id="badge-dot"></div>
      <span id="badge-label">Idle</span>
    </div>
  </div>
  <div id="header-right">
    <span id="fps-display">-- fps</span>
    <!-- GitHub icon -->
    <button class="icon-btn" id="btn-github" title="View on GitHub" aria-label="View on GitHub">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    </button>
    <!-- Toolbox toggle -->
    <button class="icon-btn" id="btn-toolbox-toggle" title="Toggle Controls" aria-label="Toggle Controls">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    </button>
    <!-- Settings -->
    <button class="icon-btn" id="btn-settings" title="Settings" aria-label="Settings">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>
</div>

<!-- ── SCREEN AREA ──────────────────────────────────────────────────── -->
<div id="screen-area">
  <div id="phone-outer">
    <!-- top chrome: punch-hole camera -->
    <div id="phone-top"><div id="front-cam"></div></div>

    <!-- Tier 3: device screen — isolated from VS Code theme -->
    <div id="screen-wrap">
      <canvas id="screen-canvas" width="393" height="851"></canvas>
      <canvas id="drag-canvas"   width="393" height="851"></canvas>
      <div id="overlay">
        <div id="overlay-icon"></div>
        <div id="overlay-text">No device selected</div>
        <div id="overlay-sub">Use the status bar to pick a device.</div>
      </div>
    </div>

    <!-- bottom chrome: home pill / hinge -->
    <div id="phone-bottom"><div id="home-pill"></div></div>

    <!-- side buttons -->
    <div id="btn-power"   title="Power"></div>
    <div id="btn-vol-up"  title="Volume Up"></div>
    <div id="btn-vol-dn"  title="Volume Down"></div>
  </div>
</div>

<!-- ── TOOLBOX ──────────────────────────────────────────────────────── -->
<div id="toolbox">
  <div id="toolbox-handle">
    <span id="toolbox-chevron">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <polyline points="2,4 6,8 10,4"/>
      </svg>
    </span>
    <span id="toolbox-label">Controls</span>
  </div>
  <div id="toolbox-body">
    <div id="toolbox-inner">

      <!-- Navigation group -->
      <div class="tb-group" id="tb-nav">
        <div class="tb-group-label">Navigation</div>
        <div class="tb-row">
          <button class="tb-btn" id="tbk-back"   title="Back (keycode 4)">&#8592; Back</button>
          <button class="tb-btn" id="tbk-home"   title="Home (keycode 3)">&#8962; Home</button>
          <button class="tb-btn" id="tbk-recent" title="Recent Apps (keycode 187)">&#9776; Apps</button>
        </div>
      </div>

      <!-- System group -->
      <div class="tb-group" id="tb-sys">
        <div class="tb-group-label">System</div>
        <div class="tb-row">
          <button class="tb-btn" id="tbk-screenshot" title="Take screenshot">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="12" cy="12" r="4"/></svg>
            Shot
          </button>
          <button class="tb-btn" id="tbk-rotate" title="Rotate screen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            Rotate
          </button>
          <button class="tb-btn" id="tbk-power" title="Power (keycode 26)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 2v10"/><path d="M5.636 5.636a9 9 0 1 0 12.728 0"/></svg>
            Power
          </button>
          <button class="tb-btn" id="tbk-vup"   title="Volume Up">Vol +</button>
          <button class="tb-btn" id="tbk-vdn"   title="Volume Down">Vol &minus;</button>
        </div>
      </div>

      <!-- Input group -->
      <div class="tb-group" id="tb-input">
        <div class="tb-group-label">Input</div>
        <div class="tb-row">
          <input id="text-input" type="text" placeholder="Send text to device&hellip;" autocomplete="off" spellcheck="false"/>
          <button class="tb-btn" id="tbk-send" title="Send text">&#8594;</button>
        </div>
      </div>

      <!-- Build group -->
      <div class="tb-group" id="tb-build">
        <div class="tb-group-label">Build</div>
        <div class="tb-row">
          <button class="tb-btn" id="tbk-run" title="Run on the Fly">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>
            Run
          </button>
          <button class="tb-btn" id="tbk-kill" title="Force-stop app">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            Kill
          </button>
        </div>
      </div>

    </div>
  </div>
</div>

<div id="toast" aria-live="polite" aria-atomic="true"></div>

<script>
(function () {
  'use strict';

  var vscode     = acquireVsCodeApi();
  var streamCodec = '${streamCodec}';
  var canvas     = document.getElementById('screen-canvas');
  var dragCanvas = document.getElementById('drag-canvas');
  var ctx        = canvas.getContext('2d');
  var dctx       = dragCanvas.getContext('2d');

  // ── STATE MACHINE ─────────────────────────────────────────────────────
  var currentState = 'idle';

  var STATES = {
    idle:         { bg: 'rgba(0,0,0,0.82)', icon: ICON_DEVICE_OFF, text: 'No device selected',        sub: 'Use the status bar to pick a device.', badgeColor: '#555',    badgeLabel: 'Idle',          pulse: false },
    connecting:   { bg: 'rgba(0,0,0,0.82)', icon: ICON_SPINNER,    text: 'Connecting\u2026',           sub: '',                                     badgeColor: '#e8a020', badgeLabel: 'Connecting',    pulse: true  },
    waiting:      { bg: 'rgba(0,0,0,0.6)',  icon: ICON_SPINNER,    text: 'Waiting for first frame\u2026', sub: 'Make sure a device is selected.',   badgeColor: '#e8a020', badgeLabel: 'Connecting',    pulse: true  },
    streaming:    { bg: null,               icon: null,             text: null,                         sub: null,                                   badgeColor: '#4caf50', badgeLabel: null,            pulse: false },
    paused:       { bg: 'rgba(0,0,0,0.65)', icon: ICON_PAUSE,      text: 'Stream paused',              sub: 'Daemon stopped.',                      badgeColor: '#e8a020', badgeLabel: 'Paused',        pulse: false },
    reconnecting: { bg: 'rgba(0,0,0,0.82)', icon: ICON_SPINNER,    text: 'Reconnecting\u2026',         sub: 'Will retry automatically.',            badgeColor: '#e8a020', badgeLabel: 'Reconnecting',  pulse: true  },
    error:        { bg: 'rgba(30,0,0,0.85)',icon: ICON_ERROR,       text: 'Connection error',           sub: 'Run Android: Run on the Fly first.',   badgeColor: '#e05252', badgeLabel: 'Error',         pulse: false },
  };

  function ICON_SPINNER() {
    var d = document.createElement('div');
    d.className = 'spinner';
    return d;
  }
  function ICON_DEVICE_OFF() {
    var s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('width','40'); s.setAttribute('height','40');
    s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
    s.setAttribute('stroke','#555'); s.setAttribute('stroke-width','1.5');
    s.setAttribute('stroke-linecap','round');
    s.innerHTML = '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="2" y1="2" x2="22" y2="22" stroke="#e05252" stroke-width="1.5"/>';
    return s;
  }
  function ICON_PAUSE() {
    var s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('width','36'); s.setAttribute('height','36');
    s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','#888');
    s.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    return s;
  }
  function ICON_ERROR() {
    var s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('width','36'); s.setAttribute('height','36');
    s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('fill','none');
    s.setAttribute('stroke','#e05252'); s.setAttribute('stroke-width','2');
    s.setAttribute('stroke-linecap','round');
    s.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    return s;
  }

  var overlayEl    = document.getElementById('overlay');
  var overlayIcon  = document.getElementById('overlay-icon');
  var overlayText  = document.getElementById('overlay-text');
  var overlaySub   = document.getElementById('overlay-sub');
  var badgeDot     = document.getElementById('badge-dot');
  var badgeLabel   = document.getElementById('badge-label');
  var fpsDisplay   = document.getElementById('fps-display');
  var toastEl      = document.getElementById('toast');
  var toastTimer   = null;

  function showToast(text, level) {
    if (!toastEl) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.className = '';
    toastEl.classList.add('show', level === 'error' ? 'toast-error' : 'toast-success');
    toastTimer = setTimeout(function() {
      toastEl.className = '';
    }, level === 'error' ? 4200 : 2600);
  }

  function setState(name, detail) {
    currentState = name;
    var s = STATES[name];
    if (!s) return;

    // Overlay
    if (s.bg === null) {
      overlayEl.classList.add('hidden');
    } else {
      overlayEl.classList.remove('hidden');
      overlayEl.style.background = s.bg;
      overlayIcon.innerHTML = '';
      if (s.icon) overlayIcon.appendChild(s.icon());
      overlayText.textContent = (name === 'error' && detail) ? detail : s.text;
      overlaySub.textContent  = s.sub || '';
    }

    // Badge
    badgeDot.style.background = s.badgeColor;
    badgeLabel.textContent    = (name === 'streaming') ? (fpsDisplay.textContent || '-- fps') : s.badgeLabel;
    if (s.pulse) { badgeDot.classList.add('badge-pulsing'); }
    else         { badgeDot.classList.remove('badge-pulsing'); }

    // FPS
    fpsDisplay.style.display = (name === 'streaming') ? 'block' : 'none';

    // Canvas pointer events
    canvas.style.pointerEvents = (name === 'streaming') ? 'auto' : 'none';
  }

  // ── RESPONSIVE FRAME ADAPTER ──────────────────────────────────────────
  var frameBreaks = [[1200,'desktop'],[800,'laptop'],[480,'tablet'],[0,'phone']];
  var curFrame    = '';

  function applyFrame(w) {
    var cls = 'phone';
    for (var i = 0; i < frameBreaks.length; i++) {
      if (w >= frameBreaks[i][0]) { cls = frameBreaks[i][1]; break; }
    }
    if (cls === curFrame) return;
    document.body.classList.remove('frame-phone','frame-tablet','frame-laptop','frame-desktop');
    document.body.classList.add('frame-' + cls);
    curFrame = cls;
  }

  var ro = new ResizeObserver(function(entries) { applyFrame(entries[0].contentRect.width); });
  ro.observe(document.getElementById('screen-area'));
  applyFrame(document.getElementById('screen-area').offsetWidth);

  // ── CANVAS RESIZE ─────────────────────────────────────────────────────
  function resizeCanvas(w, h) {
    if (canvas.width === w && canvas.height === h) return;
    canvas.width  = w; canvas.height  = h;
    dragCanvas.width = w; dragCanvas.height = h;
  }

  // ── FPS COUNTER ───────────────────────────────────────────────────────
  var lastTs = 0, frameN = 0, fpsSmooth = 0;
  function tickFps() {
    var now = performance.now();
    if (lastTs > 0) {
      var dt = now - lastTs;
      fpsSmooth = fpsSmooth * 0.85 + (1000 / dt) * 0.15;
      if (++frameN % 8 === 0) {
        var txt = fpsSmooth.toFixed(1) + ' fps';
        fpsDisplay.textContent = txt;
        if (currentState === 'streaming') badgeLabel.textContent = txt;
      }
    }
    lastTs = now;
  }

  // ── FRAME RENDERING ───────────────────────────────────────────────────
  function onFrame(data) {
    var blob = new Blob([data], { type: 'image/png' });
    createImageBitmap(blob).then(function(bmp) {
      tickFps();
      resizeCanvas(bmp.width, bmp.height);
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      if (currentState !== 'streaming') setState('streaming');
    }).catch(function() {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function() {
        tickFps();
        resizeCanvas(img.width, img.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        if (currentState !== 'streaming') setState('streaming');
      };
      img.src = url;
    });
  }

  // ── H264 (experimental) decode path ─────────────────────────────────
  var decoder = null;
  var h264Buf = new Uint8Array(0);
  var h264Ts = 0;

  function fallbackToPng(reason) {
    if (streamCodec !== 'h264') return;
    streamCodec = 'png';
    setState('reconnecting', 'Falling back to PNG stream...');
    showToast('H.264 fallback: ' + reason + ' Using PNG stream.', 'error');
  }

  function concatU8(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function findStartCode(data, from) {
    for (var i = from; i < data.length - 3; i++) {
      if (data[i] === 0 && data[i + 1] === 0 && (data[i + 2] === 1 || (data[i + 2] === 0 && data[i + 3] === 1))) {
        return i;
      }
    }
    return -1;
  }

  function initDecoder() {
    if (decoder) return true;
    if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
      return false;
    }
    try {
      decoder = new VideoDecoder({
        output: function(frame) {
          tickFps();
          resizeCanvas(frame.displayWidth, frame.displayHeight);
          ctx.drawImage(frame, 0, 0);
          frame.close();
          if (currentState !== 'streaming') setState('streaming');
        },
        error: function() {
          fallbackToPng('decoder error.');
        },
      });
      decoder.configure({ codec: 'avc1.42E01E', optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' });
      return true;
    } catch {
      decoder = null;
      return false;
    }
  }

  function feedH264Chunk(ab) {
    if (!initDecoder()) return false;
    var incoming = new Uint8Array(ab);
    h264Buf = concatU8(h264Buf, incoming);

    var offset = findStartCode(h264Buf, 0);
    if (offset < 0) return true;

    while (true) {
      var start = findStartCode(h264Buf, offset);
      if (start < 0) break;
      var next = findStartCode(h264Buf, start + 3);
      if (next < 0) break;

      var scLen = h264Buf[start + 2] === 1 ? 3 : 4;
      var nal = h264Buf.slice(start + scLen, next);
      if (nal.length > 0) {
        var nalType = nal[0] & 0x1f;
        var packet = new Uint8Array(4 + nal.length);
        packet.set([0, 0, 0, 1], 0);
        packet.set(nal, 4);
        try {
          decoder.decode(new EncodedVideoChunk({
            type: nalType === 5 ? 'key' : 'delta',
            timestamp: h264Ts,
            duration: 33333,
            data: packet,
          }));
          h264Ts += 33333;
        } catch {
          // Ignore occasional non-frame NAL decode errors.
        }
      }
      offset = next;
    }

    h264Buf = h264Buf.slice(offset);
    if (h264Buf.length > 2 * 1024 * 1024) {
      h264Buf = h264Buf.slice(-512 * 1024);
    }
    return true;
  }

  // ── MOUSE / TOUCH INPUT ───────────────────────────────────────────────
  var dragPt = null, longPressTimer = null;

  function toDevice(clientX, clientY) {
    var r  = canvas.getBoundingClientRect();
    return {
      x: Math.round((clientX - r.left) * (canvas.width  / r.width)),
      y: Math.round((clientY - r.top)  * (canvas.height / r.height)),
    };
  }

  function startDrag(clientX, clientY) {
    dragPt = toDevice(clientX, clientY);
    var captured = { x: dragPt.x, y: dragPt.y };
    longPressTimer = setTimeout(function() {
      longPressTimer = null;
      dragPt = null;
      // Draw expanding ring for visual feedback
      var start = performance.now();
      var maxR  = Math.max(18, canvas.width / 20);
      (function ring() {
        var p = Math.min(1, (performance.now() - start) / 500);
        dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
        dctx.beginPath();
        dctx.arc(captured.x, captured.y, maxR * p, 0, Math.PI * 2);
        dctx.strokeStyle = 'rgba(99,179,237,' + (0.9 - p * 0.7) + ')';
        dctx.lineWidth   = 2.5;
        dctx.stroke();
        if (p < 1) requestAnimationFrame(ring);
        else dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
      })();
      vscode.postMessage({ type: 'swipe',
        x1: captured.x, y1: captured.y, x2: captured.x, y2: captured.y, duration: 800 });
    }, 600);
  }

  function moveDrag(clientX, clientY) {
    if (!dragPt) return;
    var cur = toDevice(clientX, clientY);
    dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
    dctx.beginPath();
    dctx.moveTo(dragPt.x, dragPt.y);
    dctx.lineTo(cur.x, cur.y);
    dctx.strokeStyle = 'rgba(99,179,237,0.85)';
    dctx.lineWidth   = Math.max(3, dragCanvas.width / 128);
    dctx.lineCap     = 'round';
    dctx.stroke();
    dctx.beginPath();
    dctx.arc(cur.x, cur.y, Math.max(6, dragCanvas.width / 72), 0, Math.PI * 2);
    dctx.fillStyle = 'rgba(99,179,237,0.65)';
    dctx.fill();
  }

  function endDrag(clientX, clientY) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (!dragPt) return;
    dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
    var end = toDevice(clientX, clientY);
    var dx  = end.x - dragPt.x, dy = end.y - dragPt.y;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      vscode.postMessage({ type: 'tap', x: end.x, y: end.y });
    } else {
      vscode.postMessage({ type: 'swipe', x1: dragPt.x, y1: dragPt.y, x2: end.x, y2: end.y });
    }
    dragPt = null;
  }

  canvas.addEventListener('mousedown',  function(e) { e.preventDefault(); startDrag(e.clientX, e.clientY); });
  canvas.addEventListener('mousemove',  function(e) { moveDrag(e.clientX, e.clientY); });
  canvas.addEventListener('mouseup',    function(e) { endDrag(e.clientX, e.clientY); });
  canvas.addEventListener('mouseleave', function()  { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } if (dragPt) { dctx.clearRect(0,0,dragCanvas.width,dragCanvas.height); dragPt = null; } });

  canvas.addEventListener('touchstart', function(e) { e.preventDefault(); var t = e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive: false });
  canvas.addEventListener('touchmove',  function(e) { e.preventDefault(); var t = e.touches[0]; moveDrag(t.clientX, t.clientY); },  { passive: false });
  canvas.addEventListener('touchend',   function(e) { e.preventDefault(); var t = e.changedTouches[0]; endDrag(t.clientX, t.clientY); }, { passive: false });

  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    var r   = canvas.getBoundingClientRect();
    var cx  = Math.round((e.clientX - r.left) * (canvas.width  / r.width));
    var cy  = Math.round((e.clientY - r.top)  * (canvas.height / r.height));
    var dy  = Math.max(-300, Math.min(300, e.deltaY));
    vscode.postMessage({ type: 'swipe', x1: cx, y1: cy, x2: cx, y2: cy - Math.round(dy * 3) });
  }, { passive: false });

  // ── KEYBOARD INPUT ────────────────────────────────────────────────────
  var KEYCODES = {
    'Enter':66,'Backspace':67,'Delete':112,'Tab':61,'Escape':111,
    'ArrowLeft':21,'ArrowRight':22,'ArrowUp':19,'ArrowDown':20,' ':62,
    'Home':3,'End':123,'PageUp':92,'PageDown':93,'F1':131,'F2':132,
  };

  document.addEventListener('keydown', function(e) {
    if (document.activeElement === document.getElementById('text-input')) return;
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

  // ── TOOLBAR BUTTONS — hardware keys ───────────────────────────────────
  function hwKey(id, kc) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() { vscode.postMessage({ type: 'key', keycode: kc }); });
  }
  hwKey('tbk-back',   4);
  hwKey('tbk-home',   3);
  hwKey('tbk-recent', 187);
  hwKey('tbk-power',  26);
  hwKey('tbk-vup',    24);
  hwKey('tbk-vdn',    25);
  // Chassis side buttons
  hwKey('btn-power',   26);
  hwKey('btn-vol-up',  24);
  hwKey('btn-vol-dn',  25);

  // ── TEXT INPUT FIELD ──────────────────────────────────────────────────
  var textInput = document.getElementById('text-input');
  function sendTextInput() {
    var v = textInput.value.trim();
    if (v) { vscode.postMessage({ type: 'text', text: v }); textInput.value = ''; }
  }
  textInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); sendTextInput(); } });
  document.getElementById('tbk-send').addEventListener('click', sendTextInput);

  // ── TOOLBOX TOGGLE ────────────────────────────────────────────────────
  function toggleToolbox() {
    var tb = document.getElementById('toolbox');
    var open = tb.classList.toggle('open');
    document.body.classList.toggle('toolbox-open', open);
  }
  document.getElementById('toolbox-handle').addEventListener('click', toggleToolbox);
  document.getElementById('btn-toolbox-toggle').addEventListener('click', toggleToolbox);

  // ── RUN ON THE FLY ────────────────────────────────────────────────────
  document.getElementById('tbk-run').addEventListener('click', function() {
    vscode.postMessage({ type: 'runOnTheFly' });
  });

  // ── GITHUB ────────────────────────────────────────────────────────────
    // ── SCREENSHOT ────────────────────────────────────────────────────────
    document.getElementById('tbk-screenshot').addEventListener('click', function() {
      vscode.postMessage({ type: 'screenshot' });
    });

    // ── ROTATE ────────────────────────────────────────────────────────────
    document.getElementById('tbk-rotate').addEventListener('click', function() {
      vscode.postMessage({ type: 'rotate' });
    });

    // ── KILL APP ──────────────────────────────────────────────────────────
    document.getElementById('tbk-kill').addEventListener('click', function() {
      vscode.postMessage({ type: 'killApp' });
    });

    // ── GITHUB ────────────────────────────────────────────────────────────
  document.getElementById('btn-github').addEventListener('click', function() {
    vscode.postMessage({ type: 'openUrl', url: 'https://github.com/theaniketraj/nano-drift' });
  });

  // ── SETTINGS ─────────────────────────────────────────────────────────
  document.getElementById('btn-settings').addEventListener('click', function() {
    vscode.postMessage({ type: 'openSettings' });
  });

  // ── MESSAGES FROM EXTENSION ───────────────────────────────────────────
  window.addEventListener('message', function(ev) {
    var msg = ev.data;
    if (!msg) return;
    if (msg.type === 'screenSize') resizeCanvas(msg.width, msg.height);
    if (msg.type === 'deviceName') document.getElementById('device-name').textContent = msg.name || 'Unknown';
    if (msg.type === 'toast') showToast(msg.text || '', msg.level || 'success');
  });

  // ── WEBSOCKET — binary PNG stream ─────────────────────────────────────
  var ws;
  var wsHadError = false;
  function connect() {
    setState('connecting');
    if (streamCodec === 'h264' && !initDecoder()) {
      fallbackToPng('WebCodecs unavailable in this VS Code runtime.');
    }
    var path = streamCodec === 'h264' ? '/screen-h264' : '/screen';
    ws = new WebSocket('ws://localhost:${daemonPort}' + path);
    ws.binaryType = 'arraybuffer';

    ws.onopen = function() { setState('waiting'); };
    ws.onmessage = function(ev) {
      if (streamCodec === 'h264') {
        if (!feedH264Chunk(ev.data)) {
          fallbackToPng('decoder init failed.');
          ws.close();
          return;
        }
      } else {
        onFrame(ev.data);
      }
    };
    ws.onerror = function() {
      wsHadError = true;
      setState('error');
    };
    ws.onclose = function() {
      if (wsHadError) {
        // onerror already set the error state — keep it visible, then retry
        wsHadError = false;
        setTimeout(connect, 3000);
      } else {
        if (currentState === 'streaming') setState('paused');
        else setState('reconnecting');
        setTimeout(connect, 2000);
      }
    };
  }

  // Initial state before WS opens
  setState('idle');
  connect();
}());
</script>
</body>
</html>`;
}
