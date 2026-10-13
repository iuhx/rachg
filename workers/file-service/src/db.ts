import type { FileItem, FileCategory, NoteItem } from '@rachg/shared';
import { isFileExpired } from './expiry';
import { ensureMailLedger } from '../../common/mail-ledger';

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
  status: 'active' | 'expired' | 'deleted' | 'uploading' | 'purged' | 'purging';
}

export interface NoteRecord {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  category_id?: string | null;
  category_name?: string | null;
  pinned?: number;
  organization_revision?: number;
}

export const NOTE_SELECT = `SELECT n.*, o.category_id, c.name AS category_name,
  COALESCE(o.pinned, 0) AS pinned, COALESCE(o.revision, 0) AS organization_revision
  FROM notes n LEFT JOIN note_organization o ON o.note_id = n.id
  LEFT JOIN note_categories c ON c.id = o.category_id`;

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

export interface SentMailRecord {
  id: string;
  resend_id: string | null;
  to_address: string;
  subject: string;
  text: string;
  sent_at: number;
  preview: string;
  status: 'sending' | 'sent' | 'failed' | 'unknown';
  in_reply_to: string | null;
  references_header: string | null;
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
    categoryId: record.category_id ?? null,
    categoryName: record.category_name ?? null,
    pinned: Boolean(record.pinned),
    organizationRevision: record.organization_revision ?? 0,
  };
}

export function mapRecordToFileItem(r: FileRecord, baseUrl: string): FileItem {
  const now = Date.now();
  const msRemaining = r.expires_at - now;
  const isExpired = r.status === 'expired' || r.status === 'purged' || isFileExpired(r.expires_at, now);

  return {
    id: r.id,
    name: r.filename,
    size: formatBytes(r.size_bytes),
    sizeBytes: r.size_bytes,
    updatedAt: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    expiresIn: isExpired ? 'Expired' : r.expires_at === 0 ? 'Permanent' : formatTimeRemaining(msRemaining),
    expiresTimestamp: r.expires_at === 0 ? undefined : r.expires_at,
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
const schemaReady = new WeakMap<D1Database, Promise<void>>();
export function ensureSchema(db: D1Database): Promise<void> {
  let pending = schemaReady.get(db);
  if (!pending) {
    pending = initializeSchema(db).catch((error) => { schemaReady.delete(db); throw error; });
    schemaReady.set(db, pending);
  }
  return pending;
}

async function initializeSchema(db: D1Database): Promise<void> {
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
    .run();

  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_files_created ON files (created_at DESC);`)
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
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_notes_title ON notes (title)').run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS note_categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS note_organization (
    note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES note_categories(id) ON DELETE SET NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)), revision INTEGER NOT NULL DEFAULT 1
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_note_organization_category ON note_organization (category_id)').run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS note_shares (
    note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );`).run();

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

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_received ON mail (received_at DESC);`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS sent_mail (
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
  );`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sent_mail_sent_at ON sent_mail (sent_at DESC);`).run();
  await ensureMailLedger(db);
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
  const [result] = await db.batch([
    db.prepare(`DELETE FROM mail WHERE id = ?`).bind(id),
    db.prepare("UPDATE mail_ingestions SET state = 'purged' WHERE id = ?").bind(id),
  ]);
  return (result.meta?.changes ?? 0) > 0;
}

export async function insertSentMailRecord(db: D1Database, record: SentMailRecord): Promise<void> {
  await ensureSchema(db);
  await db.prepare(`INSERT INTO sent_mail (id, resend_id, to_address, subject, text, sent_at, preview, status, in_reply_to, references_header)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(record.id, record.resend_id, record.to_address, record.subject,
      record.text, record.sent_at, record.preview, record.status, record.in_reply_to, record.references_header).run();
}

export async function updateSentMailStatus(db: D1Database, id: string, status: SentMailRecord['status'], resendId: string | null): Promise<void> {
  await ensureSchema(db);
  await db.prepare(`UPDATE sent_mail SET status = ?, resend_id = ? WHERE id = ?`).bind(status, resendId, id).run();
}

export async function listSentMailRecords(db: D1Database): Promise<SentMailRecord[]> {
  await ensureSchema(db);
  const result = await db.prepare(`SELECT id, resend_id, to_address, subject, sent_at, preview, status FROM sent_mail ORDER BY sent_at DESC LIMIT 100`).all<SentMailRecord>();
  return result.results ?? [];
}

export async function getSentMailRecord(db: D1Database, id: string): Promise<SentMailRecord | null> {
  await ensureSchema(db);
  return (await db.prepare(`SELECT * FROM sent_mail WHERE id = ? LIMIT 1`).bind(id).first<SentMailRecord>()) ?? null;
}

/**
 * Insert a new file record into D1.
 */
export async function insertFileRecord(db: D1Database, record: FileRecord, maxStorageBytes = Number.MAX_SAFE_INTEGER): Promise<boolean> {
  await ensureSchema(db);
  const result = await db
    .prepare(
      `INSERT INTO files (
        id, filename, size_bytes, mime_type, r2_key, created_at, expires_at, download_count, delete_token, owner_id, status
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT COALESCE(SUM(size_bytes), 0) FROM files
          WHERE status NOT IN ('deleted', 'purged')) + ? <= ?`
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
      record.status,
      record.size_bytes,
      maxStorageBytes
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
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
    .prepare(`UPDATE files SET status = 'expired' WHERE status = 'active' AND expires_at != 0 AND expires_at <= ?`)
    .bind(now)
    .run();

  const results = await db
    .prepare(
      `SELECT * FROM files
       WHERE status = 'active' AND (expires_at = 0 OR expires_at > ?)
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

export async function insertNoteRecord(db: D1Database, record: NoteRecord, categoryId: string | null = null): Promise<boolean> {
  await ensureSchema(db);
  const [result] = await db.batch([
    db.prepare(`INSERT INTO notes (id, title, content, created_at, updated_at)
      SELECT ?, ?, ?, ?, ? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM note_categories WHERE id = ?)`)
      .bind(record.id, record.title, record.content, record.created_at, record.updated_at, categoryId, categoryId),
    db.prepare(`INSERT INTO note_organization (note_id, category_id, pinned, revision)
      SELECT ?, ?, 0, 1 WHERE changes() > 0`).bind(record.id, categoryId),
  ]);
  return (result.meta?.changes ?? 0) > 0;
}

export async function getNoteRecordById(db: D1Database, id: string): Promise<NoteRecord | null> {
  await ensureSchema(db);
  const result = await db
    .prepare(`${NOTE_SELECT} WHERE n.id = ? LIMIT 1`)
    .bind(id)
    .first<NoteRecord>();
  return result ?? null;
}

export async function listNotes(db: D1Database): Promise<NoteRecord[]> {
  await ensureSchema(db);
  const result = await db
    .prepare(`${NOTE_SELECT} ORDER BY n.updated_at DESC LIMIT 200`)
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
  const [, , result] = await db.batch([
    db.prepare('DELETE FROM note_shares WHERE note_id = ?').bind(id),
    db.prepare('DELETE FROM note_organization WHERE note_id = ?').bind(id),
    db.prepare('DELETE FROM notes WHERE id = ?').bind(id),
  ]);
  return (result.meta?.changes ?? 0) > 0;
}
