# Voice Router contributor instructions

- Use Node.js 24 or later. The runtime has no third-party dependencies.
- Run `npm run check`, `npm test` and `npm run demo` for runtime changes.
- Preserve the exact original transcript, its hash and the original/derived distinction.
- Capturing must never dispatch an action. Dispatch requires explicit confirmation of the current plan revision.
- Never commit `.env`, databases, personal recordings, raw evidence or credentials.
- Do not claim native-device completion from a server handoff or exactly-once delivery across providers.
- Keep the Siri recipe and Android limitations accurate. Do not imply that a packaged phone app ships here.
- Do not assume a schema for an uninspected Evidence Engine tracker.
- Keep GitBook-ready navigation in `docs/SUMMARY.md` consistent with the actual documentation.
