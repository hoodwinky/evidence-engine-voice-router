---
description: "Understand explicit intent, missing details, review and delivery states."
---
# Routing and review

The default parser is deterministic. It recognises an explicit prefix and keeps ordinary sentences as notes. It does not use a language model, infer a destination from sensitive subject matter, or interpret relative dates.

| Input or field | Proposed route |
| --- | --- |
| Ordinary text or `Note:` | `note`, saved to `inbox` |
| `Remind:` or `Remind me to …` | `reminder`, native `device` by default |
| `Calendar:` | `calendar`, native `device` by default |
| `Automate pilot: …` | `automation`, named `pilot` route |
| Explicit `kind` | Overrides prefix classification |
| Explicit `destination` | Selects a registered adapter; required for non-device external routing |

All original words remain in the capture. Human edits modify the derived plan and increment its revision. They do not overwrite the transcript or its hash. Notes remain in the local inbox; an Evidence Engine host can consume them through the library or HTTP API. No uninspected legacy tracker schema is assumed.

Reminders need `dueAt`. Calendar events need both `startAt` and `endAt`, with end later than start. Dates require an explicit UTC offset or `Z` and seconds, for example `2026-12-01T09:00:00+11:00`. Local times without offsets, impossible dates and relative phrases stay unresolved. Time zone and daylight-saving interpretation belong to the client collecting the date.

| State | Meaning |
| --- | --- |
| `saved` | Original note is in the inbox; no action was dispatched |
| `needs_details` | Original is saved, but the proposed action lacks valid details or a registered destination |
| `pending_review` | Plan is ready for explicit confirmation |
| `dispatching` | One caller claimed the action; check the destination after any interrupted process |
| `awaiting_device` | Handoff prepared; the native app has not reported creation |
| `completed` | Device reported creation, or a webhook acknowledged delivery |
| `delivery_unknown` | External delivery could not be established; check before retrying |

There is no automatic retry after uncertain external delivery. A server crash during dispatch leaves `dispatching` for operator reconciliation. Adapters receive the stable downstream key `voice-router:<captureId>` and should enforce it at the destination. Capture idempotency prevents duplicate intake for one stable key. It does not make an external system exactly-once.

## Named automation example

An operator can set `ROUTES_JSON` to a JSON object shaped like:

```json
{
  "pilot": {
    "url": "https://YOUR-OWN-AUTOMATION-HOST/hooks/pilot",
    "token": "YOUR-PRIVATE-DESTINATION-TOKEN"
  }
}
```

This configuration belongs in the private environment, never a public commit. `Automate pilot: prepare the checklist` then proposes that registered route. The operator's webhook is responsible for creating the actual workflow or task. No arbitrary URL, shell command or executable code in a dictated note is run. Redirects are rejected. Only derived action fields, capture ID, timestamp and original hash are sent by the built-in webhook adapter; the full original transcript is not included.
