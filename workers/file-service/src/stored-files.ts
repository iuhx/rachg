import { InputError } from '../../common/content';
import { uploadToR2, getFromR2, headFromR2, deleteFromR2 } from './storage';
import { loadWebdav, type WebdavClient, type WebdavEnv, type StoredObject } from './webdav';

export const isWebdavKey = (key: string) => key.startsWith('webdav/');
export function buildWebdavKey(id: string, filename: string) {
  const cleaned = filename.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'file';
  let name = '', bytes = 0;
  for (const character of cleaned) {
    const size = new TextEncoder().encode(character).byteLength;
    if (bytes + size > 200) break;
    name += character; bytes += size;
  }
  return `webdav/${id}--${name}`;
}

/** Credentials are loaded once per request/cleanup run, only for WebDAV files. */
export class StoredFiles {
  private webdav?: Promise<WebdavClient>;
  constructor(private env: WebdavEnv & { FILES_BUCKET: R2Bucket }) {}
  private client() { return this.webdav ??= loadWebdav(this.env); }
  async ready(backend: string) {
    if (!['r2', 'webdav'].includes(backend)) throw new InputError('Choose a valid storage destination.');
    if (backend === 'webdav') await this.client();
  }
  async put(key: string, body: ReadableStream | ArrayBuffer, mime: string, metadata: Record<string, string>) {
    if (isWebdavKey(key)) await (await this.client()).put(key, body, mime);
    else await uploadToR2(this.env.FILES_BUCKET, key, body, mime, metadata);
  }
  async head(key: string): Promise<StoredObject | null> {
    return isWebdavKey(key) ? (await this.client()).head(key) : headFromR2(this.env.FILES_BUCKET, key);
  }
  async get(key: string, range?: { offset: number; length: number }): Promise<StoredObject | null> {
    return isWebdavKey(key) ? (await this.client()).get(key, range) : getFromR2(this.env.FILES_BUCKET, key, range);
  }
  async delete(key: string) {
    if (isWebdavKey(key)) await (await this.client()).delete(key);
    else await deleteFromR2(this.env.FILES_BUCKET, key);
  }
}
