-- D1 Schema for rachg file-service
-- Stores only metadata for temporary file sharing
-- Real files are stored in R2 bucket under transfers/ prefix

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,               -- Short unique code (e.g. 7h3k9a)
  filename TEXT NOT NULL,            -- Original file name
  size_bytes INTEGER NOT NULL,       -- File size in bytes
  mime_type TEXT NOT NULL,           -- MIME content type
  r2_key TEXT NOT NULL,              -- R2 storage key (transfers/{id}/{filename})
  created_at INTEGER NOT NULL,       -- Unix timestamp ms
  expires_at INTEGER NOT NULL,       -- Unix timestamp ms
  download_count INTEGER DEFAULT 0,  -- Total successful downloads
  delete_token TEXT NOT NULL,        -- Token to authorize deletion
  owner_id TEXT,                     -- Extensible: CF Access identity or account ID
  status TEXT DEFAULT 'active'       -- active | expired | deleted
);

CREATE INDEX IF NOT EXISTS idx_files_status_expires ON files (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_files_created ON files (created_at DESC);

-- Private Markdown notes. Access authentication is enforced by the Worker.
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at DESC);

CREATE TABLE IF NOT EXISTS scratchpad (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
