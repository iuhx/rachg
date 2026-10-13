import { boundedJson, InputError, MAX_TEXT_BYTES, utf8Size } from '../../common/content';
import { ensureSchema, mapRecordToNoteItem, type NoteRecord } from './db';

/** Only called after the administrator JWT and request-Origin checks. */
export async function routeNoteTransfer(request: Request, db: D1Database) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/export')) {
    if (request.method !== 'GET') throw new InputError('Method not allowed', 405);
    const after = url.searchParams.get('after') || '';
    if (after && !/^[A-Za-z0-9_-]{1,120}$/.test(after)) throw new InputError('Invalid export cursor');
    await ensureSchema(db);
    const result = await db.prepare('SELECT * FROM notes WHERE id > ? ORDER BY id ASC LIMIT 11').bind(after).all<NoteRecord>();
    const records = result.results.slice(0, 10);
    return { success: true, notes: records.map(mapRecordToNoteItem), nextCursor: result.results.length > 10 ? records[9].id : null };
  }
  if (request.method !== 'POST') throw new InputError('Method not allowed', 405);
  const payload = await boundedJson(request) as { id?: unknown; title?: unknown; content?: unknown } | null;
  if (!payload || typeof payload.id !== 'string' || !/^import-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(payload.id) ||
      typeof payload.title !== 'string' || !payload.title.trim() || payload.title.trim().length > 200 ||
      typeof payload.content !== 'string' || utf8Size(payload.content) > MAX_TEXT_BYTES) {
    throw new InputError('A valid import ID, title (up to 200 characters) and note (up to 1 MB) are required.');
  }
  await ensureSchema(db);
  const title = payload.title.trim(), content = payload.content, now = Date.now();
  // Stable IDs make a retry safe after a lost response. Exact duplicates are
  // skipped even when the existing note is outside the UI's page.
  const inserted = await db.prepare(`INSERT INTO notes (id, title, content, created_at, updated_at)
    SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM notes WHERE title = ? AND content = ?)
    ON CONFLICT(id) DO NOTHING`).bind(payload.id, title, content, now, now, title, content).run();
  const byId = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(payload.id).first<NoteRecord>();
  if (byId && (byId.title !== title || byId.content !== content)) throw new InputError('This imported note was changed after saving. It has not been overwritten.', 409);
  const record = byId || await db.prepare('SELECT * FROM notes WHERE title = ? AND content = ? LIMIT 1').bind(title, content).first<NoteRecord>();
  if (!record) throw new InputError('The note changed during import. Retry this item.', 409);
  return { success: true, note: mapRecordToNoteItem(record), imported: (inserted.meta?.changes ?? 0) > 0 };
}
