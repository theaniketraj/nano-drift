# Configuration Reference

All Nano Drift settings are prefixed with `nanoDrift.` and can be set in:

- **User settings** (`settings.json`) — apply to every workspace on the machine
- **Workspace settings** (`.vscode/settings.json`) — apply to the current workspace only (checked into version control; preferred for project-specific overrides)
- **Folder settings** — multi-root workspaces only

Settings can be edited via the VS Code Settings UI (search for "Nano Drift") or directly in JSON.

---

## Settings

### `nanoDrift.androidHome`

| Property | Value               |
| -------- | ------------------- |
| Type     | `string`            |
| Default  | `""` (empty)        |
| Scope    | Machine-overridable |

Path to the Android SDK root directory. When empty, Nano Drift reads `ANDROID_HOME` and then `ANDROID_SDK_ROOT` from the process environment. Set this explicitly when the environment variable is not accessible from the VS Code process (e.g., on Windows when VS Code is launched from the Start menu rather than a terminal).

`adb` and `emulator` binaries are resolved as:

```xml
<androidHome>/platform-tools/adb[.exe]
<androidHome>/emulator/emulator[.exe]
```

**Example**:

```jsonc
{
  "nanoDrift.androidHome": "C:\\Users\\you\\AppData\\Local\\Android\\Sdk",
}
```

---

### `nanoDrift.daemonPort`

| Property | Value               |
| -------- | ------------------- |
| Type     | `number`            |
| Default  | `27183`             |
| Scope    | Machine-overridable |

The TCP port on which the daemon's WebSocket server listens. The daemon binds to `127.0.0.1` on this port only.

Change this if port `27183` is occupied by another service. The extension and the Webview screen panel both read this setting; a change takes effect on the next daemon restart (run **Android: Stop Daemon** then trigger any command).

```jsonc
{
  "nanoDrift.daemonPort": 28000,
}
```

---

### `nanoDrift.autoRunOnSave`

| Property | Value     |
| -------- | --------- |
| Type     | `boolean` |
| Default  | `true`    |
| Scope    | Workspace |

When `true`, Nano Drift starts a file watcher on the project root at activation time. Any change to a source file under `app/src/`, or to a Gradle build file, automatically triggers a build-deploy cycle 300 ms after the last detected change.

When `false`, the watcher is not started and no automatic builds occur. Use **Android: Run on the Fly** to trigger builds manually.

Toggling this setting while a session is active takes effect immediately (no restart required):

- Setting to `true` calls `watcher.start` on the daemon.
- Setting to `false` calls `watcher.stop` on the daemon.

```jsonc
{
  "nanoDrift.autoRunOnSave": false,
}
```

---

### `nanoDrift.gradleArgs`

| Property | Value                            |
| -------- | -------------------------------- |
| Type     | `string[]`                       |
| Default  | `["installDebug", "--parallel"]` |
| Scope    | Workspace                        |

The Gradle task(s) and flags passed to `./gradlew` for every build. The array is forwarded verbatim as command-line arguments.

**Default tasks**:

- `installDebug` — builds the debug variant and installs it on the device atomically (no separate `assembleDebug` + ADB push step required).
- `--parallel` — enables parallel project execution, reducing build time on multi-module projects.

**Common configurations**:

```jsonc
// Build and install, verbose output
{
  "nanoDrift.gradleArgs": ["installDebug", "--parallel", "--info"]
}

// Build only, no install (manual adb install or CI scenario)
{
  "nanoDrift.gradleArgs": ["assembleDebug"]
}

// Specific build flavour
{
  "nanoDrift.gradleArgs": ["installProductionDebug", "--parallel"]
}

// Clean build (slower; use when encountering stale incremental caches)
{
  "nanoDrift.gradleArgs": ["clean", "installDebug"]
}

// Offline build (no dependency downloads; useful on restricted networks)
{
  "nanoDrift.gradleArgs": ["installDebug", "--parallel", "--offline"]
}
```

> **Performance note**: `--parallel` provides the largest speedup on projects with multiple Gradle submodules (e.g., `:app`, `:core`, `:feature-X`). For single-module projects the improvement is negligible.

---

### `nanoDrift.packageName`

| Property | Value        |
| -------- | ------------ |
| Type     | `string`     |
| Default  | `""` (empty) |
| Scope    | Workspace    |

The Android application ID (e.g. `com.example.myapp`). When empty, Nano Drift auto-detects the package name by reading the `package` attribute from `AndroidManifest.xml`.

Set this explicitly when:

- Auto-detection fails (non-standard project layout).
- The project has multiple `AndroidManifest.xml` files and the wrong one is being picked.
- You want to target a different installed package on the device from the one in the current source tree.

```jsonc
{
  "nanoDrift.packageName": "com.example.myapp.debug",
}
```

Auto-detection searches these paths in order:

1. `<workspace>/app/src/main/AndroidManifest.xml`
2. `<workspace>/src/main/AndroidManifest.xml`
3. `<workspace>/AndroidManifest.xml`

---

## Complete Example

A typical `.vscode/settings.json` for a team project checked into version control:

```jsonc
{
  // Let each developer set ANDROID_HOME in their environment.
  // No SDK path in settings — avoids hardcoded paths per machine.

  // Lightweight build tasks: parallel, no extra verbosity
  "nanoDrift.gradleArgs": ["installDebug", "--parallel"],

  // Explicit package name to avoid relying on manifest parsing in CI
  "nanoDrift.packageName": "com.acme.dashboard",

  // Auto-build on save: enabled for development
  "nanoDrift.autoRunOnSave": true,
}
```

A developer's **user settings** override for a slow laptop where auto-build is distracting:

```jsonc
{
  "nanoDrift.autoRunOnSave": false,
}
```

---

## Setting Precedence

VS Code applies settings in the following order (later overrides earlier):

1. Default values (defined in `packages/extension/package.json`)
2. User settings
3. Remote settings (if using VS Code Remote)
4. Workspace settings (`.vscode/settings.json`)
5. Folder settings (multi-root workspaces)

For `nanoDrift.daemonPort` and `nanoDrift.androidHome`, which are machine-specific, prefer **user settings**. For `nanoDrift.gradleArgs` and `nanoDrift.packageName`, which are project-specific, prefer **workspace settings** and commit them to version control.

---

[← RPC Protocol](./rpc-protocol.md) &nbsp;&nbsp;|&nbsp;&nbsp; [Contributing →](./contributing.md)
