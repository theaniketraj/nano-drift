# Security Policy — Nano Drift

## Supported Versions

| Version                   | Supported                   |
| ------------------------- | --------------------------- |
| 0.1.x (pre-release)       | ✅ Current — receives fixes |
| Earlier unreleased builds | ❌ Not supported            |

---

## Reporting a Vulnerability

**Please do not open a public GitHub Issue for security vulnerabilities.**

Public issue reports give attackers advance notice before a fix is available.

### Preferred channel — GitHub Private Vulnerability Reporting

1. Navigate to
   [github.com/theaniketraj/nano-drift/security/advisories/new](https://github.com/theaniketraj/nano-drift/security/advisories/new)
2. Fill in the title, description, and any proof-of-concept steps.
3. Submit the draft advisory — only repository maintainers can see it.

### Fallback — direct contact

If GitHub private reporting is unavailable, contact **Aniket Raj** via the
email listed on his [GitHub profile](https://github.com/theaniketraj).

Please include:

- A description of the vulnerability and the affected component.
- Steps to reproduce or a minimal proof-of-concept.
- The version of Nano Drift and VS Code you are running.
- Your assessment of potential impact.

Encrypting your report with PGP is welcome but not required.

---

## Response Timeline

| Milestone                                      | Target                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Acknowledgement                                | Within 72 hours                                                            |
| Initial assessment (confirmed / not confirmed) | Within 7 days                                                              |
| Fix or documented workaround                   | Within 30 days for critical/high; 90 days for medium/low                   |
| Public disclosure                              | After a fix ships, or by mutual agreement on a coordinated disclosure date |

If the timeline cannot be met for a specific issue, an updated estimate will
be provided in the private advisory thread.

---

## Scope

The following surfaces are in scope for security reports:

### Daemon (`packages/daemon`)

- **WebSocket server bind address** — daemon must only bind `127.0.0.1`.
  Reports that it binds `0.0.0.0` or another network interface are critical.
- **Subprocess injection** — `adb` invocations, `./gradlew` invocations,
  or any `child_process` call that constructs shell strings from untrusted
  input.
- **File watcher path traversal** — chokidar paths resolved relative to an
  attacker-controlled project root.

### Extension (`packages/extension`)

- **Webview Content Security Policy** — any bypass that allows script
  injection into the device-screen Webview.
- **Message handler injection** — `onDidReceiveMessage` processing of
  malformed Webview payloads in a way that escalates privileges.
- **URI handler abuse** — if a `vscode://` URI handler is registered and
  can be triggered from an untrusted source.

### Landing site (`landing/`)

- **Persistent XSS** — if user-controlled content is ever persisted and
  reflected in the static site.
- **Dependency supply-chain compromise** — if a CDN asset (Google Fonts,
  jsDelivr) is replaced with malicious content in a way Nano Drift can
  prevent (e.g., by pinning SRI hashes).

### Out of scope

- Vulnerabilities in VS Code itself, Node.js, or ADB that are not
  specific to Nano Drift's usage.
- Self-XSS (where the attack requires running malicious code locally).
- Social-engineering attacks against maintainers.
- Denial of service against a single-user local daemon.
- Issues in third-party CDN or font providers.

---

## Disclosure Policy

Nano Drift follows a **coordinated disclosure** model:

1. Reporter submits privately.
2. Maintainer confirms and assesses severity.
3. Fix is developed and tested.
4. A patch release ships and a GitHub Security Advisory is published.
5. Credit is given to the reporter in the advisory unless they prefer to
   remain anonymous.

---

## Security Design Notes

These notes document intentional security decisions; they are not a
substitute for the code itself.

- **No shell string construction.** All `adb` and Gradle calls use
  `child_process.execFile` / `spawn` with explicit argument arrays.
- **Loopback-only daemon.** The daemon's WebSocket server explicitly binds
  `127.0.0.1`; there is no configuration option to widen the bind address.
- **Webview CSP.** The device-screen Webview sets a `Content-Security-Policy`
  meta tag that restricts scripts to the VS Code extension's own resource URIs
  and `nonce`-gated inline scripts.
- **No telemetry.** No data leaves the user's machine; there is no attack
  surface around data exfiltration by the extension itself.

---

_For general contribution questions (non-security) see [CONTRIBUTING.md](CONTRIBUTING.md)._
