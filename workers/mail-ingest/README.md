# rachg mail ingestion Worker

This Worker stores incoming RFC 822 messages in the existing `r2rachg` bucket under `mail/` and indexes the sender, recipient, subject, preview, and received time in the existing `d1rachg` database. Bind these resources as `FILES_BUCKET` and `DB`. The private file-service Worker provides Access-protected listing, reading, and deletion endpoints to the workspace.

The existing Email Routing rule should continue targeting the Worker `quiet-king-d2c8`. Configure `FORWARD_TO` as a Worker variable if forwarding is still wanted. Set `TG_BOT_TOKEN` as a Worker secret and `TG_CHAT_ID` as a Worker variable or secret. No secret values belong in this repository.

Deploy from this directory with `pnpm run deploy`. The binding references point at the existing D1 database and R2 bucket. After deployment, send a new message to the routed address to verify it appears in the workspace Mail view. Existing email that was only forwarded or announced is not backfilled.
