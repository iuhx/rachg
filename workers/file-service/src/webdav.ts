import type { WebdavSettings } from '@rachg/shared';
import { boundedJson, InputError, MAX_FILE_BYTES, readBounded } from '../../common/content';
import { ensureSchema } from './db';

export const WEBDAV_BASE_URL = 'https://higa.teracloud.jp/v2/dav/rachg/';
export interface WebdavEnv { DB: D1Database; WEBDAV_CREDENTIAL_KEY?: string }
interface SettingsRow { username: string; base_url: string; encrypted_password: string; revision: number; verified_at: number }
export interface StoredObject { size: number; httpEtag: string; body?: ReadableStream; writeHttpMetadata: (headers: Headers) => void }
const schemaReady = new WeakMap<D1Database, Promise<void>>();
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function schema(db: D1Database) {
  let pending = schemaReady.get(db);
  if (!pending) {
    pending = (async () => { await ensureSchema(db); await db.prepare(`CREATE TABLE IF NOT EXISTS webdav_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL, base_url TEXT NOT NULL,
      encrypted_password TEXT NOT NULL, revision INTEGER NOT NULL, verified_at INTEGER NOT NULL
    )`).run(); })().catch(error => { schemaReady.delete(db); throw error; });
    schemaReady.set(db, pending);
  }
  await pending;
}
async function readSettings(db: D1Database) { await schema(db); return db.prepare('SELECT * FROM webdav_settings WHERE id = 1').first<SettingsRow>(); }
function configuredKey(env: WebdavEnv) { return typeof env.WEBDAV_CREDENTIAL_KEY === 'string' && /^[a-f0-9]{64}$/i.test(env.WEBDAV_CREDENTIAL_KEY); }
async function key(env: WebdavEnv) {
  if (!configuredKey(env)) throw new InputError('Secure storage setup is not ready. Please contact the workspace administrator.', 503);
  const bytes = Uint8Array.from(env.WEBDAV_CREDENTIAL_KEY!.match(/../g)!, part => parseInt(part, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const aad = (username: string) => new TextEncoder().encode(`rachg-webdav-v1\n${WEBDAV_BASE_URL}\n${username}`);
async function encrypt(env: WebdavEnv, username: string, password: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const value = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(username) }, await key(env), new TextEncoder().encode(password));
  return `${encode(iv)}.${encode(new Uint8Array(value))}`;
}
async function decrypt(env: WebdavEnv, row: SettingsRow) {
  if (row.base_url !== WEBDAV_BASE_URL) throw new InputError('The configured storage location changed. Existing files require their original connection.', 409);
  try {
    const [iv, value] = row.encrypted_password.split('.').map(decode);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(row.username) }, await key(env), value));
  } catch { throw new InputError('Unable to unlock the saved WebDAV credentials. Re-enter the Apps Password in Settings.', 503); }
}
function safeSettings(env: WebdavEnv, row: SettingsRow | null): WebdavSettings {
  return { baseUrl: WEBDAV_BASE_URL, configured: Boolean(row && configuredKey(env)), canConfigure: configuredKey(env), username: row?.username ?? '', revision: row?.revision ?? 0, verifiedAt: row?.verified_at ?? null };
}

export class WebdavConflict extends InputError { constructor() { super('The remote filename already exists. Nothing was overwritten. Retry with a new upload.', 409); } }
export class WebdavClient {
  private authorization: string;
  constructor(username: string, password: string) { this.authorization = `Basic ${encode(new TextEncoder().encode(`${username}:${password}`))}`; }
  private url(storageKey: string) {
    // One opaque file per upload, directly beneath the user-approved root. No
    // URL, directory traversal, or recursive delete can be supplied by callers.
    if (!/^webdav\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}--[^/\\\x00-\x1f\x7f]+$/.test(storageKey)) throw new InputError('Invalid WebDAV storage key');
    return WEBDAV_BASE_URL + encodeURIComponent(storageKey.slice('webdav/'.length));
  }
  private async request(url: string, method: string, headers: Record<string, string> = {}, body?: ArrayBuffer | string) {
    try { return await fetch(url, { method, headers: { ...headers, Authorization: this.authorization }, body,
      redirect: 'manual', signal: AbortSignal.timeout(30_000) }); }
    catch { throw new InputError('InfiniCLOUD could not be reached. Check its connection in Settings and retry.', 502); }
  }
  private async failure(response: Response): Promise<never> {
    await response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status)) throw new InputError('InfiniCLOUD rejected the credentials. Check Connection ID and Apps Password in Settings.', 502);
    if (response.status === 507) throw new InputError('InfiniCLOUD storage is full. Free space there and retry.', 413);
    if (response.status >= 300 && response.status < 400) throw new InputError('InfiniCLOUD redirected this request. The connection URL must point directly to your rachg folder.', 502);
    throw new InputError(`InfiniCLOUD returned HTTP ${response.status}. Verify the WebDAV URL, Apps Connection and folder access in Settings.`, 502);
  }
  async test() {
    const response = await this.request(WEBDAV_BASE_URL, 'PROPFIND', { Depth: '0', 'Content-Type': 'application/xml;charset=utf-8' }, '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>');
    if (response.status !== 207) await this.failure(response);
    const xml = new TextDecoder().decode(await readBounded(response.body, 64_000));
    // No XML entity expansion: accept only a bounded, read-only collection reply.
    const href = xml.match(/<(?:[\w.-]+:)?href\b[^>]*>([^<]+)<\/(?:[\w.-]+:)?href>/i)?.[1]?.trim();
    let location = '';
    try { location = new URL(href ?? '', WEBDAV_BASE_URL).href.replace(/\/$/, ''); } catch { /* rejected below */ }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !href || location !== WEBDAV_BASE_URL.replace(/\/$/, '') ||
        !/<(?:[\w.-]+:)?collection(?:\s|\/|>)/i.test(xml) || !/HTTP\/\d(?:\.\d)?\s+200\b/.test(xml)) {
      throw new InputError('The WebDAV response did not confirm your rachg folder. Check the Apps Connection URL and folder permissions.', 502);
    }
  }
  async put(storageKey: string, body: ReadableStream | ArrayBuffer, mime: string) {
    const data = body instanceof ArrayBuffer ? body : await readBounded(body, MAX_FILE_BYTES);
    const response = await this.request(this.url(storageKey), 'PUT', { 'Content-Type': mime, 'If-None-Match': '*' }, data);
    if (response.status === 412) { await response.body?.cancel(); throw new WebdavConflict(); }
    if (![200, 201, 204].includes(response.status)) await this.failure(response);
    await response.body?.cancel();
  }
  async delete(storageKey: string) {
    const response = await this.request(this.url(storageKey), 'DELETE');
    if (![200, 204, 404, 410].includes(response.status)) await this.failure(response);
    await response.body?.cancel();
  }
  private object(response: Response, size: number, body?: ReadableStream): StoredObject {
    return { size, body, httpEtag: response.headers.get('etag') || '', writeHttpMetadata: headers => {
      headers.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    } };
  }
  async head(storageKey: string): Promise<StoredObject | null> {
    const response = await this.request(this.url(storageKey), 'HEAD');
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (response.status !== 200) await this.failure(response);
    const length = response.headers.get('content-length');
    const size = length !== null && /^\d+$/.test(length) ? Number(length) : NaN;
    await response.body?.cancel();
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) throw new InputError('InfiniCLOUD returned an unsupported file size.', 502);
    return this.object(response, size);
  }
  async get(storageKey: string, range?: { offset: number; length: number }): Promise<StoredObject | null> {
    const response = await this.request(this.url(storageKey), 'GET', range ? { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : {});
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (response.status !== 200 && !(range && response.status === 206)) await this.failure(response);
    const data = await readBounded(response.body, MAX_FILE_BYTES);
    if (response.status === 206 && range) {
      const contentRange = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      const size = Number(contentRange?.[3]);
      if (!contentRange || Number(contentRange[1]) !== range.offset || Number(contentRange[2]) !== range.offset + range.length - 1 || data.byteLength !== range.length || size > MAX_FILE_BYTES || size <= Number(contentRange[2])) throw new InputError('InfiniCLOUD returned an invalid byte range.', 502);
      return this.object(response, size, new Response(data).body!);
    }
    if (range && data.byteLength < range.offset + range.length) throw new InputError('The remote file changed during download. Retry the download.', 409);
    // Some WebDAV services ignore Range. Slice the bounded body before sending 206.
    return this.object(response, data.byteLength, new Response(range ? data.slice(range.offset, range.offset + range.length) : data).body!);
  }
}

export async function loadWebdav(env: WebdavEnv): Promise<WebdavClient> {
  const row = await readSettings(env.DB);
  if (!row) throw new InputError('Set up InfiniCLOUD in Settings before uploading there.', 409);
  return new WebdavClient(row.username, await decrypt(env, row));
}

export async function routeWebdavSettings(request: Request, env: WebdavEnv) {
  if (!['GET', 'PUT', 'POST'].includes(request.method)) throw new InputError('Method not allowed', 405);
  const row = await readSettings(env.DB);
  if (request.method === 'GET') return { success: true, settings: safeSettings(env, row) };
  if (request.method === 'POST') { await (await loadWebdav(env)).test(); return { success: true, settings: safeSettings(env, row) }; }
  const body = await boundedJson(request) as { username?: unknown; password?: unknown; revision?: unknown } | null;
  if (!body || typeof body.username !== 'string' || !body.username.trim() || body.username.length > 200 || /[:\x00-\x1f\x7f]/.test(body.username) ||
    typeof body.password !== 'string' || body.password.length > 1024 || /[\x00-\x1f\x7f]/.test(body.password) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new InputError('A valid Connection ID, Apps Password and settings revision are required.');
  const username = body.username.trim();
  if (!body.password && (!row || row.username !== username)) throw new InputError('Enter the Apps Password for this connection.');
  const password = body.password || await decrypt(env, row!);
  const encrypted = await encrypt(env, username, password);
  if (row && row.username !== username) throw new InputError('This storage location is already linked to another Connection ID. Keep its ID and update only the Apps Password to preserve file access.', 409);
  await new WebdavClient(username, password).test();
  const now = Date.now();
  const result = await env.DB.prepare(`INSERT INTO webdav_settings (id,username,base_url,encrypted_password,revision,verified_at)
    SELECT 1,?,?,?,1,? WHERE ? = 0 OR EXISTS (SELECT 1 FROM webdav_settings WHERE id = 1)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username, encrypted_password=excluded.encrypted_password,
      revision=webdav_settings.revision+1, verified_at=excluded.verified_at
    WHERE webdav_settings.revision = ? AND webdav_settings.username=excluded.username`)
    .bind(username, WEBDAV_BASE_URL, encrypted, now, body.revision, body.revision).run();
  if (!result.meta.changes) throw new InputError('Storage settings or files changed. Refresh Settings and retry.', 409);
  return { success: true, settings: safeSettings(env, (await readSettings(env.DB))) };
}
