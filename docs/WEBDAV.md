# InfiniCLOUD storage

Files, Tools uploads and the global upload dialog can save to R2 or InfiniCLOUD.
Selecting permanent retention defaults to InfiniCLOUD when configured; timed
uploads default to R2. Users can still choose either destination manually.
Changing retention restores its default, while retries keep their original
destination. Credentials now come only from the `rachg-file-service`
Worker's Cloudflare Secret bindings:

- `WEBDAV_USERNAME`: InfiniCLOUD Connection ID.
- `WEBDAV_PASSWORD`: InfiniCLOUD Apps Password (not the website login password).

Wrangler declares these names in `secrets.required`; values are never copied into
`vars`, source control or the frontend. Changes in Cloudflare must be deployed.
The old webpage password form, encrypted D1 credential storage and
`WEBDAV_CREDENTIAL_KEY` code path are retired. No credential database reads or
schema initialization are needed to return storage status.

The verified Basic-auth WebDAV root is:
`https://higa.teracloud.jp/dav/rachg/`

On 2026-10-13 the user's Worker Secrets successfully accessed this folder and
passed a temporary file upload, full download, range read, and exact-key deletion
through a remote Worker preview. The supplied `/v2/dav/rachg/` path returned HTTP
400 with Apps Password authentication. This does not change or move the folder.

## Settings and checks

Settings shows binding availability and a **Test connection** button. It never
returns a username or password. The status request has no unnecessary JSON header
or CORS preflight, and an eight-second deadline covers both headers and body.
Timeouts show a retry and reconnect action. Unmounting cancels pending requests.
The folder test uses a bounded, read-only Depth-0 PROPFIND with a longer deadline.

- `GET /v1/storage/webdav`: whether both Secrets are configured; no network or DB IO.
- `POST /v1/storage/webdav`: verify folder access using the bound credentials.
- Credential-writing methods return 405.
- `POST /v1/files/upload?size=...&filename=...&mime=...&expiry=...&storageBackend=r2|webdav`
  streams the binary body (99 MB maximum). Legacy uploads up to 10 MiB accept
  multipart `storageBackend=r2|webdav`, or
  `x-storage-backend` for binary API uploads. Omission uses R2.

## Storage behavior

- Removing a permanent WebDAV file defaults to removing its workspace entry only.
  The confirmation dialog offers an unchecked **Also delete the file from WebDAV**
  option. Selecting it explicitly removes both the workspace entry and the remote file.
  Timed WebDAV files and all R2 files retain their existing deletion/expiry behavior.
- The API uses `DELETE /v1/files/:id?deleteRemote=true` for explicit remote deletion
  of permanent WebDAV files. Omitting the option (including older clients) keeps the
  remote copy. Invalid or conflicting option values are rejected before any action.
- Workspace-only removal immediately revokes file, text-share and QR link access.
  A deleted database marker prevents cleanup and later delete requests from removing
  the retained copy. It is no longer managed in Files; access/remove it in InfiniCLOUD.
  Removal must atomically claim an active record. An already-started remote deletion
  cannot safely be changed into a keep operation.

- Files are at most 99 MB (99,000,000 bytes). The list labels R2 versus InfiniCLOUD. Existing R2 files
  require no migration, and a retry never silently changes storage destination.
- InfiniCLOUD files use UUID-prefixed filenames directly inside `rachg/`; conditional
  PUT avoids overwriting an existing file. Original filenames remain in D1.
- File links, QR codes, text pages, downloads and deletion retain workspace Access
  authentication. Existing InfiniCLOUD files are not automatically imported.
- The R2 4 GiB quota excludes InfiniCLOUD. InfiniCLOUD enforces its account quota.
- WebDAV uploads/downloads stream with bounded memory; range reads work when a server ignores Range.
  Existing R2 downloads retain their streaming path.
- Expiry cleanup receives the same Worker Secrets and deletes only recorded keys.
  Failed uploads/deletes remain retryable. There are no recursive directory operations.
- Keep the same InfiniCLOUD account when rotating Secrets so existing files remain
  accessible. Reissuing Apps Password affects other applications using that account.

The Worker accepts only the fixed HTTPS host and root, rejects redirects, and
forwards no workspace cookies or JWTs to InfiniCLOUD. Provider error bodies and
credential values are not logged or returned. The legacy database field `r2_key`
stores `transfers/` keys for R2 and `webdav/` keys for InfiniCLOUD; each adapter
validates its namespace before operating on any object.

## Verification

Tests cover Secret isolation, no settings-database dependency, rejected credential
writes, unauthorized requests, quota separation, uploads/downloads/ranges, cleanup,
path traversal, collision safety, the request deadline, and UI error recovery.
The release bundle also runs in actual workerd with D1/R2 and a mock WebDAV service.
