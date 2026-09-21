import { ensureSchema } from './db';

/**
 * 4GB Storage Quota Management.
 * Checks total storage occupied by active non-expired files in D1.
 */
export async function getActiveStorageUsage(db: D1Database): Promise<number> {
  await ensureSchema(db).catch(() => {});
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
       FROM files
       WHERE status = 'active' AND expires_at > ?`
    )
    .bind(now)
    .first<{ total_bytes: number }>();

  return row?.total_bytes ?? 0;
}

/**
 * Validates whether adding newSizeBytes will breach the maxStorageLimit (default 4GB).
 */
export async function checkStorageQuota(
  db: D1Database,
  newSizeBytes: number,
  maxSizeBytes: number = 4 * 1024 * 1024 * 1024
): Promise<{ allowed: boolean; currentTotal: number; maxLimit: number }> {
  const currentTotal = await getActiveStorageUsage(db);
  const projectedTotal = currentTotal + newSizeBytes;
  const allowed = projectedTotal <= maxSizeBytes;

  return {
    allowed,
    currentTotal,
    maxLimit: maxSizeBytes,
  };
}
