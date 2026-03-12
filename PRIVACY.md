# Privacy Policy — Nano Drift

_Last updated: March 12, 2026_

---

## Overview

Nano Drift is a **VS Code extension and local Node.js daemon** that runs
entirely on your own machine. It does not have a backend server, does not
create user accounts, and does not transmit any personal or project data to
any third party.

This policy covers:

- The **VS Code extension** (`packages/extension`)
- The **local daemon** (`packages/daemon`)
- The **landing site** at `https://theaniketraj.github.io/nano-drift/`

---

## Extension and Daemon

### Data collected

**None.** The extension and daemon do not collect, store, transmit, or process
any personally identifiable information.

All operations are local:

| Operation                  | Where it runs                                 | Leaves your machine? |
| -------------------------- | --------------------------------------------- | -------------------- |
| Gradle build               | Your machine via `./gradlew`                  | No                   |
| ADB device communication   | USB / local Wi-Fi only                        | No                   |
| Screen capture             | `adb exec-out screencap -p` → VS Code Webview | No                   |
| File watching              | chokidar on local paths                       | No                   |
| Settings and configuration | VS Code `settings.json`                       | No                   |

### Network

The daemon binds a WebSocket server exclusively to `127.0.0.1` (loopback).
It is not reachable from outside your local machine. No outbound HTTP or
WebSocket connections are made by the extension or the daemon.

### Telemetry

Nano Drift does **not** include any telemetry, analytics, crash reporting, or
usage tracking of any kind. VS Code's own telemetry settings (`telemetry.telemetryLevel`)
are unaffected by and unrelated to this extension.

### Subprocess security

- All `adb` calls use `execFile` with explicit argument arrays — no shell
  string interpolation.
- Gradle is invoked via `spawn` with an explicit args array; `shell: true` is
  used only on Windows where `.bat` files require it.
- Tap/swipe coordinates are TypeScript-typed integers; no freeform string
  arguments are constructed from user input.

---

## Landing Site

The landing site is a static HTML/CSS/JavaScript site hosted on
**GitHub Pages**. It does not run any server-side code.

### What the site does NOT do

- It does not set any first-party cookies.
- It does not use any analytics or tracking scripts (no Google Analytics,
  Plausible, Mixpanel, etc.).
- It does not collect form submissions, email addresses, or any user input.
- It does not use session storage or local storage for tracking purposes.

### Third-party resources loaded by the site

| Resource                                | Provider     | Purpose                  | Privacy policy                                                                                                          |
| --------------------------------------- | ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Inter & JetBrains Mono & Pacifico fonts | Google Fonts | Typography               | [fonts.google.com/privacy](https://fonts.google.com/privacy)                                                            |
| highlight.js stylesheet                 | jsDelivr CDN | Code syntax highlighting | [jsdelivr.com/privacy](https://www.jsdelivr.com/privacy)                                                                |
| GitHub Pages hosting                    | GitHub       | Static site hosting      | [docs.github.com/site-policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |

When your browser loads these third-party resources, the providers may log
your IP address as part of their standard CDN/hosting operations. Nano Drift
has no control over or access to those logs.

### Cookie consent

A cookie consent banner is planned for a future release. At that time this
policy will be updated. Currently no cookies are set by the landing site.
See [COOKIE_CONSENT.md](COOKIE_CONSENT.md) for the upcoming implementation
plan.

### Local storage

The site stores one item in `localStorage`:

| Key        | Value                 | Purpose                                              |
| ---------- | --------------------- | ---------------------------------------------------- |
| `nd-theme` | `"dark"` or `"light"` | Remembers your preferred color scheme between visits |

This value never leaves your browser and is not transmitted anywhere.

---

## Open Source and Transparency

Nano Drift is fully open source under the [MIT License](LICENSE). You can
audit every line of code that runs on your machine:

- Extension source: [`packages/extension/src/`](packages/extension/src/)
- Daemon source: [`packages/daemon/src/`](packages/daemon/src/)
- Landing site: [`landing/`](landing/)

---

## Changes to This Policy

Significant changes will be noted in [CHANGELOG.md](CHANGELOG.md) and this
document's "Last updated" date will be revised. For minor editorial fixes
(typos, clarifications that don't change substance), no announcement will
be made.

---

## Contact

Questions about this privacy policy can be directed to:

**Aniket Raj** — [github.com/theaniketraj](https://github.com/theaniketraj)
