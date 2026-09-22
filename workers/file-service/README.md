# rachg File Service (Cloudflare Worker)

This API is private and must be protected by Cloudflare Access. Configure an Access application for the API hostname and allow only the administrator account. The Worker verifies `Cf-Access-Jwt-Assertion` itself; it never trusts `Cf-Access-Authenticated-User-Email`.

Required Worker variables: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, `ACCESS_ADMIN_EMAIL`, and `ALLOWED_ORIGINS=https://rachg.com`. Keep the API hostname behind Access and do not expose a public bypass through the `workers.dev` hostname.

### Private Markdown Notes

All note routes require the same Cloudflare Access JWT as the file routes:

- `GET /v1/notes` — list notes ordered by most recently updated
- `POST /v1/notes` — create `{ "title": "...", "content": "..." }`
- `GET /v1/notes/:id` — read one note
- `PUT /v1/notes/:id` — replace title and Markdown content
- `DELETE /v1/notes/:id` — delete one note

Notes are stored in the D1 `notes` table. There are no tags, user records, or anonymous note tokens.

Independent temporary file transfer micro-service powered by Cloudflare Workers, Cloudflare R2 (isolated `transfers/` prefix), and Cloudflare D1 (lightweight metadata table).

---

## 📡 API Specification (v1)

Base URL in Production: `https://files.rachg.com` (or worker hostname)  
Local Dev URL: `http://localhost:8787`

### 1. Health & Quota Status
- **Method**: `GET /health` or `GET /`
- **Response**:
```json
{
  "service": "rachg-file-service",
  "version": "1.0.0",
  "status": "healthy",
  "quota": {
    "usedBytes": 43520000,
    "maxBytes": 4294967296,
    "availableBytes": 4251447296
  },
  "timestamp": 1789978900000
}
```

### 2. Upload Temporary File
- **Method**: `POST /v1/files/upload`
- **Content-Type**: `multipart/form-data`
  - `file`: File binary
  - `expiry`: (optional) `"1 hour"` | `"24 hours"` | `"48 hours"` | `"7 days"` (default: 48 hours)
- **Response** `201 Created`:
```json
{
  "success": true,
  "file": {
    "id": "7h3k9a",
    "name": "design-system.zip",
    "size": "8.4 MB",
    "sizeBytes": 8808038,
    "updatedAt": "14:22",
    "expiresIn": "2d 4h",
    "expiresTimestamp": 1790151720000,
    "shareUrl": "https://files.rachg.com/f/7h3k9a",
    "type": "archive",
    "downloads": 0,
    "status": "active",
    "deleteToken": "k8s92n4m1..."
  },
  "shareUrl": "https://files.rachg.com/f/7h3k9a",
  "deleteToken": "k8s92n4m1..."
}
```
- **Error (Quota Exceeded)** `413 Payload Too Large`:
```json
{
  "success": false,
  "error": "Storage quota exceeded. Max allowed is 4GB...",
  "code": "QUOTA_EXCEEDED",
  "status": 413
}
```

### 3. List Active Transfers
- **Method**: `GET /v1/files`
- **Response** `200 OK`:
```json
{
  "success": true,
  "files": [ ... ],
  "totalSizeBytes": 8808038,
  "maxSizeBytes": 4294967296,
  "usagePercent": 0.2
}
```

### 4. Direct Download Link
- **Method**: `GET /f/:id`
- **Behavior**:
  - Checks if file is expired or deleted (returns 410 if expired).
  - Streams file binary directly from R2 with `Content-Disposition: attachment; filename="original-name.ext"`.
  - Automatically increments D1 `download_count`.

### 5. Revoke / Delete File
- **Method**: `DELETE /v1/files/:id`
- **Authentication**: Cloudflare Access session/JWT. Anonymous requests return `401 Unauthorized`.
- **Response** `200 OK`:
```json
{
  "success": true,
  "message": "File deleted successfully",
  "id": "7h3k9a"
}
```

---

## 🛡️ Storage Safety & Isolation

1. **R2 Multi-tenant Protection**:
   - The bucket contains other folders such as `images/`.
   - The worker enforces an immutable `transfers/` prefix on all R2 read, write, and delete operations.
   - Any attempt to access a key outside `transfers/` throws an immediate rejection.
2. **4GB Cap Rule**:
   - Before accepting any payload, D1 calculates the active unexpired storage footprint.
   - Uploads that would push total usage above 4GB (`4,294,967,296` bytes) are rejected with HTTP 413.

---

## 💻 Local Testing Instructions (Wrangler Local Emulator)

Cloudflare Wrangler includes a built-in zero-cloud local sandbox (Miniflare D1 SQLite + Miniflare R2 on disk):

```bash
# 1. Enter the worker directory
cd workers/file-service

# 2. Execute local D1 database migration in local emulator
npx wrangler d1 execute DB --local --file=./schema.sql

# 3. Start local worker dev server (runs on http://localhost:8787)
npx wrangler dev --port 8787
```

### Testing with cURL:

```bash
# Health Check
curl http://localhost:8787/health

# Upload file with 24 hours expiry
curl -F "file=@sample.png" -F "expiry=24 hours" http://localhost:8787/v1/files/upload

# List active files
curl http://localhost:8787/v1/files

# Download file
curl -O http://localhost:8787/f/<file_id>

# Delete file using returned deleteToken
curl -X DELETE http://localhost:8787/v1/files/<file_id> -H "X-Delete-Token: <delete_token>"
```
