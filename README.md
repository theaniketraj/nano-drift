# Nano Drift

> **Chase the pain → Embrace the drift → At your own pace**

Android development, fully inside VS Code. No Android Studio. No context-switching.

## What it does

- **On-the-fly builds** — save a Kotlin/Java file and the app auto-builds and deploys to your device via `./gradlew installDebug`.
- **Headless emulator** — launch an AVD with no GUI window, controlled entirely from VS Code.
- **Wi-Fi pairing** — connect physical devices over your local network.
- **Live device screen** — your Android device screen streams into a VS Code Webview panel, with click-to-tap support.
- **Status bar integration** — always see your active device and build state without leaving the editor.

## Prerequisites

- Android SDK with `ANDROID_HOME` / `ANDROID_SDK_ROOT` set
- Node.js ≥ 18
- An Android project with a `gradlew` wrapper

## Getting Started

```bash
npm install
npm run compile
```

Then press **F5** in VS Code to launch the Extension Development Host.

## Architecture

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the full architecture, phase roadmap, and design decisions.

## Commands

| Command                              | Description                        |
| ------------------------------------ | ---------------------------------- |
| `Android: Run on the Fly`            | Build + deploy to active device    |
| `Android: Select Active Device`      | Choose from connected devices      |
| `Android: Start Headless Emulator`   | Boot an AVD without a GUI window   |
| `Android: Connect Device over Wi-Fi` | Pair a physical device via IP      |
| `Android: Show Device Screen`        | Open live screen mirror in Webview |
| `Android: Stop Daemon`               | Shut down the background daemon    |

## License

MIT
