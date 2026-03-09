# Architecture

This document describes the overall system design of Nano Drift, the rationale behind its two-process split, and the data flows that connect every component.

---

## 1. Design Philosophy

**Separation of concerns across the process boundary.** The extension and daemon are intentionally decoupled so each can evolve — or be replaced — independently:

- The extension is purely a _UI adapter_ over VS Code APIs. It renders state, registers commands, and forwards intent to the daemon.
- The daemon is a _tool orchestrator_. It owns all subprocess management, filesystem access, ADB state, and screen capture.

This means:

- The daemon can be started headlessly from the command line or a CI script without VS Code at all.
- The extension is thin enough that future ports to other editors (JetBrains, Neovim) need only replace the extension layer.
- Crashes in Gradle or ADB never destabilize the VS Code process.

---

## 2. High-Level Component Map

```bash
┌──────────────────────────────────────────────────────────────────────┐
│  VS Code (Renderer Process)                                          │
│                                                                      │
│  ┌─────────────┐   ┌──────────────────┐   ┌───────────────────────┐  │
│  │ StatusBar   │   │ Commands         │   │ Webview (Device Screen│  │
│  │ Manager     │   │ ─ runOnTheFly    │   │ /screen WebSocket)    │  │
│  │             │   │ ─ selectDevice   │   │                       │  │
│  │ idle        │   │ ─ startEmulator  │   │ Canvas ← PNG frames   │  │
│  │ building…   │   │ ─ connectWifi    │   │ click/swipe → postMsg │  │
│  │ deploying…  │   │ ─ showScreen     │   └───────────────────────┘  │
│  │ running     │   └──────────────────┘                              │
│  │ error       │          │                                          │
│  └─────────────┘          │                                          │
│         ▲       ┌─────────▼──────────────────────────────────────┐   │
│         │       │  DaemonClient                                  │  │
│  build  │       │  ─ ensureRunning() / spawnDaemon()             │  │
│  events │       │  ─ handleMessage() — routes push vs. response  │  │
│         │       │  ─ rpc<T>(method, params) → Promise<T>         │  │
│         │       │  ─ onBuildProgress (EventEmitter)              │  │
│         │       └────────────────────┬───────────────────────────┘  │
│                                      │ WebSocket ws://127.0.0.1:    │
│  ┌───────────────────────────────────│──────────────────────────┐   │
│  │ DiagnosticsManager                │                          │   │
│  │ ─ update(BuildError[])            │                          │   │
│  │ ─ Problems panel entries          │                          │   │
│  └───────────────────────────────────┼──────────────────────────┘   │
└──────────────────────────────────────┼──────────────────────────────┘
                                       │ 27183  (JSON-RPC + push)
                                       │ 27183/screen  (binary frames)
┌──────────────────────────────────────┼──────────────────────────────┐
│  Nano Drift Daemon (Node.js process) │                              │
│                                      │                              │
│  ┌───────────────────────────────────▼───────────────────────────┐  │
│  │  DaemonServer (ws / http)                                     │  │
│  │  ─ /rpc endpoint: JSON-RPC dispatch + push broadcast          │  │
│  │  ─ /screen endpoint: binary frame relay                       │  │
│  │  ─ rpcClients: Set<WebSocket> — connected extension clients   │  │
│  └────┬─────────────────┬──────────────────┬───────────────────┬─┘  │
│       │                 │                  │                   │    │
│  ┌────▼────┐  ┌─────────▼───────┐  ┌──────▼──────┐  ┌────────▼──┐   │
│  │ File    │  │  GradleRunner   │  │ AdbManager  │  │ Screen    │   │
│  │ Watcher │  │  ─ build()      │  │ ─ listDevices│  │ Streamer  │  │
│  │(chokidar)│  │  ─ parseGradle  │  │ ─ launch()  │  │ ─ screencap│  │
│  │ 300ms   │  │    Line()       │  │ ─ detectPkg │  │ ─ ~10 fps │   │
│  │ debounce│  │  ─ streams lines│  │ ─ tap/swipe │  │ PNG→WS    │   │
│  └─────────┘  └─────────────────┘  └─────────────┘  └───────────┘   │
└─────────────────────────────────────────────────────────────────────┘
              │                  │                  │
         gradlew            adb (platform-tools)  adb exec-out
              │                  │                  │
         Android Project    Connected device /     screencap -p
         on disk            emulator               PNG bytes
```

---

## 3. Process Boundary

The extension's `DaemonClient` is responsible for the entire lifecycle of the daemon process:

1. **On activation**, `DaemonClient.ensureRunning()` attempts to open a WebSocket connection to `ws://127.0.0.1:<port>/rpc`.
2. If the connection is refused (daemon not running), `spawnDaemon()` forks a child Node.js process pointing at the daemon's compiled `index.js`, then retries the connection up to 12 times at 500 ms intervals.
3. If the connection drops mid-session, `this.ws` is set to `undefined` and the next RPC call transparently re-spawns and reconnects.
4. On extension deactivation, `DaemonClient.dispose()` closes the WebSocket and kills the daemon process if it was spawned by this extension instance.

The daemon process binds **only to `127.0.0.1`**, never to `0.0.0.0`, which means it is unreachable from outside the local machine.

---

## 4. Extension Architecture

```bash
packages/extension/src/
├── extension.ts          Activation entry point — wires everything together
├── sdk.ts                Resolves ANDROID_HOME from settings or environment
├── statusBar.ts          Two-item VS Code status bar (device + action)
├── diagnostics.ts        Translates BuildError[] → vscode.DiagnosticCollection
├── daemon/
│   └── client.ts         WebSocket JSON-RPC client + daemon auto-spawn
└── commands/
    ├── index.ts           registerCommands() — CommandDeps injection
    ├── runOnTheFly.ts      Manual build & deploy trigger
    ├── selectDevice.ts     QuickPick device selector
    ├── startEmulator.ts    AVD picker + headless emulator launch
    ├── connectWifi.ts      IP input + adb connect
    └── showDeviceScreen.ts Webview panel with PNG frame canvas + input relay
```

### Activation Flow

```bash
activate(context)
    │
    ├─ detectAndroidSdk()         — warns if ANDROID_HOME missing
    ├─ new StatusBarManager()     — creates two status bar items
    ├─ new DaemonClient()         — creates output channel, reads port from config
    ├─ new DiagnosticsManager()   — creates diagnostic collection
    │
    ├─ Subscribe: daemonClient.onBuildProgress
    │     building  → statusBar.setBuilding() + diagnostics.clear()
    │     deploying → statusBar.setDeploying()
    │     done      → statusBar.setRunning() + diagnostics.update(errors)
    │     error     → statusBar.setError() + diagnostics.update(errors)
    │                  + showErrorMessage with "Show Output" action
    │
    ├─ registerCommands()
    ├─ maybeStartWatcher()        — if autoRunOnSave enabled, auto-detect pkg
    └─ onDidChangeConfiguration   — toggle watcher when setting changes
```

### Status Bar States

The extension maintains two persistent status bar items:

| Item   | Priority | Default text                 | Behaviour                        |
| ------ | -------- | ---------------------------- | -------------------------------- |
| Device | 100      | `$(device-mobile) No Device` | Click → `nanoDrift.selectDevice` |
| Action | 99       | `$(run) Run on the Fly`      | Click → `nanoDrift.runOnTheFly`  |

The Action item cycles through states driven by `build.progress` push events:

```bash
idle → building… → deploying… → running
                      ↑
                    error  (red background)
```

### Event-Driven Diagnostics

`DiagnosticsManager.update(errors)` replaces all diagnostics atomically. It:

1. Clears the `nano-drift` collection.
2. Groups `BuildError` objects by their `file` path.
3. Converts 1-based Gradle line/column numbers to 0-based VS Code ranges.
4. Resolves absolute paths directly; resolves relative paths against the first workspace folder.

---

## 5. Daemon Architecture

```bash
packages/daemon/src/
├── index.ts          CLI entry (commander) — parses --port, starts DaemonServer
├── server.ts         WebSocket server, RPC dispatch, push broadcast, build cycle
├── adb/
│   └── index.ts      AdbManager — wraps adb CLI for all device operations
├── gradle/
│   └── index.ts      GradleRunner — spawns gradlew, streams output, parses errors
├── watcher/
│   └── index.ts      FileWatcher — chokidar wrapper for Android project directories
└── screen/
    └── index.ts      ScreenStreamer — periodic screencap → PNG → WebSocket broadcast
```

### RPC Handler Registry

`DaemonServer.registerHandlers()` populates a `Map<string, RpcHandler>` at startup. Every incoming RPC method name is dispatched through this map. Unknown methods return an error response immediately, without throwing.

| Handler key         | Delegates to                                    |
| ------------------- | ----------------------------------------------- |
| `devices.list`      | `AdbManager.listDevices()`                      |
| `devices.setActive` | `AdbManager.setActiveDevice()`                  |
| `emulator.listAvds` | `AdbManager.listAvds()`                         |
| `emulator.start`    | `AdbManager.startEmulator()`                    |
| `adb.connectWifi`   | `AdbManager.connectWifi()`                      |
| `adb.launch`        | `AdbManager.launch()`                           |
| `adb.tap`           | `AdbManager.tap()`                              |
| `adb.swipe`         | `AdbManager.swipe()`                            |
| `adb.detectPackage` | `AdbManager.detectPackage()`                    |
| `gradle.build`      | `GradleRunner.build()` + auto-launch            |
| `watcher.start`     | `FileWatcher.watch()` + stores `WatcherOptions` |
| `watcher.stop`      | `FileWatcher.stop()`                            |

---

## 6. Communication Layer

### RPC Channel (`/rpc`)

All client ↔ daemon command/response traffic travels over a single persistent WebSocket connection on the `/rpc` path.

**Request** (extension → daemon):

```json
{
  "id": "abc123",
  "method": "gradle.build",
  "params": { "projectPath": "/...", "args": ["installDebug"] }
}
```

**Response** (daemon → extension):

```json
{ "id": "abc123", "result": [] }
```

The `id` field is a random base-36 string generated per call. The extension holds a per-call `onMsg` listener that filters by `id`; once matched, the listener is removed. This avoids listener accumulation even under rapid concurrent requests.

**Push notification** (daemon → extension, unsolicited):

```json
{
  "method": "build.progress",
  "params": { "stage": "building", "projectPath": "/..." }
}
```

Push messages carry **no `id` field**. `DaemonClient.handleMessage()` distinguishes them by this absence: if `msg.id` is falsy and `msg.method` is present, the message is routed to `handlePush()` rather than to any pending RPC resolver.

### Screen Channel (`/screen`)

A separate WebSocket path at `/screen` carries raw binary PNG frames. The Webview connects directly to this endpoint; the extension process is not in the data path. This prevents large binary buffers from passing through the extension runtime.

Frame delivery is fire-and-forget: if a client's buffer is full, the frame is simply not sent. There is no acknowledgement or retransmission.

---

## 7. The Drift Loop — End-to-End Data Flow

This sequence describes what happens from the moment a file is saved to the moment the app relaunches on-device.

```bash
Developer saves app/src/main/java/…/MyActivity.kt
        │
        ▼
[chokidar watcher] fires 'change' event
        │  Entries in /build/ and /.gradle/ are ignored by watched path config
        ▼
FileWatcher.onChange(filePath)  →  DaemonServer.scheduleAutoBuild(opts)
        │
        │  300 ms debounce: if another save arrives within the window,
        │  the timer resets. Only the final save in a rapid sequence triggers
        │  the build, preventing multiple in-flight Gradle invocations.
        │
        ▼
DaemonServer.runBuildCycle(opts)
        │
        ├─ guard: if buildInProgress === true → return immediately
        │         (overlapping builds silently dropped)
        │
        ├─ push('build.progress', { stage: 'building' })
        │       │
        │       └──→ DaemonClient.handlePush() fires _onBuildProgress
        │                 extension.ts: statusBar.setBuilding()
        │                              diagnostics.clear()
        │
        ├─ GradleRunner.build(projectPath, gradleArgs, onLine)
        │       │
        │       │  spawns: ./gradlew installDebug --parallel
        │       │  (or ./gradlew.bat on Windows)
        │       │
        │       ├─ each stdout/stderr line → onLine(line)
        │       │       │
        │       │       ├─ push('build.progress', { stage: 'output', line })
        │       │       │       └──→ DaemonClient: outputChannel.appendLine(line)
        │       │       │
        │       │       └─ parseGradleLine(line) → BuildError | undefined
        │       │               if matched, pushed into errors[]
        │       │
        │       └─ on exit(0) → resolve(errors[])
        │          on exit(N) → reject(Error with .buildErrors = errors[])
        │
        ├─ push('build.progress', { stage: 'deploying' })
        │       └──→ statusBar.setDeploying()
        │
        ├─ AdbManager.firstOnlineDevice()  (or use getActiveDevice())
        │
        ├─ AdbManager.launch(serial, packageName)
        │       │
        │       ├─ adb -s <serial> shell am start -a MAIN -c LAUNCHER <pkg>
        │       └─ fallback: adb -s <serial> shell am start -n <pkg>/.MainActivity
        │
        └─ push('build.progress', { stage: 'done', errors: [] })
                └──→ statusBar.setRunning()
                     diagnostics.update(warnings[])  ← non-fatal errors still shown
```

If Gradle exits non-zero, `runBuildCycle` catches the error and emits:

```json
{ "stage": "error", "message": "...", "errors": [<BuildError[]>] }
```

The extension then sets the status bar to the error state and populates the Problems panel.

---

## 8. Screen Streaming Data Flow

```bash
ScreenStreamer.startCapture()   ← triggered when first /screen client connects
        │
        ├─ setInterval(captureFrame, 100ms)   ← ~10 fps baseline
        │
        ▼
captureFrame()
        │
        ├─ guard: if this.capturing === true → skip  (back-pressure)
        │
        ├─ adb -s <serial> exec-out screencap -p
        │       returns raw PNG bytes (up to 16 MB buffer)
        │
        └─ broadcast(frame: Buffer)
                │
                └─ for each client in this.clients:
                       ws.send(frame)   ← binary WebSocket frame

[Browser Webview]
        │
        ├─ ws.onmessage: event.data → Blob → createObjectURL
        ├─ img.onload  → ctx.drawImage(img, 0, 0)
        │               auto-resizes canvas to match device resolution
        └─ URL.revokeObjectURL()
```

The `capturing` boolean flag prevents frame overlap: if the previous `screencap` invocation has not yet completed, the next tick is skipped. This provides natural back-pressure under slow ADB connections without unbounded queueing.

`ScreenStreamer.stop()` is called when `DaemonServer.stop()` is invoked (SIGINT/SIGTERM). It also self-stops when all clients disconnect, avoiding background ADB traffic with no consumers.

---

## 9. Lifecycle and State Management

### Daemon Startup

```bash
node out/index.js [--port 27183]
    │
    ├─ DaemonServer constructor
    │     ├─ creates http.Server + WebSocketServer
    │     ├─ new AdbManager()     ← resolves adb/emulator paths from ANDROID_HOME
    │     ├─ new GradleRunner()
    │     ├─ new ScreenStreamer(adb)
    │     ├─ new FileWatcher()
    │     └─ registerHandlers()
    │
    └─ server.start()   ← httpServer.listen('127.0.0.1', port)
```

### Daemon Shutdown

```bash
SIGINT / SIGTERM
    │
    ├─ FileWatcher.stop()   ← closes chokidar watcher
    ├─ ScreenStreamer.stop() ← clears interval, drops all clients
    ├─ WebSocketServer.close()
    └─ httpServer.close()
```

### Extension Deactivation

```bash
deactivate()
    │
    ├─ daemonClient.dispose()
    │     ├─ ws.close()
    │     ├─ daemonProcess.kill()
    │     ├─ _onBuildProgress.dispose()
    │     └─ outputChannel.dispose()
    │
    ├─ statusBarManager.dispose()
    └─ diagnosticsManager.dispose()
```

All three managers are also registered as `context.subscriptions`, so VS Code's own disposal pipeline handles them even if `deactivate()` is not called.

---

## 10. Security Boundaries

| Boundary                | Measure                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Daemon network exposure | Binds exclusively to `127.0.0.1` — not reachable from external hosts                                                    |
| Webview CSP             | `connect-src ws://localhost:<port>` — Webview can only open WebSocket to the local daemon; no arbitrary network access  |
| Webview scripting       | `script-src 'unsafe-inline'` — acceptable for a trusted local tool; no user-supplied scripts are ever injected          |
| ADB subprocess          | `execFile` is used throughout (never `exec` or shell string interpolation) — eliminates shell injection vectors         |
| Gradle subprocess       | `spawn` with explicit args array; `shell: true` only on Windows where it is required by `.bat` invocation               |
| Input forwarding        | Tap/swipe coordinates are integers validated by TypeScript types; no freeform shell arguments are constructed from them |

---

[← Getting Started](./getting-started.md) &nbsp;&nbsp;|&nbsp;&nbsp; [Extension Internals →](./extension/README.md)
