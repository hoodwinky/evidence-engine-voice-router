---
description: "Build a Siri Shortcut to preserve dictation and prepare a reviewed native action."
---
# Siri and Shortcuts

Apple supports running named Shortcuts through Siri and sending API requests through **Get Contents of URL**. This release provides a manual recipe, not a signed `.shortcut` file. The recipe has not been tested on a physical iPhone in this project.

## Capture-only recipe

1. Create a shortcut named **Keep a note**.
2. Add **Dictate Text** and keep the result in a variable called `Original Text`. Do not replace it with a rewritten summary.
3. Generate a UUID once for this capture. Reuse it if retrying the same request.
4. Add **Get Contents of URL** targeting `https://YOUR-OWN-HOST/v1/captures` with method **POST**.
5. Set headers `Authorization: Bearer YOUR_CAPTURE_TOKEN`, `Content-Type: application/json` and `Idempotency-Key: <the UUID>`.
6. Use a JSON request body with `text` set to `Original Text` and `source` set to `siri`. Use Shortcuts dictionary/JSON fields rather than manually concatenating JSON with dictated words.
7. Read the response's `message` with **Speak Text** or **Show Result**. If the request fails, keep the dictated text available to save in Notes and do not announce a successful save.
8. Say **Siri, Keep a note** to run the shortcut.

The capture token can write a note but cannot read the inbox or execute actions. Store it only in your personal copy of the shortcut. Remove credentials before sharing any shortcut.

## Route into native Reminders or Calendar

A fuller shortcut can use the review token instead. It has broader access; install it only on your own device.

1. Capture the original words first. Keep the returned `id`, `plan`, `revision` and `status`.
2. If the status is `needs_details`, ask for the due date, or the calendar start and end. Format dates explicitly as `yyyy-MM-dd'T'HH:mm:ssXXX`, including seconds and the device's numeric UTC offset. Show the interpreted date before continuing.
3. POST the details to `/v1/captures/<id>/prepare` as `{"revision":1,"details":{"dueAt":"2026-12-01T09:00:00+11:00"}}`. Use the current revision from the response for subsequent requests. For calendar actions send `startAt` and `endAt`.
4. Show the proposed title, date and destination and ask the user to confirm. Cancellation leaves the note saved and unexecuted.
5. POST `{"revision":<current revision>,"confirmed":true}` to `/v1/captures/<id>/execute` with the review token.
6. For a result of `awaiting_device`, switch on `result.operation`. Use the native **Add New Reminder** action for `add-reminder`, or the native calendar creation action for `add-calendar-event`. Feed it the result's title and schedule fields; keep native permission and event review prompts enabled.
7. Only after native creation succeeds, POST a receipt to `/v1/captures/<id>/receipt` with the current revision and a native item identifier or a short explicit user confirmation as `externalId`.

If native creation fails or the user cancels, do not send a receipt. A server-side handoff does not create a reminder or calendar entry. If a receipt fails after native creation succeeds, retry only the receipt; repeating native creation can duplicate the item. A lost execute response can be recovered by fetching the capture with the review token.

The alternative for Calendar is to download `/v1/captures/<id>/calendar.ics`, inspect it and import it. This has no attendee list and sends no meeting invitation. A shared invitation requires a separately implemented, authenticated calendar adapter.

## Apple references

* [Run Shortcuts with Siri](https://support.apple.com/en-au/HT209055)
* [Request an API in Shortcuts](https://support.apple.com/guide/shortcuts/apd58d46713f/ios)
* [App Shortcuts design guidance](https://developer.apple.com/design/human-interface-guidelines/app-shortcuts)
