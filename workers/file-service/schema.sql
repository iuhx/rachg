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
  expires_at INTEGER NOT NULL,       -- Unix timestamp ms; 0 = kept until manually deleted
  download_count INTEGER DEFAULT 0,  -- Total successful downloads
  delete_token TEXT NOT NULL,        -- Token to authorize deletion
  owner_id TEXT,                     -- Extensible: CF Access identity or account ID
  status TEXT DEFAULT 'active'       -- active | expired | deleted
);

CREATE INDEX IF NOT EXISTS idx_files_status_expires ON files (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_files_created ON files (created_at DESC);

-- Private daily tasks; completed items remain associated with their date.
CREATE TABLE IF NOT EXISTS daily_todos (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_todos_day ON daily_todos(day,created_at,id);

-- Private Markdown notes. Access authentication is enforced by the Worker.
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes (title);

-- Explicitly published snapshots; private notes remain behind Access.
CREATE TABLE IF NOT EXISTS note_shares (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Private received email index. Raw messages are stored in R2 under mail/.
CREATE TABLE IF NOT EXISTS mail (
  id TEXT PRIMARY KEY,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL,
  message_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_mail_received ON mail (received_at DESC);

-- Private outgoing plain-text mail sent through Resend.
CREATE TABLE IF NOT EXISTS sent_mail (
  id TEXT PRIMARY KEY,
  resend_id TEXT,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sending',
  in_reply_to TEXT,
  references_header TEXT
);

CREATE INDEX IF NOT EXISTS idx_sent_mail_sent_at ON sent_mail (sent_at DESC);

CREATE TABLE IF NOT EXISTS mail_ingestions (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_mail_ingestions_created ON mail_ingestions(created_at);
