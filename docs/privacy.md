---
description: "Know where transcripts, credentials, hashes and delivery records are stored."
---
# Data handling

The router keeps the exact supplied transcript, optional input metadata, a server receipt timestamp, a SHA-256 of the transcript, the derived plan, revision, delivery state and a small receipt in a local SQLite database. It does not collect audio. Device dictation and any assistant processing remain subject to the device/provider's own settings.

The original transcript is immutable through the HTTP API. The hash helps compare whether supplied text has changed. It is not proof that a statement is true, who spoke it, when an underlying event happened, or that an audio recording exists. Source labels are client-reported; `receivedAt` is the router's receipt time.

The database is plain text, not encrypted by this module. The directory and database are created with restrictive permissions where supported, but the host operator remains responsible for disk encryption, permissions, backups and retention. Stop the service before taking a simple file-copy backup. Keep `.env`, database files, recordings, private evidence and real API keys out of Git.

Capture and review tokens are configured through the environment. They are never stored in the capture database. The web inbox keeps the review token in JavaScript memory only and provides **Forget token**. Do not share a personal Shortcut containing a token. Rotate a token by changing the environment value and restarting the server.

By default, capture writes only to the local inbox. Confirmed native actions are handed to the client; the client requests native permissions and reports completion. A configured webhook sends the derived action, capture ID, server timestamp and original hash to the operator's fixed destination. Trusted custom adapters can access the full capture and must apply their own minimisation rules.

This release has no multi-user isolation, end-to-end encryption, managed key store, account recovery, deletion/retention API, compliance certification or provider OAuth flow. To erase the single-user dataset, stop the service and deliberately remove the database and any backups according to your retention decision. Do not use the pilot as a shared evidence repository.
