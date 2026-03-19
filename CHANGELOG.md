# Changelog

All notable changes to Nano Drift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Nano Drift adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 16 March, 2026

Initial public release.

### Added

#### Extension (`packages/extension`)

- H.264 screen streaming mode (~30 fps)
- Multi-device session management
- **Activity bar sidebar** — Device Screen view moved from an editor tab to the VS Code primary sidebar with a dedicated Nano Drift icon.
- **Live device screen** — HTML5 `<canvas>` Webview streams PNG frames from the active device via the daemon's `/screen` WebSocket endpoint at ~10 fps.
- **Click-to-tap / drag-to-swipe** — Canvas pointer events translated to `adb.tap` / `adb.swipe` RPC calls over the daemon channel.
- **Status bar** — Two persistent items: active device indicator (left) and build-action state machine (right).
- **Android: Run on the Fly** — One-command build + deploy via `./gradlew installDebug`.
- **Android: Select Active Device** — QuickPick populated from `adb devices -l`.
- **Android: Start Headless Emulator** — AVD picker launching with `-no-window -no-audio -no-boot-anim`.
- **Android: Connect Device over Wi-Fi** — IP address input with live validation; auto-appends port `:5555`.
- **Android: Show Device Screen** — Focuses / reveals the sidebar Device Screen view.
- **Android: Stop Daemon** — Gracefully shuts down the background daemon process.
- **Auto-run on save** — `nanoDrift.autoRunOnSave` watcher with 300 ms debounce on Android source and Gradle files.
- **Diagnostics** — Kotlin and Java compiler errors surfaced in the VS Code Problems panel (`Ctrl+Shift+M`) with source links.
- **SDK detection** — Resolves `ANDROID_HOME` / `ANDROID_SDK_ROOT` with a fallback to `nanoDrift.androidHome` setting.
- **Nano Drift-specific settings** — Settings icon in the Device Screen panel opens the Settings UI pre-filtered to `nanoDrift.*` entries.
- **Under-display camera aesthetic** — Ultra-thin phone bezels with no visible front camera in the Device Screen Webview.

#### Daemon (`packages/daemon`)

- **WebSocket JSON-RPC server** — Listens on `127.0.0.1:27183` (configurable). Handles `devices.*`, `emulator.*`, `adb.*`, `gradle.*`, and `watcher.*` methods.
- **Screen WebSocket** — Separate `/screen` endpoint relays binary PNG frames with back-pressure via a `capturing` flag.
- **Gradle runner** — Streams `stdout`/`stderr` line-by-line; parses Kotlin (new+old format) and Java error lines into structured `BuildError` objects.
- **ADB manager** — Typed wrappers for `adb devices`, `am start`, `input tap/swipe`, `exec-out screencap`, `connect`, and `emulator` invocations.
- **File watcher** — chokidar-based watcher with `awaitWriteFinish` (300 ms stability threshold) targeting `app/src/**` and Gradle build files; excludes `build/` and `.gradle/`.
- **Build cycle** — Push-based progress events (`building` → `output` → `deploying` → `done` | `error`) broadcast to all connected RPC clients.
- **Standalone CLI** — `node out/index.js [--port N]` for CI / scripted usage without VS Code.

#### Documentation (`docs/`)

- Architecture, Extension Internals, Daemon Internals, RPC Protocol Reference, Configuration Reference, Getting Started, and Contributing guides.
- Prev / next page navigation at the bottom of every docs page.

#### Landing site (`landing/`)

- Static single-page site with hero, features, terminal animation, FAQ, and integrated docs viewer.
- Docs are rendered client-side from Markdown via `marked`; bundled in `docs-bundle.js` for `file://` compatibility.
- "pace." typewriter animation in Pacifico font on the hero heading.
- Prev / next navigation converted to styled button components in the docs viewer.

### Security

- Daemon binds exclusively to `127.0.0.1` — never reachable from external hosts.
- Webview CSP restricts `connect-src` to `ws://localhost:<port>` only.
- All subprocess invocations use `execFile` / `spawn` with explicit argument arrays — no shell string interpolation.

---

[Unreleased](https://github.com/theaniketraj/nano-drift/compare/v0.2.0...HEAD)
[0.2.0](https://github.com/theaniketraj/nano-drift/releases/tag/v0.2.0)
[0.1.0](https://github.com/theaniketraj/nano-drift/releases/tag/v0.1.0)
