import type { FileItem, FileCategory, NoteItem } from '@rachg/shared';
import type { ScratchpadItem } from '@rachg/shared';

export interface FileRecord {
  id: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  r2_key: string;
  created_at: number;
  expires_at: number;
  download_count: number;
  delete_token: string;
  owner_id?: string | null;
  status: 'active' | 'expired' | 'deleted';
}

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface ScratchpadRecord {
  id: string;
  content: string;
  image_key: string | null;
  created_at: number;
  updated_at: number;
}

export interface MailRecord {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  received_at: number;
  preview: string;
  r2_key: string;
  message_id: string | null;
}

function getFileType(filename: string, mime: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext) || mime.startsWith('image/')) {
    return 'image';
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    return 'pdf';
  }
  if (['mov', 'mp4', 'webm', 'mkv'].includes(ext) || mime.startsWith('video/')) {
    return 'video';
  }
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
    return 'archive';
  }
  if (['key', 'ppt', 'pptx'].includes(ext)) {
    return 'keynote';
  }
  if (['js', 'ts', 'tsx', 'html', 'css', 'json', 'sql', 'py', 'rs', 'go'].includes(ext)) {
    return 'code';
  }
  return 'text';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return 'Expired';
  const totalHours = Math.floor(msRemaining / (3600 * 1000));
  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  const minutes = Math.floor((msRemaining % (3600 * 1000)) / (60 * 1000));

  if (days > 0) {
    return `${days}d ${remainingHours}h`;
  }
  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatNoteExcerpt(content: string): string {
  return content.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ').slice(0, 120);
}

function formatNoteTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function mapRecordToNoteItem(record: NoteRecord): NoteItem {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    excerpt: formatNoteExcerpt(record.content),
    updatedAt: formatNoteTimestamp(record.updated_at),
    updatedTimestamp: record.updated_at,
  };
}

export function mapRecordToScratchpadItem(record: ScratchpadRecord, baseUrl: string): ScratchpadItem {
  return {
    id: record.id,
    content: record.content,
    imageUrl: record.image_key ? `${baseUrl}/v1/scratchpad/image` : undefined,
    updatedAt: formatNoteTimestamp(record.updated_at),
    updatedTimestamp: record.updated_at,
  };
}

export function mapRecordToFileItem(r: FileRecord, baseUrl: string): FileItem {
  const now = Date.now();
  const msRemaining = r.expires_at - now;
  const isExpired = r.status === 'expired' || msRemaining <= 0;

  return {
    id: r.id,
    name: r.filename,
    size: formatBytes(r.size_bytes),
    sizeBytes: r.size_bytes,
    updatedAt: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    expiresIn: isExpired ? 'Expired' : formatTimeRemaining(msRemaining),
    expiresTimestamp: r.expires_at,
    shareUrl: `${baseUrl}/f/${r.id}`,
    type: getFileType(r.filename, r.mime_type),
    downloads: r.download_count,
    status: isExpired ? 'expired' : (r.status as 'active' | 'expired' | 'deleted'),
    ownerId: r.owner_id || undefined,
  };
}

/**
 * Ensure database table and indexes exist.
 * This runs natively inside the Worker with native D1 bindings.
 */
export async function ensureSchema(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        download_count INTEGER DEFAULT 0,
        delete_token TEXT NOT NULL,
        owner_id TEXT,
        status TEXT DEFAULT 'active'
      );`
    )
    .run();

  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_files_status_expires ON files (status, expires_at);`)
    .run()
    .catch(() => {});

  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_files_created ON files (created_at DESC);`)
    .run()
    .catch(() => {});

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS scratchpad (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        image_key TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`
    )
    .run();

  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at DESC);`)
    .run()
    .catch(() => {});

  await db.prepare(`CREATE TABLE IF NOT EXISTS mail (
    id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    preview TEXT NOT NULL DEFAULT '',
    r2_key TEXT NOT NULL,
    message_id TEXT
  );`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_received ON mail (received_at DESC);`).run().catch(() => {});
}

export async function insertMailRecord(db: D1Database, record: MailRecord): Promise<void> {
  await ensureSchema(db);
  await db.prepare(`INSERT INTO mail (id, from_address, to_address, subject, received_at, preview, r2_key, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(record.id, record.from_address, record.to_address, record.subject,
      record.received_at, record.preview, record.r2_key, record.message_id).run();
}

export async function listMailRecords(db: D1Database): Promise<MailRecord[]> {
  await ensureSchema(db);
  const result = await db.prepare(`SELECT * FROM mail ORDER BY received_at DESC LIMIT 100`).all<MailRecord>();
  return result.results ?? [];
}

export async function getMailRecord(db: D1Database, id: string): Promise<MailRecord | null> {
  await ensureSchema(db);
  return (await db.prepare(`SELECT * FROM mail WHERE id = ? LIMIT 1`).bind(id).first<MailRecord>()) ?? null;
}

export async function deleteMailRecord(db: D1Database, id: string): Promise<boolean> {
  await ensureSchema(db);
  const result = await db.prepare(`DELETE FROM mail WHERE id = ?`).bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Insert a new file record into D1.
 */
export async function insertFileRecord(db: D1Database, record: FileRecord): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO files (
        id, filename, size_bytes, mime_type, r2_key, created_at, expires_at, download_count, delete_token, owner_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.filename,
      record.size_bytes,
      record.mime_type,
      record.r2_key,
      record.created_at,
      record.expires_at,
      record.download_count,
      record.delete_token,
      record.owner_id ?? null,
      record.status
    )
    .run();
}

/**
 * Fetch a file record by id.
 */
export async function getFileRecordById(db: D1Database, id: string): Promise<FileRecord | null> {
  await ensureSchema(db);
  const result = await db
    .prepare(`SELECT * FROM files WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<FileRecord>();
  return result ?? null;
}

/**
 * List all active files that have not expired.
 * Also performs lazy status updates for expired files.
 */
export async function listActiveFiles(db: D1Database): Promise<FileRecord[]> {
  await ensureSchema(db);
  const now = Date.now();

  // Lazy mark expired
  await db
    .prepare(`UPDATE files SET status = 'expired' WHERE status = 'active' AND expires_at <= ?`)
    .bind(now)
    .run();

  const results = await db
    .prepare(
      `SELECT * FROM files
       WHERE status = 'active' AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .bind(now)
    .all<FileRecord>();

  return results.results ?? [];
}

/**
 * Increment download count for a file.
 */
export async function incrementDownloadCount(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(`UPDATE files SET download_count = download_count + 1 WHERE id = ?`)
    .bind(id)
    .run();
}

/**
 * Mark a file as deleted in D1.
 */
export async function markFileDeleted(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(`UPDATE files SET status = 'deleted' WHERE id = ?`)
    .bind(id)
    .run();
}

export async function insertNoteRecord(db: D1Database, record: NoteRecord): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      `INSERT INTO notes (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(record.id, record.title, record.content, record.created_at, record.updated_at)
    .run();
}

export async function getNoteRecordById(db: D1Database, id: string): Promise<NoteRecord | null> {
  await ensureSchema(db);
  const result = await db
    .prepare(`SELECT * FROM notes WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<NoteRecord>();
  return result ?? null;
}

export async function listNotes(db: D1Database): Promise<NoteRecord[]> {
  await ensureSchema(db);
  const result = await db
    .prepare(`SELECT * FROM notes ORDER BY updated_at DESC LIMIT 200`)
    .all<NoteRecord>();
  return result.results ?? [];
}

export async function updateNoteRecord(
  db: D1Database,
  id: string,
  title: string,
  content: string,
  updatedAt: number
): Promise<NoteRecord | null> {
  await ensureSchema(db);
  await db
    .prepare(
      `UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?`
    )
    .bind(title, content, updatedAt, id)
    .run();
  return getNoteRecordById(db, id);
}

export async function deleteNoteRecord(db: D1Database, id: string): Promise<boolean> {
  await ensureSchema(db);
  const result = await db.prepare(`DELETE FROM notes WHERE id = ?`).bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function getScratchpadRecord(db: D1Database): Promise<ScratchpadRecord> {
  await ensureSchema(db);
  const existing = await db.prepare(`SELECT * FROM scratchpad WHERE id = 'default' LIMIT 1`).first<ScratchpadRecord>();
  if (existing) return existing;
  const now = Date.now();
  const record: ScratchpadRecord = { id: 'default', content: '', image_key: null, created_at: now, updated_at: now };
  await db.prepare(`INSERT INTO scratchpad (id, content, image_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).bind(record.id, record.content, record.image_key, record.created_at, record.updated_at).run();
  return record;
}

export async function updateScratchpadRecord(db: D1Database, content: string, imageKey: string | null): Promise<ScratchpadRecord> {
  const current = await getScratchpadRecord(db);
  const updatedAt = Date.now();
  await db.prepare(`UPDATE scratchpad SET content = ?, image_key = ?, updated_at = ? WHERE id = 'default'`).bind(content, imageKey, updatedAt).run();
  return { ...current, content, image_key: imageKey, updated_at: updatedAt };
}
