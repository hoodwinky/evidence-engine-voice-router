---
description: "Keep a dictated note, review its intended action, and route it to the right destination."
---
# Evidence Engine Voice Router

Say a note once. Keep the original words. Decide whether the next step is a note, reminder, calendar event or named automation.

Voice Router is a reusable FreeX add-on and a runnable single-user pilot. Its local library and HTTP service are implemented. Siri uses a manually assembled Shortcut. A packaged Android client is future work. This guide is based on the code in the Evidence Engine repository; it is not an app-store installation.

| You say or provide | The router does |
| --- | --- |
| `Note: the venue needs a checklist` | Saves the original transcript to your inbox |
| `Remind me to call the venue` | Saves the note and asks for a precise due date |
| `Calendar: venue visit` | Saves the note and asks for the start and end |
| `Automate pilot: prepare a checklist` | Proposes the named automation if the operator configured `pilot` |

Capturing a note never sends an invitation, triggers a webhook or changes your native reminders. Review and confirmation happen after capture. The phone must report native completion; webhook delivery is acknowledged separately.

**Start with Quick start**, then choose Siri or Android. Routing and review explains date handling and delivery states. Host integration and the API overview are for developers adding this module to another Evidence Engine installation.

FreeX is a sole trader trading as FreeX. No Apple, Google or other provider affiliation is claimed. Only synthetic examples are used in the source and tests.
