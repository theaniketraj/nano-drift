# Nano Drift — Documentation

> _Chase the pain. Embrace the drift. At your own pace._

Nano Drift is a VS Code extension for Android development that collapses the build → deploy → observe loop from minutes to seconds. Save a source file; your device refreshes. No terminals. No manual APK installs. No context switching.

---

## Documentation Map

| Document                                          | What it covers                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **[Getting Started](./getting-started.md)**       | Prerequisites, installation, and first run                                                   |
| **[Architecture](./architecture.md)**             | System design, component relationships, data-flow diagrams                                   |
| **[Extension Internals](./extension/README.md)**  | VS Code extension source — activation, commands, status bar, diagnostics                     |
| **[Daemon Internals](./daemon/README.md)**        | Node.js daemon — WebSocket server, Gradle runner, ADB manager, file watcher, screen streamer |
| **[RPC Protocol](./rpc-protocol.md)**             | Complete JSON-RPC 2.0-style protocol reference (requests, responses, push events)            |
| **[Configuration Reference](./configuration.md)** | Every `nanoDrift.*` setting with type, default, and usage guidance                           |
| **[Contributing](./contributing.md)**             | Monorepo setup, coding conventions, debugging, and release process                           |

---

## Quick Concept Overview

### The Drift Loop

The central promise of Nano Drift is the **Drift Loop**: an automatic, zero-touch cycle that fires every time you save a source file.

```bash
Save .kt / .java file
        │
        ▼
  FileWatcher (chokidar)
        │  300 ms debounce
        ▼
  GradleRunner.build()
        │  streams progress via push events
        ▼
  AdbManager.launch()
        │
        ▼
  App refreshes on device
```

Progress is streamed back to the extension in real time. The status bar transitions through **Building…** → **Deploying…** → **Running**, and any Gradle or Kotlin/Java compiler error is surfaced immediately in the VS Code Problems panel — no terminal window required.

### Two-Process Architecture

Nano Drift is deliberately split into two independent processes:

- **Extension** (VS Code renderer process): UI, status bar, diagnostics, Webview screen panel, command handlers.
- **Daemon** (external Node.js process): all heavy I/O — spawning Gradle, managing ADB connections, watching the filesystem, capturing screen frames.

This separation means the daemon can be started standalone, scripted from CI, or extended independently of VS Code. See [Architecture](./architecture.md) for the full rationale.

---

## Project at a Glance

| Attribute        | Value                                                             |
| ---------------- | ----------------------------------------------------------------- |
| Language         | TypeScript 5                                                      |
| Runtime          | Node.js ≥ 18                                                      |
| VS Code engine   | ≥ 1.87.0                                                          |
| Daemon transport | WebSocket (JSON-RPC) on `127.0.0.1:27183`                         |
| Screen transport | WebSocket binary (PNG frames) on `127.0.0.1:27183/screen`         |
| Repo layout      | npm workspaces monorepo (`packages/extension`, `packages/daemon`) |
| License          | MIT                                                               |

---

[Getting Started →](./getting-started.md)
