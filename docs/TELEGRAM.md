# Telegram inbox

`@rachgx_bot` accepts private messages from Telegram user `6121514938` only.

- Photos become permanent WebDAV files and appear in the existing Files view.
  Removing their workspace entries keeps the WebDAV originals by default; the
  Files confirmation dialog offers an explicit option to delete the originals too.
- Images sent as documents retain their original filename and bytes (JPEG, PNG,
  WebP, GIF, BMP, AVIF, HEIC/HEIF, SVG and TIFF). Send photos as files when original
  image quality matters; ordinary Telegram photos may have been compressed.
- `.md` / `.markdown` documents become Notes, with the filename stem as title.
  Markdown content is kept, including line endings. UTF-8 and BOM-marked UTF-16
  are supported. Content is never executed or imported as HTML.
- Other messages, including `/start`, return a short usage guide. Groups,
  channels, bots, edited messages and other users are ignored.
- Telegram file downloads are limited to 20,000,000 bytes. Markdown input and
  its decoded UTF-8 content are each limited to 1,000,000 bytes. Oversized or
  unreadable documents get an explicit reply rather than a truncated note.

## Configuration

The only added Secret is `TELEGRAM_BOT_TOKEN` on `rachg-file-service`.
Existing `WEBDAV_USERNAME` and `WEBDAV_PASSWORD` Secrets are reused.
`TELEGRAM_ENABLED`, `TELEGRAM_BOT_USERNAME`, and `TELEGRAM_ALLOWED_USER_ID`
are normal Worker variables. Disable ingestion with `TELEGRAM_ENABLED=false`.

The minute cron validates the bot using `getMe`, registers the webhook, and
records a configuration fingerprint. Token changes trigger registration again.
It does not discard pending Telegram updates. The token, bot file URLs, and
webhook secret never appear in API responses, database records or application
logs. The webhook secret is an HMAC derived from the bot token; only a second
digest is persisted for configuration change detection.

Webhook URL:
`https://api.rachg.com/integrations/telegram/webhook`

Cloudflare Access bypass is scoped to this exact route. Only this POST route uses Telegram authentication. It validates
`X-Telegram-Bot-Api-Secret-Token`, then checks both the sender and the private chat
against the numeric allowlist before touching D1, WebDAV or Telegram APIs.
All other workspace endpoints still require their existing Access authentication.
No public file shares or public notes are created by this integration. Bot replies contain ordinary authenticated
workspace/download links; they do not grant anonymous access.

Authenticated `GET /v1/integrations/telegram` returns registration state and job
counts. Authenticated POST to the same route can trigger configuration early.

## Reliability

A separate D1 job ledger is written before returning HTTP 200 to Telegram.
The key includes bot ID, user ID and message ID. Repeated deliveries are ignored
even after a saved note/file is edited or deleted. Forwarding or sending a file
again as a new message intentionally creates a new item.

Webhook requests start work in the background. The minute cron recovers pending
jobs and interrupted work, with an atomic ten-minute lease to prevent concurrent
processing. Recoverable failures retry up to three attempts. Saving a note and
marking its job done share a D1 transaction. Images remain invisible until the
WebDAV PUT succeeds and file activation/job completion commit together.

Each image attempt uses a fresh opaque remote key. Ambiguous previous attempts
remain tracked for the existing exact-key cleanup; a conditional PUT collision
is marked purged without deleting the foreign object. No remote directories or
unrelated files are enumerated or deleted. Cleanup keeps its existing 15-minute
schedule, separate from the new minute cron.

Replies are sent only after the outcome is persisted. Telegram `sendMessage`
does not offer an idempotency key: if a reply's network outcome is uncertain,
the job records that uncertainty without resending the receipt or importing the
file again. A saved item may therefore be visible in the workspace even if its
Telegram acknowledgement was lost.

Tests use mocked Telegram/WebDAV endpoints and real workerd/D1/R2 bindings for
runtime coverage. Automated tests never send messages to the real Telegram bot.
