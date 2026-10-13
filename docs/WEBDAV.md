# InfiniCLOUD storage

The workspace can upload Files and QR/text-share files to either Cloudflare R2
or InfiniCLOUD. The global upload dialog uses the same destination selector. R2
remains the default. Configure InfiniCLOUD in **Settings → InfiniCLOUD · WebDAV**
using the Connection ID and Apps Password from **My Page → Apps Connection**.
The website login password is not used. Save & check access validates the exact
folder with a read-only PROPFIND before saving the credentials.

The user-approved root is fixed to:
`https://higa.teracloud.jp/v2/dav/rachg/`

The user has created this folder. We do not create or delete the folder itself.
The v2 endpoint must accept Basic authentication with the supplied Apps Password;
we do not guess another endpoint or silently switch to /dav/. If InfiniCLOUD
rejects this mode or URL, Settings reports the upstream status and preserves the
previous working credentials. Actual account verification requires the user to
enter the credentials in Settings; anonymous probes cannot confirm compatibility.

## Behavior

- Upload size remains at most 10 MiB. Every file records its destination, and Files
  labels it R2 or InfiniCLOUD. Existing R2 files need no migration.
- InfiniCLOUD files use unique `UUID--filename` leaves directly in `rachg/`. Uploads
  use conditional PUT to avoid overwriting an existing remote file.
- File links, QR codes, text-share pages and deletion use the existing authenticated
  workspace routes. The browser never gets a credential-bearing WebDAV link.
- Only workspace-created files are indexed. Existing InfiniCLOUD files are not
  imported automatically, and no recursive directory operations are performed.
- The R2 4 GiB quota excludes InfiniCLOUD files. InfiniCLOUD enforces its own account
  quota. System Health continues to show R2's file quota, not the combined total.
- Range downloads work even if the remote service ignores Range. WebDAV responses
  are bounded to the existing 10 MiB limit; R2 retains its streaming path.
- Expired links stop working immediately; the 15-minute cleanup deletes only the
  recorded object. Failed uploads/deletes remain retryable for reconciliation.
  Uploads and retries never silently fall back to another storage provider.

## Credentials and configuration

`WEBDAV_CREDENTIAL_KEY` is a random 32-byte key represented as 64 hex characters in
a Cloudflare Worker secret. Do not rotate it casually. It encrypts Apps Passwords
with AES-256-GCM and a fresh IV; the connection root and ID are authenticated data.
The key is never stored in D1, Git, the browser or a checked-in environment file.

The additive `webdav_settings` table is initialized only when needed. Passwords
are encrypted at rest and never returned to the browser. Connection ID is fixed
after the first successful setup, avoiding account changes that orphan existing
or in-flight uploads. Password updates use a revision check and validate before
replacing working credentials. InfiniCLOUD password reissuance affects every app
using that account's Apps Password; reuse the existing password when possible.

- `GET /v1/storage/webdav`: safe configuration summary and availability.
- `PUT /v1/storage/webdav`: `{username,password,revision}`; checks folder access,
  then saves encrypted credentials. A blank password keeps the existing one.
- `POST /v1/storage/webdav`: checks the saved connection without writing files.
- `POST /v1/files/upload`: optional multipart `storageBackend=r2|webdav`, or
  `x-storage-backend` for binary API uploads. Omission uses R2.

All routes retain the administrator JWT checks and write-Origin protection.
Provider requests only target the fixed approved HTTPS root, reject redirects,
forward no workspace cookies/JWTs, and never return provider response bodies or
credentials as errors. The existing `r2_key` database field is a legacy name:
`transfers/` keys identify R2, while `webdav/` keys identify InfiniCLOUD. Storage
adapters strictly validate their own key namespace before any operation.

## Validation

The test suite covers encrypted persistence, revision conflicts, wrong keys and
credentials, path isolation, byte ranges (including servers ignoring Range),
file/QR reuse, quota separation, retries, expiry, and preservation of unrelated
objects. The release bundle also runs in actual workerd with D1, R2 and a mock
WebDAV service. These checks do not replace testing the user's real account.
