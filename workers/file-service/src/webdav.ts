import type { WebdavSettings } from '@rachg/shared';
import { InputError, MAX_FILE_BYTES, readBounded } from '../../common/content';
import { boundedFileStream, fileSlice } from './file-streams';

export const WEBDAV_BASE_URL = 'https://higa.teracloud.jp/dav/rachg/';
export interface WebdavEnv { WEBDAV_USERNAME?: string; WEBDAV_PASSWORD?: string }
export interface StoredObject { size: number | null; httpEtag: string; body?: ReadableStream; writeHttpMetadata: (headers: Headers) => void }
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));

function configured(env: WebdavEnv) {
  return typeof env.WEBDAV_USERNAME === 'string' && Boolean(env.WEBDAV_USERNAME.trim()) && env.WEBDAV_USERNAME.length <= 200 && !/[:\x00-\x1f\x7f]/.test(env.WEBDAV_USERNAME)
    && typeof env.WEBDAV_PASSWORD === 'string' && env.WEBDAV_PASSWORD.length > 0 && env.WEBDAV_PASSWORD.length <= 1024 && !/[\x00-\x1f\x7f]/.test(env.WEBDAV_PASSWORD);
}
function safeSettings(env: WebdavEnv, verifiedAt: number | null = null): WebdavSettings {
  return { baseUrl: WEBDAV_BASE_URL, configured: Boolean(configured(env)), source: 'worker-secrets', verifiedAt };
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
  private async request(url: string, method: string, headers: Record<string, string> = {}, body?: ArrayBuffer | string | ReadableStream) {
    try { return await fetch(url, { method, headers: { ...headers, ...(method === 'GET' || method === 'HEAD' ? { 'Accept-Encoding': 'identity' } : {}), Authorization: this.authorization }, body,
      redirect: 'manual', signal: AbortSignal.timeout(method === 'PUT' || method === 'GET' ? 300_000 : 30_000) }); }
    catch { throw new InputError('InfiniCLOUD could not be reached. Check its connection in Settings and retry.', 502); }
  }
  private async failure(response: Response): Promise<never> {
    await response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status)) throw new InputError('InfiniCLOUD rejected the credentials. Update WEBDAV_USERNAME and WEBDAV_PASSWORD in Cloudflare Worker Secrets, then deploy.', 502);
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
    const response = await this.request(this.url(storageKey), 'PUT', { 'Content-Type': mime, 'If-None-Match': '*' }, body);
    if (response.status === 412) { await response.body?.cancel(); throw new WebdavConflict(); }
    if (![200, 201, 204].includes(response.status)) await this.failure(response);
    await response.body?.cancel();
  }
  async delete(storageKey: string) {
    const response = await this.request(this.url(storageKey), 'DELETE');
    if (![200, 204, 404, 410].includes(response.status)) await this.failure(response);
    await response.body?.cancel();
  }
  private object(response: Response, size: number | null, body?: ReadableStream): StoredObject {
    return { size, body, httpEtag: response.headers.get('etag') || '', writeHttpMetadata: headers => {
      headers.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    } };
  }
  private async probeSize(storageKey: string): Promise<number | null> {
    const response = await this.request(this.url(storageKey), 'GET', { Range: 'bytes=0-0' });
    try {
      if (response.status === 206) {
        const match = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        const start = Number(match?.[1]), end = Number(match?.[2]), size = Number(match?.[3]);
        return match && start === 0 && end === 0 && Number.isSafeInteger(size) && size > 0 && size <= MAX_FILE_BYTES ? size : null;
      }
      if (response.status === 416) {
        const emptySize = Number(response.headers.get('content-range')?.match(/^bytes \*\/(\d+)$/)?.[1]);
        return emptySize === 0 ? 0 : null;
      }
      if (response.status === 200) {
        const length = response.headers.get('content-length');
        const size = length !== null && /^\d+$/.test(length) ? Number(length) : NaN;
        return Number.isSafeInteger(size) && size >= 0 && size <= MAX_FILE_BYTES ? size : null;
      }
      return null;
    } finally { await response.body?.cancel().catch(() => {}); }
  }
  async head(storageKey: string): Promise<StoredObject | null> {
    const response = await this.request(this.url(storageKey), 'HEAD');
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (response.status !== 200 && ![405, 501].includes(response.status)) await this.failure(response);
    const length = response.headers.get('content-length');
    const size = length !== null && /^\d+$/.test(length) ? Number(length) : NaN;
    await response.body?.cancel();
    if (Number.isSafeInteger(size) && size >= 0 && size <= MAX_FILE_BYTES) return this.object(response, size);
    let probed: number | null = null;
    try { probed = await this.probeSize(storageKey); } catch { /* Return a valid HEAD response without a known length. */ }
    return this.object(response, probed);
  }
  async get(storageKey: string, range?: { offset: number; length: number }): Promise<StoredObject | null> {
    const response = await this.request(this.url(storageKey), 'GET', range ? { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : {});
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (response.status !== 200 && !(range && response.status === 206)) await this.failure(response);
    const invalid = async (message: string): Promise<never> => { await response.body?.cancel(); throw new InputError(message, 502); };
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding !== 'identity') return invalid('InfiniCLOUD returned an unexpected compressed response. Retry the download.');
    const lengthHeader = response.headers.get('content-length');
    const length = lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : NaN;
    if (response.status === 206 && range) {
      const contentRange = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      const offset = Number(contentRange?.[1]), end = Number(contentRange?.[2]);
      const size = Number(contentRange?.[3]);
      if (!contentRange || offset !== range.offset || end !== range.offset + range.length - 1 || (lengthHeader !== null && length !== range.length) || !Number.isSafeInteger(size) || size > MAX_FILE_BYTES || size <= end) return invalid('InfiniCLOUD returned an invalid byte range.');
      return this.object(response, size, fileSlice(response.body, range.length));
    }
    let size: number | null = Number.isSafeInteger(length) && length >= 0 && length <= MAX_FILE_BYTES ? length : null;
    if (size === null) {
      try { size = await this.probeSize(storageKey); } catch { /* The original body can still be streamed with a byte cap. */ }
    }
    if (range && size !== null) {
      if (size < range.offset + range.length) return invalid('The requested byte range is outside the remote file.');
      return this.object(response, size, fileSlice(response.body, size, range.offset, range.length));
    }
    if (size !== null) return this.object(response, size, fileSlice(response.body, size));
    if (range && response.status === 206) return invalid('InfiniCLOUD returned an invalid byte range.');
    return this.object(response, null, boundedFileStream(response.body, MAX_FILE_BYTES));
  }
}

export async function loadWebdav(env: WebdavEnv): Promise<WebdavClient> {
  if (!configured(env)) throw new InputError('Set WEBDAV_USERNAME and WEBDAV_PASSWORD as Secrets on the rachg-file-service Worker, then deploy.', 503);
  return new WebdavClient(env.WEBDAV_USERNAME!.trim(), env.WEBDAV_PASSWORD!);
}

/** Authenticated status/test only. Credentials are never accepted or stored by this API. */
export async function routeWebdavSettings(request: Request, env: WebdavEnv) {
  if (request.method === 'GET') return { success: true, settings: safeSettings(env) };
  if (request.method === 'POST') {
    await (await loadWebdav(env)).test();
    return { success: true, settings: safeSettings(env, Date.now()) };
  }
  throw new InputError('Credentials are managed in Cloudflare Worker Secrets.', 405);
}
