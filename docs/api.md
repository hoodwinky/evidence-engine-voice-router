---
description: "Use bearer roles, idempotent capture and reviewed action dispatch."
---
# API overview

The code includes an OpenAPI 3.1 document in `openapi.json` at the standalone repository root (or `plugins/voice-router/openapi.json` in the parent checkout). It is the machine-readable endpoint reference. The API has no cookies, browser local-storage credentials or query-string tokens. Use `Authorization: Bearer <token>` over HTTPS outside local development.

The capture token can only create captures. The review token can also read captures, edit derived plans, confirm dispatch, download calendar files and record a device receipt. Use two different random values of at least 32 characters. This is a single-user pilot, not account-based authorisation.

Send JSON with `Content-Type: application/json`. An intake request can include `text`, `source`, `kind`, `title`, `dueAt`, `startAt`, `endAt`, `destination` and `automation`. Unknown fields and non-string values are rejected. `text` supports up to 20,000 characters; HTTP bodies are limited to 64 KiB. Put a stable `Idempotency-Key` header on a capture request; the same key and body return the same capture, while a changed body returns 409.

```json
{
  "text": "Remind me to call the venue",
  "source": "siri",
  "dueAt": "2026-12-01T09:00:00+11:00"
}
```

Every capture response contains the immutable original, its SHA-256, a server receipt time, the derived plan, a revision and the current status. The API returns `needs_details` rather than guessing dates. After a plan edit, send the new revision when confirming; stale revisions return 409. Handoff and delivery states are defined in Routing and review.

The browser client uses same-origin requests. Cross-origin browser API requests are rejected, and no CORS permission is granted. The service allows 120 authenticated writes per minute per token role. Put transport protection and any network-level rate limiting at your own ingress.

Health and static inbox files are public; note content requires a bearer token. Error responses contain a short `error` code and `message`. Provider exception text and secret response bodies are not returned to the caller.
