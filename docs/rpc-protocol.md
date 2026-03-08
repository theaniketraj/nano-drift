# RPC Protocol Reference

This document is the authoritative specification for the communication protocol between the Nano Drift VS Code extension and the daemon process.

---

## 1. Transport

| Property       | Value                                                    |
| -------------- | -------------------------------------------------------- |
| Protocol       | WebSocket over HTTP/1.1                                  |
| Host           | `127.0.0.1` (loopback only — never `0.0.0.0`)            |
| Default port   | `27183` (configurable via `nanoDrift.daemonPort`)        |
| RPC path       | `/rpc`                                                   |
| Screen path    | `/screen`                                                |
| Frame encoding | UTF-8 JSON text frames (RPC); raw binary frames (screen) |

The daemon creates a single `http.Server` and mounts one `WebSocketServer` on it. Incoming connections are routed by URL path.

---

## 2. Message Framing

All messages on the `/rpc` channel are JSON objects serialised as UTF-8 text WebSocket frames. No envelope header, no length prefix.

### Distinguishing frame types

The presence or absence of the `id` field determines the frame type:

| Frame                               | `id` field | `method` field | `result` / `error` field |
| ----------------------------------- | ---------- | -------------- | ------------------------ |
| RPC Request (client → daemon)       | Present    | Present        | Absent                   |
| RPC Response (daemon → client)      | Present    | Absent         | Present                  |
| Push Notification (daemon → client) | **Absent** | Present        | Absent                   |

This convention is inspired by JSON-RPC 2.0 notifications, with `id` omission as the discriminator instead of `null`.

---

## 3. Request / Response Pattern

### Request

Sent by the extension to the daemon.

```typescript
interface RpcRequest {
  id: string; // Unique per call; random base-36 string
  method: string; // Dot-namespaced method name
  params?: unknown; // Method-specific parameters object
}
```

**Example**:

```json
{
  "id": "k9f3m",
  "method": "gradle.build",
  "params": {
    "projectPath": "/home/user/MyApp",
    "args": ["installDebug", "--parallel"],
    "packageName": "com.example.myapp"
  }
}
```

### Successful Response

```typescript
interface RpcResponse {
  id: string; // Matches the request id
  result: unknown; // Method-specific return value; null for void methods
}
```

**Example**:

```json
{
  "id": "k9f3m",
  "result": [
    {
      "file": "/home/user/MyApp/app/src/main/java/com/example/myapp/MainActivity.kt",
      "line": 42,
      "column": 13,
      "severity": "warning",
      "message": "Variable 'x' is never used"
    }
  ]
}
```

### Error Response

```typescript
interface RpcErrorResponse {
  id: string; // Matches the request id
  error: string; // Human-readable error message
}
```

**Example**:

```json
{
  "id": "k9f3m",
  "error": "Gradle exited with code 1.\n> Task :app:compileDebugKotlin FAILED"
}
```

---

## 4. Push Notification Pattern

Push notifications are emitted **unilaterally by the daemon** — unprompted by any request. The extension subscribes to these by listening to all incoming frames and routing those without an `id` to the push handler.

```typescript
interface PushNotification {
  // id field is absent
  method: string; // Push event name
  params: unknown; // Event-specific payload
}
```

**Example**:

```json
{
  "method": "build.progress",
  "params": {
    "stage": "building",
    "projectPath": "/home/user/MyApp"
  }
}
```

The extension client (`DaemonClient`) handles this in `handleMessage()`:

```typescript
if (!msg.id && msg.method) {
  this.handlePush(msg.method, msg.params);
}
```

---

## 5. Method Reference — Device Management

### `devices.list`

Lists all devices currently visible to `adb devices -l`.

**Params**: `{}` (empty)

**Result**: `DeviceInfo[]`

```typescript
interface DeviceInfo {
  serial: string; // e.g. "emulator-5554" or "192.168.1.42:5555"
  name: string; // Human-readable model name
  type: "emulator" | "device"; // Derived from serial prefix
  state: string; // "device" | "offline" | "unauthorized" | ...
}
```

**Example response**:

```json
{
  "id": "abc1",
  "result": [
    {
      "serial": "emulator-5554",
      "name": "sdk gphone64 arm64",
      "type": "emulator",
      "state": "device"
    },
    {
      "serial": "R3CN30YQFHN",
      "name": "Pixel 7",
      "type": "device",
      "state": "device"
    }
  ]
}
```

---

### `devices.setActive`

Sets the active device. Affects which device is used by `adb.launch`, `adb.tap`, `adb.swipe`, and the screen streamer.

**Params**:

```typescript
{
  serial: string;
}
```

**Result**: `null`

**Example**:

```json
{
  "id": "abc2",
  "method": "devices.setActive",
  "params": { "serial": "R3CN30YQFHN" }
}
```

---

## 6. Method Reference — Emulator

### `emulator.listAvds`

Lists all AVD names registered on the host machine.

**Params**: `{}` (empty)

**Result**: `string[]`

**Example response**:

```json
{ "id": "b1", "result": ["Pixel_7_API_34", "Nexus_5X_API_28"] }
```

---

### `emulator.start`

Starts the specified AVD in headless mode (`-no-window -no-audio -no-boot-anim`). The process is detached and unreffed — the daemon does not wait for it to boot.

**Params**:

```typescript
{
  avdName: string;
}
```

**Result**: `null`

**Notes**:

- Boot time is typically 10–60 seconds.
- Use `devices.list` to poll until the emulator's state changes from `offline` to `device`.
- The emulator runs as an independent OS process; stopping the daemon does not terminate it.

---

## 7. Method Reference — ADB

### `adb.connectWifi`

Connects to a device via `adb connect <address>`.

**Params**:

```typescript
{
  address: string;
} // e.g. "192.168.1.42:5555"
```

**Result**: `null`

**Errors**: Throws if the ADB output does not contain the word "connected" (case-insensitive). This catches "connection refused" and "unable to connect" outputs.

---

### `adb.launch`

Launches the application on the specified device. Attempts an intent-based start first; falls back to component-based start.

**Params**:

```typescript
{
    serial: string;
    packageName?: string;  // Falls back to AndroidManifest.xml detection if absent
}
```

**Result**: `null`

**Notes**:

- Pass 1: `am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER <pkg>`
- Pass 2 (fallback): `am start -n <pkg>/.MainActivity`

---

### `adb.tap`

Sends a tap event at the specified device coordinates.

**Params**:

```typescript
{
  serial: string;
  x: number;
  y: number;
}
```

**Result**: `null`

Coordinates are in the device's native pixel space. The Webview scales from canvas display pixels to device pixels before calling this method.

---

### `adb.swipe`

Sends a swipe gesture between two points.

**Params**:

```typescript
{
  serial: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
```

**Result**: `null`

Uses `adb shell input swipe x1 y1 x2 y2`. Duration is the ADB default (300 ms).

---

### `adb.detectPackage`

Reads the application package name from `AndroidManifest.xml`.

**Params**:

```typescript
{
  projectPath: string;
}
```

**Result**: `string` — the package name (e.g. `"com.example.myapp"`)

**Errors**: Throws if no `AndroidManifest.xml` is found in any candidate location, or if the manifest does not contain a `package` attribute.

**Candidate search order**:

1. `<projectPath>/app/src/main/AndroidManifest.xml`
2. `<projectPath>/src/main/AndroidManifest.xml`
3. `<projectPath>/AndroidManifest.xml`

---

## 8. Method Reference — Gradle

### `gradle.build`

Runs an incremental Gradle build and optionally auto-launches the app on completion.

**Params**:

```typescript
{
    projectPath: string;
    args: string[];          // e.g. ["installDebug", "--parallel"]
    packageName?: string;    // Used for auto-launch after build
}
```

**Result**: `BuildError[]`

```typescript
interface BuildError {
  file: string; // Absolute or relative path, forward-slash normalised
  line: number; // 1-based
  column: number; // 1-based (0 when not available, e.g. Java errors)
  severity: "error" | "warning";
  message: string;
}
```

**Side effects**:

- Streams `build.progress` push events with `stage: 'output'` for each Gradle output line.
- After a successful build, calls `adb.launch` automatically on the active (or first online) device.

**Errors**: Throws (error response) if Gradle exits non-zero. The error message includes the last 3 KB of Gradle output.

**Notes on result vs. error**:

- A successful response with a non-empty `result` array indicates a clean build with **warnings or non-fatal notes** only.
- An error response indicates a build failure. The parsed diagnostics are embedded in the error message in structured form (via the `build.progress` `error` push event, which arrives before the RPC response).

---

## 9. Method Reference — File Watcher

### `watcher.start`

Starts the file watcher for the given project. Replaces any previously active watcher.

**Params**:

```typescript
{
    projectPath: string;
    packageName?: string;            // Passed to adb.launch on each auto-build
    gradleArgs?: string[];           // Defaults to ["installDebug", "--parallel"]
}
```

**Result**: `null`

After a successful call, any change to `app/src/**`, `app/build.gradle`, `build.gradle`, `settings.gradle`, or their `.kts` variants will schedule a build via `scheduleAutoBuild()`.

---

### `watcher.stop`

Stops the active file watcher. Clears the stored `WatcherOptions`.

**Params**: `{}` (empty)

**Result**: `null`

Any debounced build that is timer-pending at the time `stop` is called will still be triggered after the 300 ms window elapses (the timer is not cancelled). This is intentional: the last in-flight change was already detected and should be reflected.

---

## 10. Push Event Reference

### `build.progress`

Broadcast at every stage of an auto-build cycle (file-watcher-triggered) or a manual `gradle.build` call.

**Payload type**:

```typescript
interface BuildProgressEvent {
  stage: "building" | "output" | "deploying" | "done" | "error";
  line?: string; // stage === 'output' only
  errors?: BuildError[]; // stage === 'done' or 'error'
  message?: string; // stage === 'error' only — summary message
  projectPath?: string; // stage === 'building' only
}
```

#### Stage lifecycle

```bash
building       — Gradle has been invoked; status bar should show "Building…"
  │
  ├─ output    — One line of Gradle stdout/stderr (zero or more events)
  │
deploying      — Gradle exited 0; adb.launch is about to be called
  │
  └─ done      — adb.launch succeeded; errors[] may contain warnings
     error     — Gradle or adb.launch failed; message + errors[] available
```

#### `building`

```json
{
  "method": "build.progress",
  "params": { "stage": "building", "projectPath": "/home/user/MyApp" }
}
```

#### `output`

```json
{
  "method": "build.progress",
  "params": { "stage": "output", "line": "> Task :app:compileDebugKotlin" }
}
```

Mirrored to the Nano Drift output channel by `DaemonClient.handlePush()`.

#### `deploying`

```json
{
  "method": "build.progress",
  "params": { "stage": "deploying" }
}
```

#### `done`

```json
{
  "method": "build.progress",
  "params": {
    "stage": "done",
    "errors": []
  }
}
```

`errors` may be non-empty for non-fatal warnings even on a successful build.

#### `error`

```json
{
  "method": "build.progress",
  "params": {
    "stage": "error",
    "message": "Gradle exited with code 1.\n> Task :app:compileDebugKotlin FAILED",
    "errors": [
      {
        "file": "/home/user/MyApp/app/src/main/java/com/example/myapp/MainActivity.kt",
        "line": 42,
        "column": 13,
        "severity": "error",
        "message": "unresolved reference: fooBar"
      }
    ]
  }
}
```

---

## 11. Error Handling

### Extension-side

Every `DaemonClient.rpc<T>()` call returns a `Promise<T>`. If the daemon responds with an `error` field, the Promise rejects with `new Error(msg.error)`. Command handlers wrap all `daemonClient.*()` calls in `try/catch` and display user-facing notifications for expected failure modes.

Unexpected errors (e.g., WebSocket send failure) also reject the Promise. The connection state machine handles reconnection on the next call.

### Daemon-side

All RPC handler errors are caught in `dispatch()` and converted to error responses — they do not crash the daemon or close the WebSocket connection. This means a failed `gradle.build` call does not interrupt an ongoing `watcher.start` subscription.

### Timeout behaviour

There is no built-in RPC timeout. A long-running Gradle build may take several minutes. Callers that need timeout behaviour should `Promise.race()` the `rpc()` call with a custom timeout promise.

`execFile` calls inside `AdbManager` have a 30-second timeout to prevent indefinite hangs on unresponsive ADB connections.

---

## 12. Screen Channel

The `/screen` WebSocket endpoint delivers a continuous stream of raw PNG frames from the connected device.

| Property       | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| Path           | `ws://127.0.0.1:<port>/screen`                                  |
| Frame type     | Binary WebSocket frame                                          |
| Frame content  | Raw PNG image data (as produced by `adb exec-out screencap -p`) |
| Frame rate     | ~10 fps (100 ms interval, capped by ADB round-trip time)        |
| Max frame size | 16 MB (hard limit in `execFile` options)                        |

### Connecting

No authentication or handshake is required beyond the WebSocket upgrade. The daemon activates frame capture when the first client connects and stops it when the last client disconnects.

### Receiving frames

```javascript
ws.binaryType = "arraybuffer";
ws.onmessage = (event) => {
  const blob = new Blob([event.data], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
  };
  img.src = url;
};
```

The Webview in `showDeviceScreen.ts` uses exactly this pattern. It also auto-resizes the `<canvas>` element to match the device resolution on the first frame, then reuses it for subsequent frames.

### No control channel on `/screen`

The screen WebSocket is receive-only. Input events (tap, swipe) are sent via the RPC channel using `adb.tap` and `adb.swipe` methods, not through the screen WebSocket.
