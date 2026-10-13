/** Decimal MB: keep uploads below the edge's 100 MB request limit. */
export const FILE_UPLOAD_BYTES = 99_000_000;
export type StorageBackend = 'r2' | 'webdav';
export interface WebdavSettings {
  baseUrl: string;
  configured: boolean;
  source: 'worker-secrets';
  verifiedAt: number | null;
}
