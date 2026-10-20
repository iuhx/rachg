import { InputError, readBounded } from '../../common/content';
import { boundedFileStream } from './file-streams';

export interface DouyinEnv {
  DOUYIN_API_BASE_URL?: string;
  DOUYIN_API_KEY?: string;
}

const MAX_INFO_BYTES = 1_000_000;
const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;
const REDIRECT_LIMIT = 4;

function getConfig(env: DouyinEnv) {
  const key = env.DOUYIN_API_KEY?.trim();
  const configuredBase = env.DOUYIN_API_BASE_URL?.trim();
  if (!key || !configuredBase) throw new InputError('Douyin downloads are not configured on the Worker.', 503);

  let base: URL;
  try { base = new URL(configuredBase); }
  catch { throw new InputError('The Douyin API address is not configured correctly.', 503); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) {
    throw new InputError('The Douyin API must use a trusted HTTPS origin.', 503);
  }
  return { origin: base.origin, key };
}

function parseLink(request: Request): string {
  const value = new URL(request.url).searchParams.get('url')?.trim() || '';
  if (!value || value.length > 4096) throw new InputError('Enter a Douyin link or copied share text up to 4,096 characters.');
  return value;
}

function apiUrl(origin: string, endpoint: 'info' | 'download', link: string): URL {
  const url = new URL('/api/' + endpoint, origin);
  url.searchParams.set('url', link);
  return url;
}

async function cancel(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

async function requestInfo(origin: string, key: string, link: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(apiUrl(origin, 'info', link), {
      headers: { Accept: 'application/json', 'X-Api-Key': key },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new InputError('Unable to reach the Douyin service. Please retry.', 502);
  }
  if (response.status >= 300 && response.status < 400) {
    await cancel(response);
    throw new InputError('The Douyin information service returned an unexpected redirect.', 502);
  }
  if (!response.ok) {
    await cancel(response);
    if (response.status === 422) throw new InputError('The Douyin link could not be parsed.', 422);
    if (response.status === 401 || response.status === 403) throw new InputError('The Douyin service rejected its Worker credential.', 502);
    throw new InputError('The Douyin information service returned HTTP ' + response.status + '.', 502);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    await cancel(response);
    throw new InputError('The Douyin service returned an unexpected response.', 502);
  }
  let body: ArrayBuffer;
  try { body = await readBounded(response.body, MAX_INFO_BYTES); }
  catch { throw new InputError('The Douyin information response exceeded the supported size.', 502); }
  try { return JSON.parse(new TextDecoder().decode(body)) as unknown; }
  catch { throw new InputError('The Douyin service returned invalid JSON.', 502); }
}

async function requestDownload(origin: string, key: string, link: string, workspaceOrigin: string): Promise<Response> {
  let url = apiUrl(origin, 'download', link);
  let response: Response;
  for (let redirects = 0; ; redirects++) {
    try {
      response = await fetch(url, {
        headers: redirects === 0
          ? { 'X-Api-Key': key, Accept: 'video/mp4, application/zip, application/octet-stream' }
          : { Accept: 'video/mp4, application/zip, application/octet-stream' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10 * 60_000),
      });
    } catch {
      throw new InputError('Unable to download this Douyin video. Please retry.', 502);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    await cancel(response);
    if (!location || redirects >= REDIRECT_LIMIT) throw new InputError('The Douyin download returned too many redirects.', 502);
    try { url = new URL(location, url); }
    catch { throw new InputError('The Douyin download returned an invalid redirect.', 502); }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new InputError('The Douyin download redirected to an insecure address.', 502);
    }
  }
  if (response.status !== 200) {
    await cancel(response);
    if (response.status === 422) throw new InputError('The Douyin link could not be parsed.', 422);
    if (response.status === 401 || response.status === 403) throw new InputError('The Douyin service rejected its Worker credential.', 502);
    throw new InputError('The Douyin download service returned HTTP ' + response.status + '.', 502);
  }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  if (!['video/mp4', 'application/zip', 'application/octet-stream'].includes(contentType)) {
    await cancel(response);
    throw new InputError('The Douyin service did not return a video or photo archive.', 502);
  }
  const lengthHeader = response.headers.get('content-length');
  const length = lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
  if (lengthHeader !== null && (length === null || !Number.isSafeInteger(length) || length > MAX_DOWNLOAD_BYTES)) {
    await cancel(response);
    throw new InputError('The Douyin download exceeds the 500 MB limit.', 413);
  }
  const filename = contentType === 'application/zip' ? 'douyin-photos.zip' : 'douyin-video.mp4';
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': 'attachment; filename="' + filename + '"',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Origin': workspaceOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'X-Douyin-Title, X-Douyin-Author, Content-Disposition',
    'Accept-Ranges': 'none',
    Vary: 'Origin',
  });
  if (length !== null) headers.set('Content-Length', String(length));
  for (const name of ['x-douyin-title', 'x-douyin-author']) {
    const value = response.headers.get(name)?.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200);
    if (value) headers.set(name, value);
  }
  return new Response(boundedFileStream(response.body, MAX_DOWNLOAD_BYTES, length ?? undefined), { status: 200, headers });
}

export async function routeDouyin(request: Request, env: DouyinEnv, origin: string): Promise<Response> {
  const url = new URL(request.url);
  if (!['/v1/tools/douyin/info', '/v1/tools/douyin/download'].includes(url.pathname)) {
    throw new InputError('Endpoint not found', 404);
  }
  if (request.method !== 'GET') throw new InputError('Method not allowed', 405);
  const { origin: upstreamOrigin, key } = getConfig(env);
  const link = parseLink(request);
  if (url.pathname.endsWith('/info')) {
    const info = await requestInfo(upstreamOrigin, key, link);
    return new Response(JSON.stringify(info), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
      },
    });
  }
  return requestDownload(upstreamOrigin, key, link, origin);
}
