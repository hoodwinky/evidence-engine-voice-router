---
description: "What was exercised in the pilot and what still requires a real device or provider."
---
# Verification and limits

The automated suite runs locally under Node.js 24 with synthetic text and stubbed destinations. It exercises exact transcript preservation, hashing, invalid and ambiguous dates, calendar validation, persistent SQLite capture and restart, idempotency conflicts, immutable originals, stale confirmations, duplicate dispatch, native handoff receipts, redacted uncertain delivery, Unicode calendar escaping, fixed webhook destinations, API token roles, request validation and browser-origin protection.

Run `npm test`, `npm run check` and `npm run demo` in the module directory to reproduce the checks. No credentials or external provider accounts are needed. The demo labels its delivery as synthetic.

The local checks passed: 19 automated tests, source syntax checks, synthetic plugin demo, local documentation-link checks and a package dry run. An attempted browser check could not start because the browser binary was absent; the official browser download returned an invalid archive. Desktop and mobile visual behaviour therefore remain unverified.

Phone-side Shortcuts, native Reminders/Calendar permissions, Android App Actions, real webhook providers and a cloud deployment have not been tested by these checks. The Siri recipe must be assembled and tested on an actual device. The web inbox is a control surface; it does not impersonate a native reminders app.

## Release boundaries

* Runnable: local plugin library, SQLite persistence, HTTP intake, review inbox, reviewed webhook delivery, device handoff protocol and `.ics` export.
* Manual: HTTPS hosting, private token setup, Siri Shortcut assembly, native client fulfilment, GitBook Git Sync configuration.
* Future: packaged Android app, a signed distributable iOS Shortcut, provider-specific calendar invitations, a notification scheduler, multi-user authentication and evidence tracker schema mapping.

The enclosing Evidence Engine repository is private. The [standalone add-on repository](https://github.com/hoodwinky/evidence-engine-voice-router) is public. No npm publication has been completed. Documentation prepared in GitBook is not proof that the site has been published or that Git Sync is connected.
