import { API_BASE_URL } from '../config/api';
import { FILE_UPLOAD_BYTES } from '@rachg/shared';
import { AuthenticationRequiredError } from './apiRead';

export async function fetchDouyinInfo(link: string, signal?: AbortSignal): Promise<unknown> {
  const url = new URL('/v1/tools/douyin/info', API_BASE_URL);
  url.searchParams.set('url', link);
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(45_000);
    response = await fetch(url, {
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Unable to reach the Douyin download service. Please retry.');
  }
  if (response.type === 'opaqueredirect' || response.redirected || [301, 302, 303, 307, 308, 401, 403].includes(response.status)) {
    void response.body?.cancel().catch(() => {});
    throw new AuthenticationRequiredError();
  }
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to read Douyin video information (HTTP ' + response.status + ').');
  return body;
}

export function douyinDownloadUrl(link: string): string {
  const url = new URL('/v1/tools/douyin/download', API_BASE_URL);
  url.searchParams.set('url', link);
  return url.toString();
}

function safeFileName(title: string, extension: string): string {
  const base = title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 120);
  return `${base || 'douyin-video'}.${extension}`;
}

export async function fetchDouyinFile(link: string, title: string, signal?: AbortSignal): Promise<File> {
  const url = new URL(douyinDownloadUrl(link));
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(10 * 60_000);
    response = await fetch(url, {
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
      headers: { Accept: 'video/mp4, application/zip, application/octet-stream' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Unable to reach the Douyin download service. Please retry.');
  }
  if (response.type === 'opaqueredirect' || response.redirected || [301, 302, 303, 307, 308, 401, 403].includes(response.status)) {
    void response.body?.cancel().catch(() => {});
    throw new AuthenticationRequiredError();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof body?.error === 'string' ? body.error : `Douyin download failed (HTTP ${response.status}).`);
  }

  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || 'application/octet-stream';
  if (!['video/mp4', 'application/zip', 'application/octet-stream'].includes(mime)) {
    void response.body?.cancel().catch(() => {});
    throw new Error('The Douyin service did not return a video or photo archive.');
  }
  const lengthHeader = response.headers.get('content-length');
  const expectedLength = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
  if (lengthHeader && (!Number.isSafeInteger(expectedLength) || expectedLength! > FILE_UPLOAD_BYTES)) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Files can store items up to 99 MB. Use Download to save this larger video to your device.');
  }

  if (!response.body) throw new Error('The Douyin service returned an empty file.');
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > FILE_UPLOAD_BYTES) {
        await reader.cancel();
        throw new Error('Files can store items up to 99 MB. Use Download to save this larger video to your device.');
      }
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  if (expectedLength !== null && size !== expectedLength) throw new Error('The Douyin download was incomplete. Please retry.');

  const extension = mime === 'application/zip' ? 'photos.zip' : 'mp4';
  const filename = safeFileName(title, extension);
  return new File(chunks, filename, { type: mime });
}
