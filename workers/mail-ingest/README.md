# rachg mail ingestion Worker

This Worker stores incoming RFC 822 messages in the existing `r2rachg` bucket under `mail/` and indexes the sender, recipient, subject, preview, and received time in the existing `d1rachg` database. Bind these resources as `FILES_BUCKET` and `DB`. The private file-service Worker provides Access-protected listing, reading, and deletion endpoints to the workspace.

The existing Email Routing rule should continue targeting the Worker `quiet-king-d2c8`. Configure `FORWARD_TO` as a Worker variable if forwarding is still wanted. Set `TG_BOT_TOKEN` as a Worker secret and `TG_CHAT_ID` as a Worker variable or secret. No secret values belong in this repository.

Deploy from this directory with `pnpm run deploy`. The binding references point at the existing D1 database and R2 bucket. After deployment, send a new message to the routed address to verify it appears in the workspace Mail view. Existing email that was only forwarded or announced is not backfilled.

Incoming messages are limited to 5 MiB. SHA-256 fingerprints cover the complete raw
message and recipient, so a repeated delivery is indexed once. A D1 ledger reserves
capacity before parsing/storage and keeps incomplete deliveries available for the
file-service cleanup job to reconcile after a one-hour grace period. A failed delivery
does not release its reserved bytes until the object is reconciled.

The default budget is 1 GiB for messages tracked by this version, configurable with
`MAX_MAIL_STORAGE_BYTES`; there is also a 5,000 indexed-message limit and a 200 new
receipts/hour limit. Legacy messages are preserved and count toward the message-count
limit, but their historical R2 bytes need a separate inventory before claiming a full
bucket-wide capacity guarantee. Deleted deliveries retain a lightweight deduplication
record and release their byte budget. No existing mail is deleted to enforce a limit.
