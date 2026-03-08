# Extension Internals

This document covers the VS Code extension package (`packages/extension`) in detail: module responsibilities, key classes and functions, inter-module data flow, and the command surface exposed to users.

---

## 1. Module Map

```bash
packages/extension/src/
├── extension.ts          Entry point activated by VS Code
├── sdk.ts                Android SDK path resolution
├── statusBar.ts          Status bar item lifecycle and state machine
├── diagnostics.ts        BuildError[] → VS Code Problems panel
├── daemon/
│   └── client.ts         WebSocket JSON-RPC client + daemon lifecycle
└── commands/
    ├── index.ts           Command registration + CommandDeps interface
    ├── runOnTheFly.ts     Manual build-deploy trigger
    ├── selectDevice.ts    Device picker QuickPick
    ├── startEmulator.ts   AVD selection + headless emulator launch
    ├── connectWifi.ts     IP address input + adb connect
    └── showDeviceScreen.ts Webview panel with HTML5 canvas screen mirror
```

---

## 2. Activation — `extension.ts`

**File**: `packages/extension/src/extension.ts`

`activate(context)` is the VS Code-mandated entry point, called once when the extension activates. All three managers are instantiated here and wired together through VS Code's `context.subscriptions` mechanism.

### Activation sequence

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void>;
```

1. **SDK check** — `detectAndroidSdk()` is called. On failure a dismissible warning notification is shown with a link to the relevant setting. Activation continues regardless; the SDK is not required for all commands.

2. **Manager instantiation**

   ```typescript
   statusBarManager = new StatusBarManager(context);
   daemonClient = new DaemonClient(context);
   diagnosticsManager = new DiagnosticsManager();
   context.subscriptions.push(diagnosticsManager);
   ```

   All three are singletons for the lifetime of the extension session. `StatusBarManager` and `DaemonClient` self-register their VS Code disposables into `context.subscriptions`; `DiagnosticsManager` is pushed manually.

3. **Build progress subscription**  
   `daemonClient.onBuildProgress` is subscribed. This is the single point where daemon push events are translated into VS Code UI state:

   | `BuildProgressEvent.stage` | Status bar action         | Diagnostics action                  |
   | -------------------------- | ------------------------- | ----------------------------------- |
   | `building`                 | `setBuilding()`           | `clear()`                           |
   | `deploying`                | `setDeploying()`          | —                                   |
   | `done`                     | `setRunning()`            | `update(event.errors)` if non-empty |
   | `error`                    | `setError(event.message)` | `update(event.errors)` if non-empty |

   On stage `error`, a VS Code error notification is shown with a **Show Output** action that calls `daemonClient.showOutput()` to reveal the Nano Drift output channel.

4. **Command registration** — `registerCommands(context, deps)` is called with a `CommandDeps` bundle containing all three managers and the resolved SDK path.

5. **Context flag** — `setContext('nanoDrift.active', true)` is set, enabling the editor title bar run button via the `when` clause in `package.json` menus.

6. **Watcher auto-start** — `maybeStartWatcher(daemonClient)` initiates the file watcher if `nanoDrift.autoRunOnSave` is `true`.

7. **Configuration change listener** — `vscode.workspace.onDidChangeConfiguration` watches for changes to `nanoDrift.autoRunOnSave`. Toggling the setting on starts the watcher; toggling it off calls `stopWatcher()`.

### `maybeStartWatcher`

```typescript
async function maybeStartWatcher(client: DaemonClient): Promise<void>;
```

Runs at activation and on every relevant configuration change. Logic:

1. Return early if `nanoDrift.autoRunOnSave` is `false`.
2. Return early if no workspace folder is open.
3. Resolve `packageName`:  
   a. Use `nanoDrift.packageName` setting if set.  
   b. Otherwise call `client.detectPackage(workspaceFolder)`. If this throws (no `AndroidManifest.xml` found), return silently — the workspace is likely not an Android project.
4. Call `client.startWatcher(workspaceFolder, packageName)`.

### `deactivate`

```typescript
export function deactivate(): void;
```

Calls `dispose()` on all three managers. `DaemonClient.dispose()` tears down the WebSocket and kills the daemon process. This is also covered by `context.subscriptions`, but the explicit call ensures deterministic ordering.

---

## 3. DaemonClient — `daemon/client.ts`

**File**: `packages/extension/src/daemon/client.ts`

`DaemonClient` is the boundary between the extension and the daemon process. It is both a connection manager and a typed API surface.

### Key Types

```typescript
export interface DeviceInfo {
  serial: string;
  name: string;
  type: "emulator" | "device";
  state: string;
}

export interface BuildError {
  file: string; // Absolute path, forward-slash normalized
  line: number; // 1-based
  column: number; // 1-based
  severity: "error" | "warning";
  message: string;
}

export type BuildStage = "building" | "output" | "deploying" | "done" | "error";

export interface BuildProgressEvent {
  stage: BuildStage;
  line?: string; // present when stage === 'output'
  errors?: BuildError[]; // present when stage === 'done' or 'error'
  message?: string; // present when stage === 'error'
  projectPath?: string;
}
```

### Connection Management

`DaemonClient` maintains a single `WebSocket` instance. The connection lifecycle is:

```bash
ensureRunning()
    ├─ ws.readyState === OPEN  → nothing to do
    ├─ connect()  succeeds     → open
    └─ connect()  fails        → spawnDaemon() → retryConnect(12 × 500ms)
```

`retryConnect` gives the freshly-spawned process up to 6 seconds to bind the port. Failure after 12 attempts throws a descriptive error that surfaces in the output channel.

**Reconnection**: `ws.on('close', ...)` sets `this.ws = undefined`. The next RPC call will attempt to reconnect (and re-spawn if needed) transparently.

### Message Routing

All incoming WebSocket frames are handled by `handleMessage(raw)`:

```bash
handleMessage(raw)
    │
    ├─ parse JSON
    ├─ msg.id is absent AND msg.method is present
    │     → handlePush(msg.method, msg.params)
    │           ├─ 'build.progress' → fire _onBuildProgress
    │           │     (also mirrors 'output' lines to OutputChannel)
    │           └─ any other method → log to OutputChannel
    │
    └─ otherwise (has id)
          → matched by per-call onMsg listener registered in rpc()
```

RPC responses are **not** handled centrally — each `rpc()` call registers its own temporary listener keyed by the request `id`, removes it once matched, and resolves or rejects the returned `Promise`. This pattern avoids a central response queue and handles concurrent calls naturally.

### Public API

| Method                            | RPC method          | Returns                 |
| --------------------------------- | ------------------- | ----------------------- |
| `listDevices()`                   | `devices.list`      | `Promise<DeviceInfo[]>` |
| `setActiveDevice(serial)`         | `devices.setActive` | `void`                  |
| `listAvds()`                      | `emulator.listAvds` | `Promise<string[]>`     |
| `startEmulator(avdName)`          | `emulator.start`    | `Promise<void>`         |
| `connectWifi(address)`            | `adb.connectWifi`   | `Promise<void>`         |
| `detectPackage(projectPath)`      | `adb.detectPackage` | `Promise<string>`       |
| `startWatcher(projectPath, pkg?)` | `watcher.start`     | `Promise<void>`         |
| `stopWatcher()`                   | `watcher.stop`      | `Promise<void>`         |
| `build(projectPath, pkg?)`        | `gradle.build`      | `Promise<BuildError[]>` |
| `deploy()`                        | `adb.launch`        | `Promise<void>`         |
| `sendTap(x, y)`                   | `adb.tap`           | `Promise<void>`         |
| `sendSwipe(x1,y1,x2,y2)`          | `adb.swipe`         | `Promise<void>`         |

`build()` reads `nanoDrift.gradleArgs` from the workspace configuration (defaulting to `['installDebug', '--parallel']`) and forwards them to the daemon.

### Events

```typescript
readonly onBuildProgress: vscode.Event<BuildProgressEvent>
```

A `vscode.EventEmitter<BuildProgressEvent>` wrapping a public VS Code Event. Subscribers receive every stage transition broadcast by the daemon's file watcher or manual build. Both `extension.ts` and command handlers can subscribe independently.

---

## 4. StatusBarManager — `statusBar.ts`

**File**: `packages/extension/src/statusBar.ts`

Manages two `vscode.StatusBarItem` instances positioned in the left of the status bar.

| Item   | `alignment` | `priority` | Default                      |
| ------ | ----------- | ---------- | ---------------------------- |
| Device | Left        | 100        | `$(device-mobile) No Device` |
| Action | Left        | 99         | `$(run) Run on the Fly`      |

Higher priority items appear further left. The Device item always appears to the left of the Action item.

### State Methods

```typescript
setDevice(name: string): void       // device item: show device name
setNoDevice(): void                  // device item: "No Device"

setIdle(): void       // action: "Run on the Fly",   normal background
setBuilding(): void   // action: "Building…",         normal background
setDeploying(): void  // action: "Deploying…",        normal background
setRunning(): void    // action: "Running",            normal background
setError(msg): void   // action: "Build Failed",      error background
```

`setError` sets `backgroundColor` to `new vscode.ThemeColor('statusBarItem.errorBackground')` — the standard VS Code error colour that adapts to light and dark themes.

Both items are registered in `context.subscriptions` via the constructor; they are automatically disposed when the extension deactivates.

---

## 5. DiagnosticsManager — `diagnostics.ts`

**File**: `packages/extension/src/diagnostics.ts`

Bridges the `BuildError[]` from the daemon's Gradle output parser to the VS Code Problems panel.

### `update(errors: BuildError[]): void`

1. Clears the entire `nano-drift` diagnostic collection.
2. Groups errors by resolved `vscode.Uri`.
3. For each error:
   - Converts 1-based `line`/`column` to 0-based VS Code `Range` (line `n-1`, column `c-1`).
   - Maps `severity` `'error'` → `DiagnosticSeverity.Error`, `'warning'` → `DiagnosticSeverity.Warning`.
   - Sets `diag.source = 'Nano Drift'` so the Problems panel shows the origin.
4. Calls `collection.set(uri, diagnostics[])` once per unique file.

### `resolveUri(filePath: string): vscode.Uri`

Handles the two forms of paths produced by the Gradle error parser:

- **Absolute paths** (start with `/` or a Windows drive letter) → `vscode.Uri.file(filePath)`
- **Relative paths** → resolved against `workspaceFolders[0].uri.fsPath`

---

## 6. SDK Utilities — `sdk.ts`

**File**: `packages/extension/src/sdk.ts`

Three pure utility functions for Android SDK path resolution. These are intentionally stateless — no caching or side effects — so they can be called cheaply on each activation without concern for stale state.

```typescript
detectAndroidSdk(): Promise<string | undefined>
```

Checks `nanoDrift.androidHome` setting, then `ANDROID_HOME`, then `ANDROID_SDK_ROOT`. Returns the first path that exists on disk, or `undefined` if none are found.

```typescript
resolveAdb(sdkPath: string): string
resolveEmulator(sdkPath: string): string
```

Construct the platform-appropriate binary path. Used by the daemon's `AdbManager` which reads `ANDROID_HOME` internally; these helpers are available should the extension ever need to invoke `adb` directly (e.g., future diagnostic commands).

---

## 7. Commands

All commands are registered in `packages/extension/src/commands/index.ts` via `registerCommands(context, deps)`. Each handler is a standalone async function in its own module, receiving `deps: CommandDeps` for dependency access.

### 7a. `runOnTheFly`

**Command ID**: `nanoDrift.runOnTheFly`  
**Category**: Android  
**File**: `commands/runOnTheFly.ts`

Triggers a manual build-deploy cycle. Steps:

1. Requires an open workspace folder.
2. Resolves `packageName` from settings or `detectPackage()`.
3. Calls `statusBarManager.setBuilding()` and `diagnosticsManager.clear()`.
4. Calls `daemonClient.build(projectPath, packageName)` — this RPC call also auto-launches the app on the active device.
5. On success: calls `diagnosticsManager.update(errors)` for non-fatal warnings, then `statusBarManager.setRunning()`.
6. On failure: calls `statusBarManager.setError(message)` and shows an error notification with a **Show Output** action.

> **Note**: Build progress (streaming Gradle lines) continues to arrive via `onBuildProgress` push events in parallel with the awaited RPC response. The status bar intermediate states (`building`, `deploying`) are driven by push events; the final `setRunning()` call in `runOnTheFly.ts` is a belt-and-suspenders update for the synchronous path.

### 7b. `selectDevice`

**Command ID**: `nanoDrift.selectDevice`  
**Category**: Android  
**File**: `commands/selectDevice.ts`

Presents a `vscode.window.showQuickPick` populated with the output of `daemonClient.listDevices()`.

- Each item shows the device `name` as label, `serial` as description, and a Codicon icon (`$(vm)` for emulators, `$(device-mobile)` for physical devices) as detail.
- `matchOnDescription: true` allows searching by serial number.
- On selection, calls `daemonClient.setActiveDevice(serial)` and `statusBarManager.setDevice(name)`.
- If no devices are found, a warning offers **Start Emulator** or **Connect via Wi-Fi** as inline actions.

### 7c. `startEmulator`

**Command ID**: `nanoDrift.startEmulator`  
**Category**: Android  
**File**: `commands/startEmulator.ts`

1. Calls `daemonClient.listAvds()`.
2. If the list is empty, shows a warning with a link to the Android AVD Manager documentation.
3. Otherwise presents a Quick Pick of AVD names.
4. On selection, wraps `daemonClient.startEmulator(avdName)` in a `vscode.window.withProgress` notification.
5. Shows an informational message advising the user to run **Select Active Device** once the emulator boots.

The emulator is started with `-no-window -no-audio -no-boot-anim` flags. It runs as a detached process so it survives daemon restarts.

### 7d. `connectWifi`

**Command ID**: `nanoDrift.connectWifi`  
**Category**: Android  
**File**: `commands/connectWifi.ts`

1. Presents a `showInputBox` with live validation: the input is checked against `/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/`.
2. Appends `:5555` if no port is given.
3. Wraps `daemonClient.connectWifi(address)` in a progress notification.
4. On success: updates the device status bar item and shows a confirmation message.

### 7e. `showDeviceScreen`

**Command ID**: `nanoDrift.showDeviceScreen`  
**Category**: Android  
**File**: `commands/showDeviceScreen.ts`

Creates a `vscode.WebviewPanel` in `ViewColumn.Beside` that renders the device screen using a `<canvas>` element. If a panel is already open, it is revealed rather than duplicated.

**Webview content** (generated by `buildWebviewHtml(port)`):

- `<canvas id="screen-canvas">` — initial size 393×851 (standard phone); auto-resizes on first frame.
- WebSocket connection to `ws://localhost:<daemonPort>/screen`.
- Overlay div shown while connecting, hidden on first frame received.
- Input handling:
  - `mousedown` stores drag start.
  - `mouseup` computes delta: less than 8 px = tap; 8 px or more = swipe.
  - Coordinates are scaled by `canvas.width / canvas.getBoundingClientRect().width`.
  - `vscode.postMessage()` sends `{ type: 'tap', x, y }` or `{ type: 'swipe', x1, y1, x2, y2 }`.
- `ws.onclose` reconnects after a 2 s delay.

The panel's `onDidReceiveMessage` handler in the extension process forwards tap and swipe messages to `daemonClient.sendTap()` and `daemonClient.sendSwipe()`.

**Content Security Policy**:

```bash
default-src 'none';
script-src 'unsafe-inline';
style-src 'unsafe-inline';
connect-src ws://localhost:<port>;
```

The `connect-src` directive restricts WebSocket connections to the local daemon port only.

### 7f. `listDevices` / `stopDaemon`

**Command ID**: `nanoDrift.listDevices`  
Shows a quick summary of all connected devices in an information message. Useful for debugging.

**Command ID**: `nanoDrift.stopDaemon`  
Calls `daemonClient.stop()` — closes the WebSocket and kills the daemon process. Subsequent commands will restart it automatically.

---

## 8. Dependency Injection Pattern

Commands receive all dependencies through a `CommandDeps` interface rather than accessing singletons or globals:

```typescript
export interface CommandDeps {
  statusBarManager: StatusBarManager;
  daemonClient: DaemonClient;
  sdkPath: string | undefined;
  diagnosticsManager: DiagnosticsManager;
}
```

This pattern keeps each command handler unit-testable in isolation: replacing `daemonClient` with a mock object is sufficient to test command logic without a real daemon or VS Code instance.

`registerCommands` closes over a single `deps` object created in `activate()` and passes it to every command handler via lambda closures. All lambdas capture the same `deps` reference, so a future hot-reload of `daemonClient` would propagate automatically.

---

## 9. VS Code Contribution Points

Defined in `packages/extension/package.json` under `"contributes"`:

### Activation Events

```json
"activationEvents": [
  "workspaceContains:**/AndroidManifest.xml",
  "workspaceContains:**/build.gradle",
  "workspaceContains:**/build.gradle.kts"
]
```

The extension activates lazily — only when VS Code detects an Android project in the workspace. It will not activate for non-Android workspaces.

### Commands

| Command ID                   | Title                     | Category | Icon               |
| ---------------------------- | ------------------------- | -------- | ------------------ |
| `nanoDrift.runOnTheFly`      | Run on the Fly            | Android  | `$(run)`           |
| `nanoDrift.selectDevice`     | Select Active Device      | Android  | `$(device-mobile)` |
| `nanoDrift.startEmulator`    | Start Headless Emulator   | Android  | `$(vm)`            |
| `nanoDrift.connectWifi`      | Connect Device over Wi-Fi | Android  | `$(wifi)`          |
| `nanoDrift.showDeviceScreen` | Show Device Screen        | Android  | `$(screen-normal)` |
| `nanoDrift.listDevices`      | List Connected Devices    | Android  | —                  |
| `nanoDrift.stopDaemon`       | Stop Daemon               | Android  | —                  |

### Editor Title Bar Button

```json
"menus": {
  "editor/title/run": [
    {
      "command": "nanoDrift.runOnTheFly",
      "when": "nanoDrift.active",
      "group": "navigation"
    }
  ]
}
```

The run button only appears when `nanoDrift.active` is `true` — i.e., after successful extension activation in an Android workspace. This prevents the button from appearing in non-Android projects.

### Configuration

See the [Configuration Reference](../configuration.md) for the full specification of all `nanoDrift.*` settings.
