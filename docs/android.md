---
description: "Capture from Android today and understand the boundary with Google Assistant."
---
# Android capture

The core API accepts `source: "android"`. This release ships no Android APK, App Actions declaration, Google Assistant extension or Gemini integration.

Google retired Assistant Conversational Actions on 13 June 2023. A generic cloud conversational plug-in using that retired platform cannot be deployed. Google's Android App Actions documentation describes a separate app-based integration path. Support must be checked against the actual assistant, app, language and device being targeted; this guide does not promise a universal Google Assistant or Gemini invocation.

## Use the existing inbox

Open your own hosted HTTPS inbox in the Android browser, enter your review token and use the keyboard's dictation feature to fill **Original words**. Save and review the note. This path needs no custom Android app. Keyboard dictation follows the keyboard provider's own processing and privacy settings.

A client that supports authenticated HTTPS requests can also POST the same JSON capture contract with `source: "android"`. The capture token is enough for intake; a native client needs the review token and explicit user review to dispatch actions.

## Build a native integration

An Android app can implement this sequence:

1. Collect dictated or shared text with a clear, visible capture action.
2. POST the exact transcript and a stable idempotency key.
3. Collect missing action details and show a confirmation screen.
4. Request a device handoff and launch the relevant native reminder or calendar flow.
5. Send a receipt only after the app can establish that native creation succeeded. An activity opening is not proof of creation.

A future app can investigate App Actions and supported intents. It must keep credentials out of voice phrases and deep-link URLs. The present repository provides the server contract, not that app. On devices with a different default assistant, retain the browser/dictation capture route.

## Google references

* [Conversational Actions sunset](https://developers.google.com/assistant/ca-sunset)
* [Assistant for Android and App Actions](https://developer.android.com/develop/devices/assistant/overview)
* [App Actions shortcut schema](https://developer.android.com/develop/devices/assistant/action-schema)
