# Contributing

This document covers everything needed to build, run, debug, and extend Nano Drift as a contributor or downstream maintainer.

---

## Contents

1. [Repository Layout](#1-repository-layout)
2. [Prerequisites](#2-prerequisites)
3. [Initial Setup](#3-initial-setup)
4. [Building](#4-building)
5. [Running in the Extension Development Host](#5-running-in-the-extension-development-host)
6. [Debugging](#6-debugging)
7. [Codebase Conventions](#7-codebase-conventions)
8. [Adding a New RPC Method](#8-adding-a-new-rpc-method)
9. [Adding a New VS Code Command](#9-adding-a-new-vs-code-command)
10. [Release Process](#10-release-process)

---

## 1. Repository Layout

```
nano-drift/                          ← npm workspaces monorepo root
├── package.json                     ← root scripts: compile, watch, lint, clean
├── packages/
│   ├── extension/                   ← VS Code extension (TypeScript)
│   │   ├── package.json             ← extension manifest + contributes
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── sdk.ts
│   │   │   ├── statusBar.ts
│   │   │   ├── diagnostics.ts
│   │   │   ├── daemon/client.ts
│   │   │   └── commands/
│   │   └── out/                     ← compiled JS (gitignored)
│   └── daemon/                      ← Node.js daemon (TypeScript)
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── adb/index.ts
│       │   ├── gradle/index.ts
│       │   ├── watcher/index.ts
│       │   └── screen/index.ts
│       └── out/                     ← compiled JS (gitignored)
├── docs/                            ← this documentation
├── .vscode/
│   ├── launch.json                  ← debugger configurations
│   └── tasks.json                   ← build tasks
└── DEVELOPMENT_PLAN.md              ← roadmap and phase tracking
```

---

## 2. Prerequisites

| Tool                       | Minimum version              | Purpose                                  |
| -------------------------- | ---------------------------- | ---------------------------------------- |
| Node.js                    | 18.0.0                       | Runtime for daemon and build tooling     |
| npm                        | 9.0.0 (bundled with Node 18) | Package manager and workspace runner     |
| TypeScript                 | 5.4 (installed via devDeps)  | Compiler                                 |
| VS Code                    | 1.87.0                       | Extension Development Host               |
| Android SDK Platform-tools | Any with `adb`               | End-to-end testing of extension commands |

---

## 3. Initial Setup

Clone the repository and install all dependencies from the monorepo root:

```bash
git clone https://github.com/theaniketraj/nano-drift.git
cd nano-drift
npm install
```

npm workspaces automatically installs dependencies for both packages and hoists shared modules to the root `node_modules`.

---

## 4. Building

All build commands are available from the monorepo root:

| Command           | Effect                                            |
| ----------------- | ------------------------------------------------- |
| `npm run compile` | One-shot TypeScript compilation for both packages |
| `npm run watch`   | Incremental watch compilation for both packages   |
| `npm run clean`   | Remove both `out/` directories                    |
| `npm run lint`    | Run ESLint on all TypeScript source files         |

To compile a single package:

```bash
cd packages/extension && npm run compile
cd packages/daemon    && npm run compile
```

### Compilation output

Both packages compile to their respective `out/` directories using `tsc`. The extension compiles to `packages/extension/out/extension.js`; the daemon to `packages/daemon/out/index.js`.

TypeScript `strict` mode is enabled in both `tsconfig.json` files. All type errors are blocking — there should be zero diagnostics on a clean build.

---

## 5. Running in the Extension Development Host

This is the standard development workflow for VS Code extensions.

1. **Open the monorepo root** in VS Code.
2. Run **`npm run watch`** to keep both packages compiled incrementally.
3. Press **F5** (or open Run and Debug → **Launch Extension**).

VS Code starts a new **Extension Development Host** window with the extension loaded from `packages/extension/out/extension.js`.

1. In the Development Host, open an Android project folder.
2. The extension activates automatically. The Nano Drift status bar items appear.

The daemon is spawned on first command invocation, pointing at `packages/daemon/out/index.js` relative to the extension's compiled output directory.

### Reloading after code changes

When `watch` mode is active, saving a TypeScript file triggers recompilation within ~1 second. Press **Ctrl+R** (or **⌘R**) in the Extension Development Host window to reload the extension without restarting the full Development Host.

---

## 6. Debugging

### Debugging the Extension

The `.vscode/launch.json` configuration **Launch Extension** attaches the Node.js debugger to the Extension Development Host. Set breakpoints in extension TypeScript source files normally — VS Code maps through source maps automatically.

### Debugging the Daemon

Add a second launch configuration or use a terminal:

```bash
# Start with --inspect to enable debugger
node --inspect packages/daemon/out/index.js --port 27183
```

Then attach via **Run and Debug** → **Attach to Node Process** in VS Code, or use Chrome DevTools at `chrome://inspect`.

Alternatively, set `NODE_OPTIONS=--inspect` in the extension's daemon spawn arguments in `daemon/client.ts` during development:

```typescript
this.daemonProcess = cp.spawn(
  "node",
  ["--inspect=9229", daemonEntry, "--port", String(this.port)],
  {
    /* ... */
  },
);
```

This will break on the first `debugger` statement or on any set breakpoints.

### Viewing Daemon Logs

Open **View → Output** → **Nano Drift** in the Extension Development Host. All daemon stdout/stderr is piped here, including Gradle build output.

---

## 7. Codebase Conventions

### TypeScript

- **Strict mode** is enforced (`"strict": true` in both `tsconfig.json` files). No `any` except where unavoidable for external library interop.
- **`as` casts** are permitted only at system boundaries (WebSocket message parsing, third-party library returns). Internal code must use properly typed values.
- **`void` returns** from Promise callbacks: use `void expression` (not `// eslint-disable`). Example: `void this.rpc('devices.setActive', { serial })`.
- **No `console.log` in the extension package** beyond activation/deactivation lifecycle messages. Use the `outputChannel.appendLine()` in `DaemonClient` instead.
- **Daemon logging** uses `console.log` and `console.error` prefixed with `[nano-drift-daemon]`.

### File Structure

- Each RPC method handler is registered in `DaemonServer.registerHandlers()` — not spread across modules.
- Each VS Code command is in its own file under `commands/`. The `index.ts` file only registers them.
- Modules do not import from sibling modules at the same level except through `index.ts` re-exports.

### Error Messages

Error messages shown to the user (notifications, status bar tooltips) must:

- Begin with "Nano Drift:" as a prefix for user-visible notifications.
- Be a single sentence or the first line of a multi-line error (use `.split('\n')[0]`).
- Offer a **Show Output** action where the full details are long or technical.

---

## 8. Adding a New RPC Method

This section walks through adding a hypothetical `adb.reboot` method end-to-end.

### Step 1 — Implement the operation in `AdbManager`

```typescript
// packages/daemon/src/adb/index.ts
async reboot(serial: string): Promise<void> {
    await this.exec('-s', serial, 'reboot');
}
```

### Step 2 — Register the handler in `DaemonServer`

```typescript
// packages/daemon/src/server.ts  — inside registerHandlers()
this.reg("adb.reboot", (p) => {
  const { serial } = p as { serial: string };
  return this.adb.reboot(serial);
});
```

### Step 3 — Add the client method in `DaemonClient`

```typescript
// packages/extension/src/daemon/client.ts
async reboot(serial: string): Promise<void> {
    return this.rpc<void>('adb.reboot', { serial });
}
```

### Step 4 — Document the method

Add an entry to the [Method Reference](./rpc-protocol.md) with the params interface and result type.

### Step 5 — Expose it via a command (if user-facing)

See [Adding a New VS Code Command](#9-adding-a-new-vs-code-command) below.

---

## 9. Adding a New VS Code Command

This section adds a hypothetical `nanoDrift.rebootDevice` command.

### Step 1 — Declare the command in `package.json`

```jsonc
// packages/extension/package.json — contributes.commands
{
  "command": "nanoDrift.rebootDevice",
  "title": "Reboot Active Device",
  "category": "Android",
}
```

### Step 2 — Create the command handler

```typescript
// packages/extension/src/commands/rebootDevice.ts
import * as vscode from "vscode";
import type { CommandDeps } from "./index";

export async function rebootDevice(deps: CommandDeps): Promise<void> {
  const { daemonClient } = deps;

  const devices = await daemonClient.listDevices();
  const active = devices.find((d) => d.state === "device");
  if (!active) {
    vscode.window.showWarningMessage("No device is currently connected.");
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Rebooting ${active.name}…`,
    },
    () => daemonClient.reboot(active.serial),
  );

  vscode.window.showInformationMessage(`${active.name} is rebooting.`);
}
```

### Step 3 — Register the command in `commands/index.ts`

```typescript
import { rebootDevice } from './rebootDevice';

// inside registerCommands():
vscode.commands.registerCommand('nanoDrift.rebootDevice', () => rebootDevice(deps)),
```

### Step 4 — Verify types compile

```bash
cd packages/extension && npm run compile
```

---

## 10. Release Process

### Versioning

Nano Drift follows [Semantic Versioning](https://semver.org/):

- **Patch** (`0.1.x`): bug fixes, no new features or protocol changes.
- **Minor** (`0.x.0`): new commands, settings, or RPC methods (backward-compatible).
- **Major** (`x.0.0`): breaking RPC protocol changes, VS Code engine bumps.

Both `packages/extension/package.json` and `packages/daemon/package.json` should be bumped to the same version on each release.

### Pre-release Checklist

```
[ ] Both packages compile with zero TypeScript errors
[ ] npm run lint passes with zero errors
[ ] Manual smoke test: open an Android project, trigger a build, confirm deploy
[ ] Manual smoke test: auto-run on save cycle end-to-end
[ ] Manual smoke test: Show Device Screen Webview
[ ] DEVELOPMENT_PLAN.md phase status is up to date
[ ] CHANGELOG.md entry written (if maintained)
```

### Building the VSIX

```bash
npm run compile
cd packages/extension
npx vsce package
# Produces: nano-drift-<version>.vsix
```

### Publishing to the VS Code Marketplace

```bash
cd packages/extension
npx vsce publish
```

Requires a `VSCE_PAT` Personal Access Token from the [Visual Studio Marketplace publisher portal](https://marketplace.visualstudio.com/manage).

### Publishing the Daemon to npm (optional)

```bash
cd packages/daemon
npm publish --access public
```

This allows advanced users to install the daemon globally (`npm install -g @nano-drift/daemon`) and run it independently of VS Code.
