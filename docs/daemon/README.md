# Daemon Internals

This document covers the Node.js daemon package (`packages/daemon`) in detail: the WebSocket server, RPC dispatch engine, Gradle runner, ADB manager, file watcher, and screen streamer.

---

## 1. Module Map

```bash
packages/daemon/src/
├── index.ts          CLI entry point (commander)
├── server.ts         WebSocket server, RPC dispatch, build cycle, push broadcast
├── adb/
│   └── index.ts      AdbManager — all adb and emulator subprocess operations
├── gradle/
│   └── index.ts      GradleRunner — Gradle wrapper invocation, output streaming, error parsing
├── watcher/
│   └── index.ts      FileWatcher — chokidar-based Android source watcher
└── screen/
    └── index.ts      ScreenStreamer — periodic PNG screencap → WebSocket broadcast
```

---

## 2. Entry Point — `index.ts`

**File**: `packages/daemon/src/index.ts`

The daemon entry point uses [Commander](https://github.com/tj/commander.js) for CLI argument parsing. It accepts a single optional flag:

```bash
nano-drift-daemon [--port <number>]
```

| Flag                  | Default | Description               |
| --------------------- | ------- | ------------------------- |
| `-p, --port <number>` | `27183` | WebSocket port to bind to |

After parsing, it instantiates `DaemonServer`, calls `server.start()`, and registers `SIGINT`/`SIGTERM` handlers that call `server.stop()` before exiting. This ensures Gradle child processes and file watchers are cleaned up gracefully on Ctrl+C or process manager signals.

### Process Signal Handling

```typescript
process.on("SIGINT", () => {
  server.stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
```

Both signals trigger the same orderly teardown. `DaemonServer.stop()` closes the file watcher, screen streamer, WebSocket server, and HTTP server in that order.

---

## 3. DaemonServer — `server.ts`

**File**: `packages/daemon/src/server.ts`

`DaemonServer` is the central orchestrator. It owns one HTTP server and one WebSocket server (`ws`) mounted on it, and routes incoming WebSocket connections to the RPC path or screen path based on the URL.

### Constructor

```typescript
constructor(private readonly port: number)
```

Instantiates all sub-services and calls `registerHandlers()`. The HTTP and WebSocket servers are created but not yet listening — that happens in `start()`.

### WebSocket Routing

```typescript
this.wss.on("connection", (ws, req) => {
  const url = req.url ?? "/";
  if (url.startsWith("/screen")) {
    this.screen.addClient(ws);
  } else {
    this.rpcClients.add(ws);
    ws.on("close", () => this.rpcClients.delete(ws));
    this.handleRpcClient(ws);
  }
});
```

Any path other than `/screen` is treated as an RPC client. The `rpcClients` set is maintained so push notifications can be broadcast to all connected extension instances.

### Push Broadcast

```typescript
push(method: string, params: unknown): void
```

Iterates `rpcClients` and sends `{ method, params }` (no `id`) to every client whose WebSocket is in the `OPEN` state. Closed connections are gracefully skipped.

The absence of the `id` field is the distinguishing characteristic of a push vs. a response — see [RPC Protocol](../rpc-protocol.md).

### RPC Dispatch

```typescript
private async dispatch(ws: WebSocket, raw: RawData): Promise<void>
```

1. Parses the raw frame as `RpcRequest { id, method, params }`.
2. Looks up the handler in `this.handlers`.
3. If not found, responds with `{ id, error: "Unknown method: ..." }`.
4. Awaits the handler and responds with `{ id, result }`.
5. Any uncaught exception becomes `{ id, error: message }`.

Error responses use the same `id` as the request, so the extension-side RPC resolver correctly matches and rejects the pending Promise.

### Build Cycle

The auto-build cycle is triggered by the file watcher and managed by two methods:

#### `scheduleAutoBuild(opts: WatcherOptions)`

Sets (or resets) a 300 ms `setTimeout`. Only the final call in a sequence within 300 ms actually triggers `runBuildCycle`. This debounce prevents redundant builds on multi-file saves (e.g., editor formatting passes, code generation).

#### `runBuildCycle(opts: WatcherOptions)`

```typescript
private async runBuildCycle(opts: WatcherOptions): Promise<void>
```

Guards against concurrent invocations with the `buildInProgress` boolean flag. The flow:

```bash
buildInProgress = true
push('build.progress', { stage: 'building' })
    │
    ▼
gradle.build(projectPath, gradleArgs, onLine)
    onLine → push('build.progress', { stage: 'output', line })
    │
    ▼  (success)
push('build.progress', { stage: 'deploying' })
adb.firstOnlineDevice() or adb.getActiveDevice()
adb.launch(serial, packageName)
push('build.progress', { stage: 'done', errors })
    │
    ▼  (failure)
push('build.progress', { stage: 'error', message, errors: buildErrors })
    │
    ▼
buildInProgress = false  (finally)
```

`buildErrors` is extracted from the `Error` object's `.buildErrors` property, which `GradleRunner.build()` attaches when the build fails. This preserves structured error data even through exception propagation.

---

## 4. GradleRunner — `gradle/index.ts`

**File**: `packages/daemon/src/gradle/index.ts`

### `GradleRunner.build()`

```typescript
build(
    projectPath: string,
    args: string[],
    onLine?: LineCallback
): Promise<BuildError[]>
```

Spawns the Gradle wrapper as a child process:

```typescript
spawn(gradlew, args, {
  cwd: projectPath,
  stdio: "pipe",
  shell: process.platform === "win32",
});
```

`shell: true` is set on Windows because `gradlew.bat` is a batch file that requires the shell interpreter. On Linux and macOS, `shell: false` is used for direct invocation, which avoids shell injection risks.

Both `stdout` and `stderr` are read via `on('data')`, accumulated in line buffers (`stdoutBuf`, `stderrBuf`), and flushed line by line to:

1. `onLine(line)` — the caller's streaming callback, which the server uses to push `output` events.
2. `parseGradleLine(line)` — the error parser.

Partial lines (no trailing `\n`) are held in the buffer and flushed when the process closes.

On exit code 0, resolves with `errors[]` (may contain warnings).  
On exit code ≠ 0, rejects with an `Error` whose `.buildErrors` property holds the errors array and whose message includes the last 3 000 characters of combined output.

### `resolveGradlew(projectPath)`

Constructs the Gradle wrapper path and verifies it exists with `fs.existsSync`. Throws with a descriptive message if not found, catching the common mistake of opening a project subdirectory rather than the root.

### `parseGradleLine(line: string): BuildError | undefined`

Parses a single line of Gradle output against three regex patterns:

#### Kotlin (new format)

```bash
e: file:///abs/path.kt:10:5: error message
w: file:///abs/path.kt:10:5: warning message
e: /abs/path.kt:10:5: error message
```

Pattern: `/^([ew]):\s+(?:file:\/\/\/)?(.+?):(\d+):(\d+):\s+(.+)$/`

#### Kotlin (old format)

```bash
e: /abs/path.kt: (10, 5): error message
```

Pattern: `/^([ew]):\s+(.+?):\s+\((\d+),\s*(\d+)\):\s+(.+)$/`

#### Java

```bash
/abs/path/File.java:10: error: error message
/abs/path/File.java:10: warning: warning message
```

Pattern: `/^(.+\.java):(\d+):\s+(error|warning):\s+(.+)$/`

All matched paths pass through `normalizePath()` which converts backslashes to forward slashes for consistent cross-platform handling.

---

## 5. AdbManager — `adb/index.ts`

**File**: `packages/daemon/src/adb/index.ts`

`AdbManager` is the single point of contact for all ADB and Android Emulator operations. It uses `execFile` (via `util.promisify`) for synchronous-style commands and `spawn` for fire-and-forget emulator launch.

### SDK Path Resolution

```typescript
constructor() {
    const sdk = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
    const isWin = process.platform === 'win32';
    this.adbPath = sdk
        ? path.join(sdk, 'platform-tools', isWin ? 'adb.exe' : 'adb')
        : 'adb';
    this.emulatorPath = sdk
        ? path.join(sdk, 'emulator', isWin ? 'emulator.exe' : 'emulator')
        : 'emulator';
}
```

Falls back to bare `'adb'` / `'emulator'` if SDK environment variables are not set, relying on system `PATH`. The 30-second timeout on `execFile` prevents indefinite hangs on unresponsive devices.

### `listDevices(): Promise<DeviceInfo[]>`

Runs `adb devices -l` and parses output:

```bash
List of devices attached
emulator-5554          device product:sdk_gphone64 model:sdk_gphone64_arm64 ...
192.168.1.42:5555      device product:sunflower model:Pixel_4 ...
* daemon not running; starting now at tcp:5037
```

Lines beginning with `*` (daemon status messages) are filtered out. Each remaining line is split on whitespace: `parts[0]` = serial, `parts[1]` = state. The `model:` attribute is extracted from the raw line for display purposes. Serial numbers starting with `emulator` are classified as `type: 'emulator'`.

### `detectPackage(projectPath?: string): Promise<string>`

Scans for `AndroidManifest.xml` in three candidate locations:

1. `<projectPath>/app/src/main/AndroidManifest.xml` — standard Android Gradle layout
2. `<projectPath>/src/main/AndroidManifest.xml` — library module layout
3. `<projectPath>/AndroidManifest.xml` — bare / legacy layout

For the first existing file, applies the regex `/package\s*=\s*["']([^"']+)["']/` to extract the `package` attribute. Returns the extracted string or throws a descriptive error.

### `launch(serial, packageName?): Promise<void>`

Attempts app launch in two passes:

**Pass 1 — Intent-based launch** (preferred):

```bash
adb -s <serial> shell am start \
    -a android.intent.action.MAIN \
    -c android.intent.category.LAUNCHER \
    <packageName>
```

This triggers the app's default launcher activity regardless of its class name.

**Pass 2 — Component-based launch** (fallback):

```bash
adb -s <serial> shell am start -n <packageName>/.MainActivity
```

Used when the intent-based launch fails (e.g., some AOSP variants with unusual AM behaviour). Assumes `.MainActivity` as the entry point.

### `startEmulator(avdName): Promise<void>`

Spawns the emulator process with `detached: true` and `stdio: 'ignore'`, then calls `child.unref()` so the daemon process does not wait for the emulator on exit. Flags:

- `-no-window` — headless operation
- `-no-audio` — avoids audio driver issues in server environments
- `-no-boot-anim` — reduces cold boot time by 5–15 seconds

### `tap(serial, x, y)` and `swipe(serial, x1, y1, x2, y2)`

Delegates to `adb shell input tap` and `adb shell input swipe` respectively. Coordinates are passed as integers; no shell string construction is involved.

---

## 6. FileWatcher — `watcher/index.ts`

**File**: `packages/daemon/src/watcher/index.ts`

A thin wrapper around [chokidar](https://github.com/paulmillr/chokidar) tuned for Android project source trees.

### Watched Paths

```typescript
const watchPaths = [
  path.join(projectPath, "app", "src"),
  path.join(projectPath, "app", "build.gradle"),
  path.join(projectPath, "app", "build.gradle.kts"),
  path.join(projectPath, "build.gradle"),
  path.join(projectPath, "build.gradle.kts"),
  path.join(projectPath, "settings.gradle"),
  path.join(projectPath, "settings.gradle.kts"),
];
```

This set covers all source languages (Kotlin, Java, XML resources, assets) under `app/src/`, plus all Gradle build files that affect compilation. Root `src/` is intentionally not watched in the default layout.

### Ignored Patterns

```typescript
ignored: [
  /(^|[/\\])\../, // dotfiles and hidden directories
  /[/\\]build[/\\]/, // Gradle build outputs
  /[/\\]\.gradle[/\\]/, // Gradle local cache
];
```

Excluding `build/` is critical for performance: Gradle writes thousands of class and intermediate files here during a build. Without this exclusion, each build would recursively trigger the next.

### Write Stabilization

```typescript
awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
}
```

`awaitWriteFinish` instructs chokidar to hold fire until the file size has been stable for 300 ms. This handles editors that write files in multiple partial chunks (e.g., IntelliJ's atomic save mechanism). Combined with the server-level 300 ms debounce, rapid multi-file saves produce a single build invocation.

### `watch(projectPath, onChange)`

Stops any existing watcher before creating a new one. Watch events (`'change'` and `'add'`) both invoke `onChange(filePath)`. `'unlink'` events are not observed — file deletions alone do not typically require recompilation in Kotlin/Java.

### `stop()`

Calls `watcher.close()` asynchronously and sets `this.watcher = undefined`. The `void` prefix discards the returned Promise intentionally, as there is nothing meaningful to await during teardown.

---

## 7. ScreenStreamer — `screen/index.ts`

**File**: `packages/daemon/src/screen/index.ts`

Manages the set of WebSocket clients connected to the `/screen` endpoint and feeds them a continuous stream of PNG frames.

### Client Lifecycle

```typescript
addClient(ws: WebSocket): void
```

Adds the client to `this.clients`. On `'close'`, the client is removed and the capture interval is stopped if no clients remain (avoiding idle ADB traffic). If this is the first client, `startCapture()` is called.

### Capture Loop

```typescript
private startCapture(): void {
    this.tickInterval = setInterval(() => {
        void this.captureFrame();
    }, 100);   // ~10 fps target
}
```

### `captureFrame()`

The `capturing` boolean flag implements simple back-pressure: if the previous frame hasn't been captured yet (e.g., slow ADB round-trip), the tick is silently skipped. This prevents frame queue buildup and unbounded memory growth.

```typescript
if (this.capturing) return;
const serial = this.adb.getActiveDevice();
if (!serial || this.clients.size === 0) return;
this.capturing = true;
try {
  const frame = await this.screencap(serial);
  this.broadcast(frame);
} catch {
  /* skip frame */
} finally {
  this.capturing = false;
}
```

### `screencap(serial): Promise<Buffer>`

Uses `execFile` with `encoding: 'buffer'` and a 16 MB `maxBuffer` to receive the raw PNG output of `adb exec-out screencap -p`. This avoids base64 encoding overhead.

Each `screencap` call produces a fresh full-device-resolution PNG, typically 200–800 KB for a 1080p device. On a local USB connection, this completes in 50–150 ms.

### Frame Delivery

`broadcast(frame)` iterates all clients and calls `ws.send(frame)`. The `ws` library sends binary frames directly from the Buffer without copying. Clients with full send buffers will throw silently (the check `client.readyState === WebSocket.OPEN` guards this).

---

## 8. Error Propagation Model

The daemon uses a layered error propagation strategy:

| Layer                        | Error type                               | Propagation                                                       |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `AdbManager`                 | Subprocess output / `execFile` rejection | Throws `Error` with message from ADB output or Node.js error      |
| `GradleRunner`               | Non-zero exit code                       | Throws `Error` with last 3 KB of output + `.buildErrors` property |
| `DaemonServer.dispatch`      | Any handler rejection                    | Caught, converted to `{ id, error: message }` RPC response        |
| `DaemonServer.runBuildCycle` | Any rejection                            | Caught, converted to `build.progress` push with `stage: 'error'`  |

This means no unhandled rejection can crash the daemon from routine build or ADB errors. Only programming errors (null dereferences, etc.) can propagate to Node.js's unhandled rejection handler.

---

## 9. Standalone Usage

The daemon can be run independently of VS Code for scripting, CI integration, or remote development scenarios.

### Starting

```bash
node packages/daemon/out/index.js --port 27183
# Output: [nano-drift-daemon] Listening on ws://127.0.0.1:27183
```

### Sending an RPC call (with `wscat`)

```bash
npm install -g wscat
wscat -c ws://127.0.0.1:27183/rpc
> {"id":"1","method":"devices.list","params":{}}
< {"id":"1","result":[{"serial":"emulator-5554","name":"sdk_gphone64","type":"emulator","state":"device"}]}
```

### Triggering a Build

```bash
> {"id":"2","method":"gradle.build","params":{"projectPath":"/path/to/MyApp","args":["installDebug"]}}
# push events arrive while build runs:
< {"method":"build.progress","params":{"stage":"building","projectPath":"/path/to/MyApp"}}
< {"method":"build.progress","params":{"stage":"output","line":"> Task :app:compileDebugKotlin"}}
# ...
< {"id":"2","result":[]}
```

### Starting the File Watcher

```bash
> {"id":"3","method":"watcher.start","params":{"projectPath":"/path/to/MyApp","packageName":"com.example.myapp","gradleArgs":["installDebug","--parallel"]}}
< {"id":"3","result":null}
# Subsequent file saves push build.progress events automatically
```
