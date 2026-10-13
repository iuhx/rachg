export type StorageBackend = 'r2' | 'webdav';
export interface WebdavSettings {
  baseUrl: string;
  configured: boolean;
  source: 'worker-secrets';
  verifiedAt: number | null;
}
