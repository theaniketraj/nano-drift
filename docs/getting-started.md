# Getting Started

This guide walks you through every prerequisite, installation step, and first-run verification needed to have the Drift Loop running end-to-end.

---

## 1. Prerequisites

Before installing Nano Drift, confirm the following are present on your system:

### Required

| Dependency                     | Minimum version                                     | How to verify    |
| ------------------------------ | --------------------------------------------------- | ---------------- |
| **Node.js**                    | 18.0.0                                              | `node --version` |
| **Android SDK** Platform-tools | Any (`adb` in PATH or `ANDROID_HOME` set)           | `adb version`    |
| **VS Code**                    | 1.87.0                                              | Help → About     |
| **Android project**            | Gradle wrapper required (`gradlew` / `gradlew.bat`) | N/A              |

### Recommended

| Dependency                           | Purpose                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| **Android SDK Emulator** package     | Headless emulator via `Android: Start Headless Emulator` |
| ADB Wireless Debugging (Android 11+) | Wireless device connection without USB                   |

### Environment Variable

Set `ANDROID_HOME` (or the legacy `ANDROID_SDK_ROOT`) to the root of your Android SDK installation. On typical machines:

| Platform | Default path                               |
| -------- | ------------------------------------------ |
| Windows  | `C:\Users\<you>\AppData\Local\Android\Sdk` |
| macOS    | `~/Library/Android/sdk`                    |
| Linux    | `~/Android/Sdk`                            |

If you prefer not to set an environment variable, you can configure the path directly in VS Code settings:

```jsonc
// .vscode/settings.json
{
  "nanoDrift.androidHome": "C:\\Users\\you\\AppData\\Local\\Android\\Sdk",
}
```

---

## 2. Installing the Extension

### From the VS Code Marketplace (recommended)

1. Open the **Extensions** view (`Ctrl+Shift+X` / `⌘⇧X`).
2. Search for **Nano Drift**.
3. Click **Install**.

### From a `.vsix` file (pre-release / self-built)

```bash
# Build the extension package from the monorepo root
npm run compile
cd packages/extension && npx vsce package

# Install it
code --install-extension nano-drift-0.2.0.vsix
```

### From source (development mode)

See the [Contributing guide](./contributing.md) for the full development workflow, including how to open the Extension Development Host.

---

## 3. SDK Detection

On **first activation** in any Android project, Nano Drift checks for the Android SDK in this priority order:

1. `nanoDrift.androidHome` VS Code setting
2. `ANDROID_HOME` environment variable
3. `ANDROID_SDK_ROOT` environment variable

If none are found, a warning notification appears:

> **Nano Drift: ANDROID_HOME is not set. The Android SDK is required.**

Click **Open Settings** to configure `nanoDrift.androidHome`. The `adb` and `emulator` binaries will be resolved relative to this path:

```xml
$ANDROID_HOME/platform-tools/adb        (Linux / macOS)
$ANDROID_HOME/platform-tools/adb.exe    (Windows)
$ANDROID_HOME/emulator/emulator         (Linux / macOS)
$ANDROID_HOME/emulator/emulator.exe     (Windows)
```

If `ANDROID_HOME` is not set but `adb` is on your system `PATH`, the extension will fall back to calling `adb` directly without the full path.

---

## 4. Opening an Android Project

Nano Drift activates automatically when VS Code detects any of these files in your workspace:

- `**/AndroidManifest.xml`
- `**/build.gradle`
- `**/build.gradle.kts`

Simply open the **root** of your Android project (the directory containing `gradlew` / `gradlew.bat`) as a VS Code workspace folder.

```bash
MyApp/                     ← open this folder in VS Code
├── app/
│   ├── src/main/
│   │   └── AndroidManifest.xml
│   └── build.gradle
├── build.gradle
├── gradlew
└── gradlew.bat
```

Once activated, the Nano Drift status bar items appear in the bottom status bar:

```cmd
$(device-mobile) No Device     $(run) Run on the Fly
```

---

## 5. Connecting a Device

### 5a. Physical Device over USB

1. Enable **Developer Options** on your Android device.
2. Enable **USB Debugging** in Developer Options.
3. Connect the device via USB cable.
4. Accept the "Allow USB debugging" prompt on the device.
5. In VS Code, open the Command Palette (`Ctrl+Shift+P`) and run:
   > **Android: Select Active Device**
6. Your device should appear in the Quick Pick list. Select it.

The status bar device item updates to reflect the selected device name.

### 5b. Physical Device over Wi-Fi

**Android 11 and later (Wireless Debugging)**:

1. On the device, go to Settings → Developer Options → **Wireless Debugging** → Pair device with pairing code.
2. Note the IP address and port shown on screen.
3. In VS Code, run **Android: Connect Device over Wi-Fi** and enter `<ip>:<port>`.

**Android 10 and earlier (manual `adb tcpip`)**:

1. Connect the device via USB once to authorize:

   ```bash
   adb tcpip 5555
   ```

2. Disconnect USB. Find the device's IP address in Settings → Wi-Fi → (your network).
3. Run **Android: Connect Device over Wi-Fi** and enter `<ip>`.  
   (Port 5555 is appended automatically if omitted.)

> **Note**: Wi-Fi ADB connections have higher round-trip latency than USB, which will slightly increase APK push time during deployment.

### 5c. Emulator (Android Virtual Device)

Create an AVD using Android Studio's AVD Manager or the `avdmanager` CLI. Then:

1. Run **Android: Start Headless Emulator** from the Command Palette.
2. Select your AVD from the list.
3. The emulator starts in **headless mode** (no GUI window) as a background process.
4. Once the emulator boots (10–60 seconds depending on hardware), run **Android: Select Active Device** and choose the `emulator-XXXX` entry.

> **Headless mode**: The emulator runs with `-no-window -no-audio -no-boot-anim`. This is suitable for build/test cycles and frees screen space. Use the **Show Device Screen** command to see the emulator output inside VS Code.

---

## 6. Your First Drift Build

With a device or emulator selected, trigger a build manually:

**Option A — Command Palette**:

```cmd
⌘ ⇧P  (or Ctrl+Shift+P)  →  Android: Run on the Fly
```

**Option B — Status bar**:
Click the `$(run) Run on the Fly` item in the bottom status bar.

**Option C — Editor title bar**:
The run button (▷) appears in the editor title bar when an Android project is open.

### What happens

1. The status bar transitions: `Building…` → `Deploying…` → `Running`.
2. The **Nano Drift** output channel receives a live stream of Gradle output.
3. The app launches on the selected device.

### Build errors

If Gradle exits non-zero, the status bar shows `$(error) Build Failed`. A notification appears:

> **Nano Drift build failed: `<first line of message>`** [Show Output]

Compilation errors from Kotlin and Java are parsed and appear in the **Problems** panel (`Ctrl+Shift+M`) with direct links to the failing source lines.

---

## 7. Enabling Auto-Run on Save

Auto-Run on Save is **enabled by default**. When active, Nano Drift watches your project's source tree and triggers a build automatically 300 ms after the last detected file save — no manual invocation needed.

### Verify it is enabled

```jsonc
// Workspace or user settings
{
  "nanoDrift.autoRunOnSave": true,
}
```

Or check the status bar: if a watcher is active, the daemon is monitoring your `app/src/` directory and Gradle files.

### Paths monitored

| Path                   | Trigger                    |
| ---------------------- | -------------------------- |
| `app/src/**`           | Any source file change     |
| `app/build.gradle`     | Dependency / config change |
| `app/build.gradle.kts` | Dependency / config change |
| `build.gradle`         | Root project config change |
| `build.gradle.kts`     | Root project config change |
| `settings.gradle`      | Module inclusion changes   |
| `settings.gradle.kts`  | Module inclusion changes   |

### Paths ignored

| Pattern                | Reason                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| `**/build/**`          | Gradle output directory — changes here are artefacts, not sources |
| `**/.gradle/**`        | Gradle cache directory                                            |
| Dotfiles / hidden dirs | IDE metadata, version-control internals                           |

### Disabling auto-run

```jsonc
{
  "nanoDrift.autoRunOnSave": false,
}
```

The watcher stops immediately. Use **Android: Run on the Fly** to trigger manual builds.

---

## 8. Viewing the Device Screen

Nano Drift includes a live device screen panel that streams PNG frames directly from the device:

1. Run **Android: Show Device Screen** from the Command Palette.
2. A **Device Screen** Webview panel opens beside the current editor.
3. The panel automatically connects to the daemon's `/screen` WebSocket endpoint.

### Interacting with the device

| Gesture        | Action                                      |
| -------------- | ------------------------------------------- |
| Click          | Tap at the corresponding device coordinates |
| Click and drag | Swipe from start point to end point         |

Coordinates are scaled to the device's actual resolution automatically, regardless of the canvas display size.

> **Frame rate**: The screen streamer captures approximately 10 frames per second using `adb exec-out screencap -p`. This is adequate for observing app state during development. A higher-performance H.264 streaming mode is planned for a future release.

---

## 9. Verifying the Daemon

The daemon process is managed automatically and should require no manual intervention. To inspect its state:

**Output channel**: View → Output → **Nano Drift** in the dropdown. All daemon logs, build output, and ADB responses appear here.

**Manual shutdown**: Run **Android: Stop Daemon** from the Command Palette. The next command will automatically restart it.

**Standalone start** (for debugging or CI use):

```bash
node packages/daemon/out/index.js --port 27183
```

Confirm it is listening:

```bash
# Expected: "Listening on ws://127.0.0.1:27183"
node packages/daemon/out/index.js
```

---

## 10. Troubleshooting

### `adb: command not found` / no devices detected

- Ensure `ANDROID_HOME` is set and `$ANDROID_HOME/platform-tools` is on your `PATH`.
- Alternatively, set `nanoDrift.androidHome` in VS Code settings.
- Run `adb devices` in a terminal to confirm ADB can see your device.

### `Gradle wrapper not found`

Nano Drift requires a Gradle wrapper (`gradlew` / `gradlew.bat`) in the project root. Open the **root** of your Android project as the VS Code workspace folder — not a subdirectory.

### Build triggers unexpectedly / too frequently

The 300 ms debounce window is fixed in the current release. If your editor writes files in multiple rapid bursts (e.g., auto-format on save), each burst resets the timer and only the final save triggers a build. Adjust `nanoDrift.autoRunOnSave` to `false` if you prefer purely manual control.

### Webview screen panel shows "Daemon not reachable"

1. Trigger any build command to ensure the daemon is running.
2. Confirm no other process is using port 27183 (`nanoDrift.daemonPort` in settings).
3. Check the Nano Drift output channel for daemon startup errors.

### Package name not detected

Auto-detection reads `package="..."` from `AndroidManifest.xml` in these candidate locations (in order):

1. `app/src/main/AndroidManifest.xml`
2. `src/main/AndroidManifest.xml`
3. `AndroidManifest.xml`

If your project layout differs, set the package name explicitly:

```jsonc
{
  "nanoDrift.packageName": "com.example.myapp",
}
```

---

[← Home](./index.md) &nbsp;&nbsp;|&nbsp;&nbsp; [Architecture →](./architecture.md)
