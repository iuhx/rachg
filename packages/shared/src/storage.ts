export type StorageBackend = 'r2' | 'webdav';
export interface WebdavSettings {
  baseUrl: string;
  configured: boolean;
  canConfigure: boolean;
  username: string;
  revision: number;
  verifiedAt: number | null;
}
