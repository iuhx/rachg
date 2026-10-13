import { ensureSchema } from './db';

/**
 * 4GB Storage Quota Management.
 * Includes expired and uploading objects until physical cleanup succeeds.
 */
export async function getActiveStorageUsage(db: D1Database): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
       FROM files
       WHERE status NOT IN ('deleted', 'purged') AND r2_key NOT LIKE 'webdav/%'`
    )
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
  if (!Number.isSafeInteger(newSizeBytes) || newSizeBytes < 0 || !Number.isSafeInteger(maxSizeBytes) || maxSizeBytes <= 0) throw new Error('Invalid storage size configuration');
  const projectedTotal = currentTotal + newSizeBytes;
  const allowed = projectedTotal <= maxSizeBytes;

  return {
    allowed,
    currentTotal,
    maxLimit: maxSizeBytes,
  };
}
