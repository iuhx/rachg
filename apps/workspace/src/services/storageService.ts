import type { WebdavSettings } from '@rachg/shared';
import { API_BASE_URL } from '../config/api';
import { AuthenticationRequiredError } from './fileService';

async function request(method: string, body?: unknown): Promise<WebdavSettings> {
  const response = await fetch(`${API_BASE_URL}/v1/storage/webdav`, {
    method, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(40_000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.type === 'opaqueredirect' || response.redirected || [301,302,401,403].includes(response.status)) throw new AuthenticationRequiredError();
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error || 'Unable to configure InfiniCLOUD. Please retry.');
  const config = result.settings;
  if (!config || typeof config.baseUrl !== 'string' || typeof config.username !== 'string' || typeof config.configured !== 'boolean' || typeof config.canConfigure !== 'boolean' || !Number.isSafeInteger(config.revision)) throw new Error('Invalid storage settings response.');
  return config;
}
export const fetchWebdavSettings = () => request('GET');
export const testWebdavConnection = () => request('POST');
export const saveWebdavSettings = (username: string, password: string, revision: number) => request('PUT', { username, password, revision });
