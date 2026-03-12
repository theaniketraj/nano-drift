# Contributing to Nano Drift

Thank you for taking the time to contribute! This file is the quick-start
guide; the full contributor reference (monorepo setup, debugging, release
process, coding conventions) lives in [docs/contributing.md](docs/contributing.md).

---

## Table of Contents

- [Contributing to Nano Drift](#contributing-to-nano-drift)
  - [Table of Contents](#table-of-contents)
  - [Code of Conduct](#code-of-conduct)
  - [How Can I Contribute?](#how-can-i-contribute)
  - [Development Setup](#development-setup)
  - [Commit Convention](#commit-convention)
  - [Pull Request Checklist](#pull-request-checklist)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Security Vulnerabilities](#security-vulnerabilities)

---

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
Please read it before engaging with the community.

---

## How Can I Contribute?

| Way to help             | Where to start                                                 |
| ----------------------- | -------------------------------------------------------------- |
| Fix a bug               | Open an issue first, then submit a PR referencing it           |
| Propose a feature       | Open a GitHub Discussion or issue with the `enhancement` label |
| Improve documentation   | Edit files under `docs/` and submit a PR                       |
| Update the landing site | Edit files under `landing/`                                    |
| Review pull requests    | Any open PR is up for review                                   |
| Triage issues           | Label, reproduce, or close stale issues                        |

---

## Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-fork>/nano-drift.git
cd nano-drift

# 2. Install all dependencies (npm workspaces)
npm install

# 3. Compile both packages
npm run compile

# 4. Launch the Extension Development Host
#    Open the repo in VS Code, then press F5
```

Incremental watch mode (recompiles on save):

```bash
npm run watch
```

After each save, press **Ctrl+R** (`⌘R`) in the Extension Development Host
window to reload the extension.

See [docs/contributing.md](docs/contributing.md) for the full workflow,
including how to debug the daemon, add RPC methods, and add VS Code commands.

---

## Commit Convention

Nano Drift uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <short summary>

[optional body]

[optional footer: closes #<issue>]
```

| Type       | When to use                                    |
| ---------- | ---------------------------------------------- |
| `feat`     | New user-facing feature                        |
| `fix`      | Bug fix                                        |
| `docs`     | Documentation only                             |
| `style`    | Formatting, whitespace (no logic change)       |
| `refactor` | Code restructure with no feature or bug change |
| `perf`     | Performance improvement                        |
| `test`     | Adding or updating tests                       |
| `chore`    | Build scripts, CI, dependency bumps            |
| `revert`   | Reverts a previous commit                      |

**Examples:**

```text
feat(extension): add nanoDrift.openSettings message handler
fix(daemon): skip screencap frame when capture already in-flight
docs: add prev/next navigation to all docs pages
chore: bump typescript to 5.5.0
```

Branch names should follow `<type>/<short-description>`, e.g. `feat/cookie-consent`.

---

## Pull Request Checklist

Before marking a PR ready for review, confirm:

- [ ] `npm run compile` passes with **zero TypeScript errors**
- [ ] `npm run lint` passes with **zero ESLint errors**
- [ ] Code follows the conventions in [docs/contributing.md § Codebase Conventions](docs/contributing.md#7-codebase-conventions)
- [ ] New public functions/classes have at least an inline comment where the logic isn't self-evident
- [ ] Any new VS Code command is declared in `packages/extension/package.json` under `contributes.commands`
- [ ] Any new RPC method is documented in [docs/rpc-protocol.md](docs/rpc-protocol.md)
- [ ] Any new `nanoDrift.*` setting is documented in [docs/configuration.md](docs/configuration.md)
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`
- [ ] PR description explains _what_ changed and _why_

---

## Reporting Bugs

1. Search [existing issues](https://github.com/theaniketraj/nano-drift/issues) first.
2. If it's new, open an issue with the **bug** label and include:
   - VS Code version (`Help → About`)
   - OS and Node.js version (`node --version`)
   - Steps to reproduce
   - Expected vs. actual behavior
   - Contents of the **Nano Drift** output channel (View → Output → Nano Drift)

---

## Suggesting Features

Open an issue with the **enhancement** label. Describe:

- The problem you're trying to solve (not just the solution)
- How it fits the project's goal (collapsing the Android dev loop inside VS Code)
- Any API or UX sketch you have in mind

For large features, consider opening a GitHub Discussion first to gather
feedback before committing to an implementation.

---

## Security Vulnerabilities

**Do not open a public issue for security vulnerabilities.**

Report them privately via the contact method listed on the
[GitHub profile](https://github.com/theaniketraj), or through
[GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
if enabled on this repository.

See [SECURITY.md](SECURITY.md) for the full disclosure policy.
