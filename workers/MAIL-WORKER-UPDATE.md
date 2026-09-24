# Cloudflare Dashboard update files

The workspace Mail page needs both Workers updated.

1. `file-service` serves the Access-protected Mail API. Paste `file-service/cloudflare-editor-bundle/index.js` into the existing `rachg-file-service` Worker editor. Keep its existing `DB` (`d1rachg`) and `FILES_BUCKET` (`r2rachg`) bindings and its existing Access JWT variables/secrets. Do not remove its Access protection.
2. `mail-ingest/cloudflare-editor.js` is the complete Email Worker script for `quiet-king-d2c8`. Paste it into that Worker editor. It expects bindings `DB` (`d1rachg`) and `FILES_BUCKET` (`r2rachg`). Keep its current Email Routing destination and the existing `FORWARD_TO`, `TG_CHAT_ID`, and `TG_BOT_TOKEN` configuration.

The API bundle was generated from the TypeScript source using Wrangler's `--dry-run --outdir` build; it does not deploy anything. The Email Worker file is self-contained and uses the platform's email event API. After replacing each script, deploy/save both Workers, then send a new email to `hello@rachg.com` and refresh Mail in the workspace. The D1 `mail` table is created automatically on the first received email or API access.

Only emails arriving after `quiet-king-d2c8` has been updated are saved. The email editor script retains Telegram notification and forwarding if their existing variables/secrets remain configured.
