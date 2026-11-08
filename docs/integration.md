---
description: "Embed the router as an Evidence Engine module without assuming a legacy tracker schema."
---
# Host integration

The plugin's public entry point exports `VoiceRouter`, `RouterError`, `planCapture`, `calendarFile` and `webhookDestinations`. Use a persistent database path for real captures. The default in-memory database is intended for tests and examples.

```javascript
import { VoiceRouter } from '@freex/evidence-engine-voice-router';

const router = new VoiceRouter({
  filename: './private-data/voice-notes.sqlite',
  destinations: {
    myCalendar: async ({ capture, idempotencyKey }) => {
      // Your host implements authenticated provider access and downstream idempotency.
      const event = await myCalendarClient.create(capture.plan, { idempotencyKey });
      return { externalId: event.id };
    }
  }
});
```

The package is not on npm yet. For local installation, run `npm pack` in the module directory and install that tarball in the host. The sample calendar client above is illustrative; the runnable, dependency-free example is `examples/plugin.mjs` and uses only synthetic data.

Destination adapters are trusted operator code. They receive the full capture in memory, so each adapter must deliberately limit what it sends. They resolve only when the destination has acknowledged the operation and return only non-secret receipt metadata. The built-in webhook adapter limits outbound data and never stores provider response bodies.

Call `capture()` to preserve the original and create a plan. Call `revise()` for reviewed edits. Call `execute()` only after showing the current plan and receiving confirmation for its revision. Do not automatically set `confirmed: true` in an ingestion pipeline. The separate capture and review tokens enforce this distinction at the HTTP boundary.

## Evidence Engine boundary

The existing Evidence Engine repository currently contains a browser wireframe and a recorder CSV adapter. This module adds a separate runtime; it does not make wireframe buttons live, connect its illustrative providers, import a complaint tracker, or replace the existing recorder. Start it deliberately through its own package scripts.

There is no automatic migration into the original private evidence tracker. Its actual export and identifiers must be inspected before designing that adapter. A source label is client-reported, and the hash covers the supplied transcript, not an independently authenticated recording.

## Packaging and reuse

The MIT licence inside this module applies to the module only. The surrounding product's licence is unchanged. Extracting this directory into a separate repository is supported by its relative imports and package layout; update the `repository` metadata after extraction. The [standalone add-on repository](https://github.com/hoodwinky/evidence-engine-voice-router) is public. The parent Evidence Engine repository remains private. An npm release remains a separate publishing step.
