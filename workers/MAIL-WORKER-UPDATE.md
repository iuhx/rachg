# Cloudflare Dashboard update files

The workspace Mail page needs both Workers updated.

1. `file-service` serves the Access-protected Mail API. Paste `file-service/cloudflare-editor-bundle/index.js` into the existing `rachg-file-service` Worker editor. Keep its existing `DB` (`d1rachg`) and `FILES_BUCKET` (`r2rachg`) bindings and its existing Access JWT variables/secrets. Do not remove its Access protection.
2. `mail-ingest/cloudflare-editor.js` is the complete Email Worker script for `quiet-king-d2c8`. Paste it into that Worker editor. It expects bindings `DB` (`d1rachg`) and `FILES_BUCKET` (`r2rachg`). Keep its current Email Routing destination and the existing `FORWARD_TO`, `TG_CHAT_ID`, and `TG_BOT_TOKEN` configuration.

Both editor artifacts are generated from the TypeScript sources by `node scripts/build-workers.cjs` at the repository root. The build does not deploy anything. The Email Worker artifact now includes the same MIME parsing, preview and size limits as its source. The D1 `mail` table is created automatically on the first received email or API access.

Before a production release, verify the existing bindings and secrets. The file-service
also needs the 15-minute Cron Trigger defined in `wrangler.jsonc`; pasting code into the
Dashboard alone does not configure that trigger. Cleanup removes only expired transfer
keys and superseded scratchpad keys recorded in D1. Permanent files are excluded.
Files are limited to 10 MiB per request, and inbound/previewed mail to 5 MiB. Existing
larger stored mail is preserved but cannot be previewed through this bounded endpoint.

Only emails arriving after `quiet-king-d2c8` has been updated are saved. The email editor script retains Telegram notification and forwarding if their existing variables/secrets remain configured.
