import { ensureSchema } from './db';
import { deleteFromR2, deleteScratchpadObject, deleteMailObject } from './storage';

/** Operates only on exact keys recorded by this service, never bucket-wide prefixes. */
export async function cleanupStorage(db: D1Database, bucket: R2Bucket): Promise<{ deleted: number; failed: number }> {
  await ensureSchema(db);
  const now = Date.now();
  let deleted = 0, failed = 0;
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
      await deleteFromR2(bucket, record.r2_key);
      await db.prepare(`UPDATE files SET status = 'purged' WHERE id = ?`).bind(record.id).run();
      deleted++;
    } catch { failed++; }
  }
  // At most 49 storage calls including 14 schema calls on a cold start:
  // 3 candidate queries + 5*3 file calls + 3*3 image calls + 2*4 mail calls.
  // The scheduled note-share cleanup adds one call, keeping the total at 50.
  const images = await db.prepare('SELECT r2_key FROM scratchpad_cleanup WHERE not_before <= ? ORDER BY not_before LIMIT 3').bind(now).all<{ r2_key: string }>();
  for (const record of images.results) {
    try {
      const referenced = await db.prepare('SELECT id FROM scratchpad WHERE image_key = ?').bind(record.r2_key).first();
      if (referenced) {
        await db.prepare('UPDATE scratchpad_cleanup SET not_before = ? WHERE r2_key = ?').bind(now + 3600_000, record.r2_key).run();
        continue;
      }
      await deleteScratchpadObject(bucket, record.r2_key);
      await db.prepare('DELETE FROM scratchpad_cleanup WHERE r2_key = ?').bind(record.r2_key).run();
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
