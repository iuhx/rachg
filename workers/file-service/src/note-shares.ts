import { boundedJson, InputError, utf8Size } from '../../common/content';
import { ensureSchema } from './db';
import { noteSharePage, publicShareHeaders } from './note-share-page';

const SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN = /^[a-f0-9]{64}$/;
interface ShareRecord {
  note_id: string;
  token: string;
  title: string;
  content: string;
  created_at: number;
  expires_at: number;
}

function metadata(record: ShareRecord, baseUrl: string) {
  return { token: record.token, url: `${baseUrl}/s/${record.token}`, title: record.title, content: record.content,
    createdTimestamp: record.created_at, expiresTimestamp: record.expires_at };
}

export async function cleanupNoteShares(db: D1Database): Promise<void> {
  await ensureSchema(db);
  await db.prepare('DELETE FROM note_shares WHERE expires_at <= ?').bind(Date.now()).run();
}

/** The only anonymous entry point. No private route is dispatched from here. */
export async function publicNoteShare(request: Request, db: D1Database, enabled: boolean, origin: string): Promise<Response> {
  const path = new URL(request.url).pathname;
  const headers = publicShareHeaders();
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  if (!enabled) return new Response('Note sharing is not available.', { status: 404, headers });
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD');
    return new Response('Method not allowed', { status: 405, headers });
  }
  if (path === '/s/status') {
    headers.set('Content-Type', 'application/json');
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ service: 'rachg-note-share', ready: true }), { headers });
  }
  const token = path.slice(3);
  const unavailable = () => new Response(request.method === 'HEAD' ? null : 'This note link is unavailable or has expired.', { status: 404, headers });
  if (!TOKEN.test(token)) return unavailable();
  await ensureSchema(db);
  // Joining the source ensures a deleted note can never remain publicly readable.
  const record = await db.prepare(`SELECT s.* FROM note_shares s INNER JOIN notes n ON n.id = s.note_id WHERE s.token = ? AND s.expires_at > ? LIMIT 1`)
    .bind(token, Date.now()).first<ShareRecord>();
  if (!record) return unavailable();
  if (request.method === 'HEAD') {
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(null, { headers });
  }
  return noteSharePage(record.title, record.content, record.expires_at);
}

/** Caller must pass the normal administrator JWT and trusted-Origin checks first. */
export async function manageNoteShare(request: Request, db: D1Database, id: string, baseUrl: string, enabled: boolean) {
  await ensureSchema(db);
  const now = Date.now();
  if (request.method === 'GET') {
    const record = await db.prepare(`SELECT s.* FROM note_shares s INNER JOIN notes n ON n.id = s.note_id WHERE s.note_id = ? AND s.expires_at > ? LIMIT 1`)
      .bind(id, now).first<ShareRecord>();
    return { success: true, enabled, share: record ? metadata(record, baseUrl) : null };
  }
  if (request.method === 'DELETE') {
    const payload = await boundedJson(request) as { token?: unknown } | null;
    if (!payload || typeof payload.token !== 'string' || !TOKEN.test(payload.token)) throw new InputError('A valid share token is required');
    // A stale dialog cannot revoke a newly created link from another tab.
    await db.prepare('DELETE FROM note_shares WHERE note_id = ? AND token = ?').bind(id, payload.token).run();
    return { success: true, share: null };
  }
  if (request.method !== 'POST') throw new InputError('Method not allowed', 405);
  if (!enabled) throw new InputError('Public note sharing has not been enabled on the server.', 503);
  const payload = await boundedJson(request) as { updatedTimestamp?: unknown; title?: unknown; content?: unknown } | null;
  if (!payload || !Number.isSafeInteger(payload.updatedTimestamp) || typeof payload.title !== 'string' || typeof payload.content !== 'string') throw new InputError('Save and reload this note before sharing.');
  if (utf8Size(payload.content) > 200_000) throw new InputError('Shared notes support up to 200 KB. Shorten the note before sharing.', 413);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  // Snapshot exactly the version reviewed in the dialog; do not publish newer edits.
  // At most one link per note. Repeated requests never silently replace an active link.
  const result = await db.prepare(`INSERT INTO note_shares (note_id, token, title, content, created_at, expires_at)
    SELECT id, ?, title, content, ?, ? FROM notes WHERE id = ? AND updated_at = ? AND title = ? AND content = ?
    ON CONFLICT(note_id) DO UPDATE SET token = excluded.token, title = excluded.title, content = excluded.content,
      created_at = excluded.created_at, expires_at = excluded.expires_at WHERE note_shares.expires_at <= ?`)
    .bind(token, now, now + SHARE_LIFETIME_MS, id, payload.updatedTimestamp, payload.title, payload.content, now).run();
  if (!result.meta.changes) throw new InputError('The note changed or already has a share link. Close this dialog and reload before sharing.', 409);
  return { success: true, share: metadata({ note_id: id, token, title: payload.title, content: payload.content, created_at: now, expires_at: now + SHARE_LIFETIME_MS }, baseUrl) };
}
