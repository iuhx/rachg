import type { WebdavSettings } from '@rachg/shared';
import { API_BASE_URL } from '../config/api';
import { AuthenticationRequiredError } from './fileService';

async function request(method: 'GET' | 'POST', signal?: AbortSignal): Promise<WebdavSettings> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException('Request cancelled', 'AbortError')); };
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error('Storage request timed out. Retry or reconnect your workspace.')); }, method === 'GET' ? 8000 : 35_000);
  });
  try {
    return await Promise.race([(async () => {
      // An empty request needs no Content-Type header or unnecessary preflight.
      const response = await fetch(`${API_BASE_URL}/v1/storage/webdav`, {
        method, credentials: 'include', redirect: 'manual', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (response.type === 'opaqueredirect' || response.redirected || [301,302,303,307,308,401,403].includes(response.status)) throw new AuthenticationRequiredError();
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Unable to check InfiniCLOUD. Reconnect and retry.');
      const config = result.settings;
      if (!config || typeof config.baseUrl !== 'string' || typeof config.configured !== 'boolean' || config.source !== 'worker-secrets') throw new Error('Invalid storage response. Refresh after deployment completes.');
      return config as WebdavSettings;
    })(), cancelled]);
  } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
}
export const fetchWebdavSettings = (signal?: AbortSignal) => request('GET', signal);
export const testWebdavConnection = (signal?: AbortSignal) => request('POST', signal);
