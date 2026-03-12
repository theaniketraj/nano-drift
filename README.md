# Nano Drift

> **Chase the pain → Embrace the drift → At your own pace**

Android development, fully inside VS Code.
No Android Studio. No context-switching. Save → build → deploy — automatically.

```bash
npm install && npm run compile
# then F5 → Extension Development Host
```

**Requires:** Android SDK (`ANDROID_HOME`), Node.js ≥ 18, a project with `gradlew`.

---

## Features

|                        |                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Run on the Fly**     | Save any `.kt` / `.java` / `.xml` file → auto-incremental build + deploy via `./gradlew installDebug`    |
| **Live Device Screen** | Android screen streamed into the VS Code sidebar — tap, swipe, and send keys without touching your phone |
| **Headless Emulator**  | Boot an AVD with no GUI window, controlled entirely from the command palette                             |
| **Wi-Fi Pairing**      | Connect Android 11+ devices wirelessly — supports ADB pairing codes                                      |
| **Status Bar**         | Active device name and build state always visible, one click to switch devices                           |
| **Diagnostics**        | Kotlin/Java compiler errors from Gradle surfaced directly in the Problems panel                          |

---

## How it works

Two processes, one WebSocket:

```bash
Extension Host  
    ── ws://127.0.0.1:27183 ──▶  Daemon (child process)
                                            ├── ADB  (execFile, no shell)
                                            ├── Gradle  (spawn ./gradlew)
                                            └── ScreenStreamer  (~15 fps PNG)
```

→ [Full architecture & code walkthrough](PROJECT_STRUCTURE.md)

---

## Commands

| Command                   | ID                           |
| ------------------------- | ---------------------------- |
| Run on the Fly            | `nanoDrift.runOnTheFly`      |
| Select Active Device      | `nanoDrift.selectDevice`     |
| Start Headless Emulator   | `nanoDrift.startEmulator`    |
| Connect Device over Wi-Fi | `nanoDrift.connectWifi`      |
| Focus Device Screen       | `nanoDrift.showDeviceScreen` |
| Stop Daemon               | `nanoDrift.stopDaemon`       |

---

## Docs

- [Getting started](docs/getting-started.md)
- [Configuration reference](docs/configuration.md)
- [RPC protocol](docs/rpc-protocol.md)
- [Architecture](docs/architecture.md)

---

## Contributing

- [CONTRIBUTING](CONTRIBUTING.md)
- [CHANGELOG](CHANGELOG.md)

---

## License

- [MIT](LICENSE)
- [Privacy](PRIVACY.md)
- [Security](SECURITY.md)
