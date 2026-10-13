# Public note sharing

In Notes, **Share** beside Edit and Delete opens a preview. **Create 7-day link**
publishes only the saved title and Markdown content shown in that preview. Opening
the dialog does not publish. Unsaved/recovered drafts must be saved first.

Anyone with the link can read it without logging in. Later edits are private;
an active link always shows its original snapshot. Each note has at most one active
link. To publish a new version, revoke the current link and create a new one.
The dialog offers Copy link, manual selection/copy, and Revoke link with confirmation.
It also shows the published snapshot and its expiration time.

Links expire exactly seven days after creation. Revoking a link or deleting the
original note stops future requests. Previously loaded pages, screenshots, browser
history and downloaded/copied content cannot be recalled. Treat the URL as a secret;
avoid sharing passwords, access tokens or sensitive personal information.

## Deployment

The frontend alone cannot enable this feature. Production enables the Worker flag
`PUBLIC_NOTE_SHARES_ENABLED` after configuring Access for `files.rachg.com/s/*` only;
no existing note is automatically published. Set this flag to `false` in deployments
where public note sharing should be unavailable.
The dialog checks the public endpoint without a login cookie and disables creation
when it cannot verify that the endpoint is publicly accessible.

1. Deploy the updated file-service Worker, preserving its D1/R2 bindings and all
   Access administrator variables. The new `note_shares` table is created lazily;
   there is no destructive migration. The Dashboard bundle is regenerated at
   `workers/file-service/cloudflare-editor-bundle/index.js` by `pnpm build:all`.
2. In Cloudflare Access, keep the existing administrator-only application for
   `files.rachg.com`. Add a more-specific self-hosted application for
   **`files.rachg.com/s/*` only**, with a Bypass policy for Everyone. Do not bypass
   the whole hostname, `/v1/*`, `/f/*`, `/t/*`, the mail routes, or the main site.
   Check that any broader Access application or Worker route does not override this.
3. Set `PUBLIC_NOTE_SHARES_ENABLED=true` on the file-service Worker. This can be
   done in the dashboard; if deploying with Wrangler, update the explicit variable
   in `wrangler.jsonc` or supply a deployment override so a later deploy preserves
   the intended setting. No note becomes public until its owner creates a link.
4. Without an Access cookie, verify `GET https://files.rachg.com/s/status` returns
   `{"service":"rachg-note-share","ready":true}`. Verify the main site, `/v1/notes`,
   `/v1/mail`, `/v1/files`, `/f/...` and `/t/...` still require the administrator.
5. Create a disposable note and share it. Check in a signed-out browser that the
   link works, unrelated private routes remain protected, later edits do not change
   the snapshot, and revoking/deleting causes the public link to return 404.
6. Keep the existing 15-minute Cron Trigger. It removes expired snapshots from D1;
   expiration is checked on every public request even when Cron is delayed.

Do not create a Cache Everything rule for `/s/*`: these responses must respect
`Cache-Control: private, no-store` for reliable revocation. Cloudflare rate limiting
on `/s/*` can cap abusive traffic; public requests consume Worker/D1 resources.
Setting `PUBLIC_NOTE_SHARES_ENABLED=false` immediately disables the public handler
and new shares while retaining authenticated revocation. If re-enabled, unexpired
links resume working unless revoked or deleted.

## Security boundary

- Only `/s/<64-hex-character token>` and `/s/status` are anonymous GET/HEAD routes.
  Tokens have 256 bits of cryptographic randomness and are separate from note IDs.
  Invalid, missing, revoked, deleted and expired tokens return a generic 404.
- Share creation, inspection and revocation stay under the existing administrator
  JWT and write-Origin checks. Share creation atomically matches the reviewed note
  version, title and content. Repeat/concurrent creation cannot replace an active link;
  stale revocation cannot revoke a newer token.
- D1 stores one snapshot per note, capped at 200,000 UTF-8 bytes. Public reads never
  expose private IDs, note lists, edit/delete actions, author email or storage keys.
- Markdown is rendered using an allowlist of tags with escaped text and safe link
  protocols. Raw HTML remains literal text. Images become links; no external images
  or scripts load. CSP disallows scripts, frames, forms and network resources.
- `no-store`, `no-referrer` and `noindex,nofollow,noarchive` protect against ordinary
  caching, referrer leakage and cooperative search indexing. These headers cannot
  prevent a recipient from forwarding or copying the content.

## Verification

`pnpm check` includes snapshot, concurrency, expiry/revocation, deletion, anonymous
route isolation, hostile Markdown, size limits, dialog behavior and actual workerd/D1
coverage. Live Access configuration must be verified separately after deployment.
