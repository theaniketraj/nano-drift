# Cookie Consent — Nano Drift Landing Site

> **Status: Planned — not yet implemented**
>
> This document describes the upcoming cookie consent implementation for the
> Nano Drift landing site. The consent banner is a tracked item in
> [CHANGELOG.md](CHANGELOG.md) (`[Unreleased]` section).

---

## Current State

The landing site (`landing/`) currently:

- Sets **no cookies** of any kind.
- Uses one `localStorage` entry (`nd-theme`) to persist your color-scheme
  preference. This is not a cookie and does not require consent under any
  privacy regulation.
- Loads fonts from Google Fonts CDN and highlight.js from jsDelivr. These
  CDN requests may cause the providers to log your IP address in their
  standard access logs. Nano Drift has no access to those logs.

No consent banner is displayed because there is currently nothing to consent
to that is within Nano Drift's control.

---

## Planned Implementation

When the first cookie or third-party tracker that requires consent is
introduced (e.g., an analytics platform), the following will be deployed:

### Banner behavior

| Event                              | Effect                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| First visit — no stored preference | Banner appears at bottom of page                                    |
| User clicks "Accept"               | Accepted flag stored in `localStorage`; optional scripts loaded     |
| User clicks "Reject"               | Rejected flag stored in `localStorage`; optional scripts not loaded |
| User clicks "Manage preferences"   | Granular toggle panel opens                                         |
| Subsequent visits                  | Banner is suppressed; stored preference is honoured                 |

### Consent categories planned

| Category           | Always on? | User toggleable? | Description                                 |
| ------------------ | ---------- | ---------------- | ------------------------------------------- |
| Strictly necessary | ✅ Yes     | No               | Theme preference (`nd-theme`), consent flag |
| Analytics          | No         | ✅ Yes           | Aggregate page-view metrics (provider TBD)  |
| Preferences        | No         | ✅ Yes           | Any future personalisation beyond theme     |

### Technical approach

- Pure HTML/CSS/JS, no third-party consent-management platform (CMP).
- Consent flag stored in `localStorage` as `nd-cookie-consent` → `"accepted"` /
  `"rejected"` / `{ analytics: boolean, preferences: boolean }`.
- Optional scripts are injected into `<head>` only after consent is granted.
- The banner respects the `prefers-reduced-motion` media query.
- Accessible: meets WCAG 2.1 AA (keyboard navigable, ARIA roles, colour
  contrast ≥ 4.5:1).

### Files that will be modified

```
landing/
├── index.html            ← consent banner markup added to <body>
├── styles.css            ← .cookie-banner, .cookie-btn-* styles
└── script.js             ← initConsent() IIFE, conditional script injection
```

---

## Regulatory Context

The landing site is a static documentation page with no user accounts and
no commercial activity. Cookie consent obligations currently arise from the
EU ePrivacy Directive / GDPR only if cookies other than strictly-necessary
ones are set. As long as the site sets no such cookies, a consent banner is
not legally required but will be provided voluntarily as a best practice.

---

## Updates

This file and [PRIVACY.md](PRIVACY.md) will both be updated when the consent
banner ships. See [CHANGELOG.md](CHANGELOG.md) for release notes.

**Contact:** [github.com/theaniketraj](https://github.com/theaniketraj)
