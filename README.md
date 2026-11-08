# Evidence Engine Voice Router

A reusable FreeX add-on that keeps dictated words intact and prepares a reviewed action for a note, reminder, calendar event or named automation.

**Version 0.1: runnable, self-hosted single-user pilot.** The library, HTTP service, persistent inbox and synthetic tests work. Phone setup is a manual Siri Shortcut recipe; no signed iOS shortcut or Android app ships in this version. Nothing is installed on your phone by cloning this code.

| Route | Implemented behaviour |
| --- | --- |
| Note | Save the exact transcript, source label, server timestamp and SHA-256 to SQLite |
| Reminder | Prepare a dated native-device handoff, or send to an explicitly configured webhook adapter after review |
| Calendar | Prepare a native-device handoff, export an `.ics` file, or use a configured adapter |
| Automation | Send a confirmed, structured action to a named, preconfigured HTTPS webhook |

A calendar file creates no attendee invitation by itself. The router has no built-in notification scheduler. A device handoff is marked complete only after the client reports creating the item. A webhook success means the endpoint acknowledged the request; the endpoint owns its downstream work.

## Run locally

Requires **Node.js 24+**. There are no third-party dependencies and no package install step.

```sh
git clone https://github.com/hoodwinky/evidence-engine-voice-router.git
cd evidence-engine-voice-router
cp .env.example .env
# Generate two different tokens. Paste them into CAPTURE_TOKEN and REVIEW_TOKEN in .env.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm test
npm start
```

Open `http://127.0.0.1:4181`, enter your review token, and save a synthetic note. The review token remains in page memory; reloading forgets it. Keep `.env` and `data/` outside version control. For a phone, provide your own HTTPS endpoint and set `PUBLIC_ORIGIN`; your phone cannot reach a server through the phone's own localhost address.

## Capture and review

```sh
curl http://127.0.0.1:4181/v1/captures \
  -H "Authorization: Bearer $CAPTURE_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: synthetic-note-001' \
  --data '{"text":"Remind me to call the venue","source":"api","dueAt":"2026-12-01T09:00:00+11:00"}'
```

`CAPTURE_TOKEN` in this example is a shell variable; `npm start` reads `.env` for the server only. Set the shell variable privately before using curl; do not publish the key.

Plain text stays a note. Explicit prefixes select a route: `Note:`, `Remind:`, `Remind me to …`, `Calendar:` and `Automate <name>:`. You can also send a `kind` field. Relative dates remain unparsed; provide a timestamp including seconds and a UTC offset, or finish the details in the inbox. Capturing never executes an external action.

## Use as a plugin

Import `VoiceRouter` from `src/router.mjs` and register destination functions. `npm run demo` exercises the plugin contract entirely with synthetic data. [Host integration](docs/integration.md) describes the contract and the boundary with the existing Evidence Engine wireframe.

## Documentation

Start with the [guide](docs/README.md), [quick start](docs/quickstart.md), [Siri recipe](docs/siri.md), [Android options](docs/android.md), [API overview](docs/api.md) and [data handling](docs/privacy.md). The [OpenAPI document](openapi.json) describes the HTTP interface. `docs/SUMMARY.md` is ready for GitBook.

This directory is independently packable with `npm pack`. The source is available in the public [add-on repository](https://github.com/hoodwinky/evidence-engine-voice-router). It is not yet published to npm. The MIT licence in this directory applies only to this add-on; it does not license the surrounding Evidence Engine product or third-party tools.
