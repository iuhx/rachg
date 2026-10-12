import { ensureSchema } from './db';
import { deleteFromR2, deleteScratchpadObject } from './storage';

/** Operates only on exact keys recorded by this service, never bucket-wide prefixes. */
export async function cleanupStorage(db: D1Database, bucket: R2Bucket): Promise<{ deleted: number; failed: number }> {
  await ensureSchema(db);
  const now = Date.now();
  let deleted = 0, failed = 0;
  const files = await db.prepare(`SELECT id, r2_key FROM files
    WHERE (status IN ('active', 'expired') AND expires_at != 0 AND expires_at <= ?)
       OR (status = 'uploading' AND created_at < ?)
    ORDER BY created_at LIMIT 10`).bind(now, now - 3600_000).all<{ id: string; r2_key: string }>();
  for (const record of files.results) {
    try {
      await deleteFromR2(bucket, record.r2_key);
      await db.prepare(`UPDATE files SET status = 'purged' WHERE id = ?`).bind(record.id).run();
      deleted++;
    } catch { failed++; }
  }
  // Keep the combined cold-start invocation within the Free plan's request budget.
  const images = await db.prepare('SELECT r2_key FROM scratchpad_cleanup WHERE not_before <= ? ORDER BY not_before LIMIT 5').bind(now).all<{ r2_key: string }>();
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
  if (failed) console.error('Storage cleanup will retry', { failed });
  return { deleted, failed };
}
