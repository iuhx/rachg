import { ensureSchema } from './db';
import { deleteMailObject } from './storage';
import { StoredFiles } from './stored-files';
import type { WebdavEnv } from './webdav';

/** Operates only on exact keys recorded by this service, never bucket-wide prefixes. */
export async function cleanupStorage(db: D1Database, bucket: R2Bucket, credentials: WebdavEnv = {}): Promise<{ deleted: number; failed: number }> {
  await ensureSchema(db);
  const storage = new StoredFiles({ FILES_BUCKET: bucket, ...credentials });
  const now = Date.now();
  let deleted = 0, failed = 0;
  // At most 28 storage calls on a cold start (3 schema calls, 2 queries,
  // 5*3 transfer calls, 2*4 mail calls); note-share cleanup adds one more.
  // WebDAV uses Worker Secrets and requires no settings/schema reads.
  const files = await db.prepare(`SELECT id, r2_key FROM files
    WHERE status = 'purging'
       OR (status IN ('active', 'expired') AND expires_at != 0 AND expires_at <= ?)
       OR (status = 'uploading' AND created_at < ?)
    ORDER BY created_at LIMIT 5`).bind(now, now - 3600_000).all<{ id: string; r2_key: string }>();
  for (const record of files.results) {
    try {
      // Selection is only a candidate snapshot. Re-check and claim atomically;
      // an upload that became active/permanent after selection must survive.
      const claim = await db.prepare(`UPDATE files SET status = 'purging' WHERE id = ? AND r2_key = ? AND (
        status = 'purging' OR (status IN ('active', 'expired') AND expires_at != 0 AND expires_at <= ?)
        OR (status = 'uploading' AND created_at < ?))`).bind(record.id, record.r2_key, now, now - 3600_000).run();
      if (!claim.meta?.changes) continue;
      await storage.delete(record.r2_key);
      await db.prepare(`UPDATE files SET status = 'purged' WHERE id = ?`).bind(record.id).run();
      deleted++;
    } catch { failed++; }
  }
  const mail = await db.prepare("SELECT id, r2_key FROM mail_ingestions WHERE state = 'purging' OR (state = 'pending' AND created_at < ?) ORDER BY created_at LIMIT 2").bind(now - 3600_000).all<{ id: string; r2_key: string }>();
  for (const receipt of mail.results) {
    try {
      const claim = await db.prepare("UPDATE mail_ingestions SET state = 'purging' WHERE id = ? AND r2_key = ? AND (state = 'purging' OR (state = 'pending' AND created_at < ?))").bind(receipt.id, receipt.r2_key, now - 3600_000).run();
      if (!claim.meta?.changes) continue;
      const saved = await db.prepare('SELECT id FROM mail WHERE id = ?').bind(receipt.id).first();
      if (saved) {
        await db.prepare("UPDATE mail_ingestions SET state = 'stored' WHERE id = ?").bind(receipt.id).run();
      } else {
        await deleteMailObject(bucket, receipt.r2_key);
        await db.prepare("DELETE FROM mail_ingestions WHERE id = ? AND r2_key = ? AND state = 'purging'").bind(receipt.id, receipt.r2_key).run();
        deleted++;
      }
    } catch { failed++; }
  }
  if (failed) console.error('Storage cleanup will retry', { failed });
  return { deleted, failed };
}
