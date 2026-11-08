---
description: "Run your own Voice Router inbox and try a synthetic note."
---
# Quick start

Use Node.js 24 or later on a machine you control. No npm dependencies or model API key are needed.

1. Clone the public [Voice Router repository](https://github.com/hoodwinky/evidence-engine-voice-router) and open its directory. You can also work from `plugins/voice-router` inside an authorised Evidence Engine checkout.
2. In that directory, copy `.env.example` to `.env`.
3. Run the following command twice and put the two distinct values into `CAPTURE_TOKEN` and `REVIEW_TOKEN` in `.env`:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Run `npm test`, then `npm start`.
5. Open `http://127.0.0.1:4181`. Enter the review token and choose **Open inbox**.
6. Save `Note: synthetic venue checklist`. It should show **saved**.
7. Save `Remind me to call the venue`. It should show **needs details**. Expand **Edit action details**, enter a `dueAt` timestamp such as `2026-12-01T09:00:00+11:00`, and update the proposal.
8. Confirm the proposed action. **awaiting device** means that a native client still needs to create the reminder. The web inbox itself does not operate Apple Reminders or send a notification.

To connect a phone, host this service behind an HTTPS reverse proxy on infrastructure you control. Set `PUBLIC_ORIGIN` to that exact HTTPS origin and forward requests to the service. The default bind address is loopback; change it only for the actual hosting arrangement. An iPhone's localhost address points at the iPhone.

Keep the service single-user. It has two static bearer-token roles, not a multi-user identity system. The database stores plain text on disk; use disk encryption and appropriate backups on the host. Do not expose this pilot as a shared public evidence service.

Nothing in these steps publishes a website, provisions hosting or incurs a provider subscription. No cloud deployment is included in this release.
