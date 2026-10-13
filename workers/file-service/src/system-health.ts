import type { SystemHealth } from '@rachg/shared';
import { InputError, readBounded } from '../../common/content';
import { getActiveStorageUsage } from './quota';

interface HealthEnv {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  MAX_STORAGE_BYTES?: string;
}

const RDAP_URL = 'https://rdap.verisign.com/com/v1/domain/rachg.com';
const DAY = 86_400_000;
let domainCache: SystemHealth['domain'] | undefined;
let retryAt = 0;
let domainPending: Promise<SystemHealth['domain']> | undefined;

/** Registry data is public. Cache only the expiry, never WHOIS contact details. */
async function domainExpiry(): Promise<SystemHealth['domain']> {
  if (domainCache && Date.now() < retryAt) return domainCache;
  if (domainPending) return domainPending;
  domainPending = (async () => {
    try {
      // Fixed HTTPS origin, no forwarded cookies/JWTs and no caller-supplied URL.
      const response = await fetch(RDAP_URL, { headers: { Accept: 'application/rdap+json, application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Registry unavailable');
      const data = JSON.parse(new TextDecoder().decode(await readBounded(response.body, 128_000))) as { ldhName?: string; events?: { eventAction?: string; eventDate?: string }[] };
      const expiration = data.events?.find(event => event.eventAction === 'expiration')?.eventDate;
      const expiresAt = typeof expiration === 'string' ? Date.parse(expiration) : NaN;
      if (data.ldhName?.toLowerCase() !== 'rachg.com' || !Number.isFinite(expiresAt) || expiresAt <= 0) throw new Error('Registry expiry missing');
      domainCache = { name: 'rachg.com', expiresAt, checkedAt: Date.now(), status: 'current' };
      retryAt = Date.now() + DAY;
    } catch {
      const recent = domainCache?.checkedAt && Date.now() - domainCache.checkedAt < 7 * DAY;
      domainCache = recent ? { ...domainCache!, status: 'stale' }
        : { name: 'rachg.com', expiresAt: null, checkedAt: null, status: 'unavailable' };
      retryAt = Date.now() + 5 * 60_000;
    }
    return domainCache;
  })();
  try { return await domainPending; } finally { domainPending = undefined; }
}

/** Called only behind the existing administrator Access check. No management token needed. */
export async function systemHealth(request: Request, env: HealthEnv): Promise<SystemHealth> {
  if (request.method !== 'GET') throw new InputError('Method not allowed', 405);
  const [usage, bucket, domain] = await Promise.allSettled([
    getActiveStorageUsage(env.DB),
    // A missing object still proves that the R2 binding accepts reads. Never writes.
    env.FILES_BUCKET.head('__workspace_health_probe__'),
    domainExpiry(),
  ]);
  const usedBytes = usage.status === 'fulfilled' && Number.isSafeInteger(usage.value) && usage.value >= 0 ? usage.value : null;
  const configuredLimit = Number(env.MAX_STORAGE_BYTES ?? 4 * 1024 ** 3);
  const limitBytes = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : null;
  return {
    service: 'rachg-system-health', checkedAt: Date.now(),
    worker: { status: 'reachable' },
    storage: {
      status: bucket.status === 'fulfilled' && usedBytes !== null && limitBytes !== null ? 'available' : 'unavailable',
      usedBytes, limitBytes, availableBytes: usedBytes !== null && limitBytes !== null ? Math.max(0, limitBytes - usedBytes) : null,
      quotaScope: 'files',
    },
    domain: domain.status === 'fulfilled' ? domain.value : { name: 'rachg.com', expiresAt: null, checkedAt: null, status: 'unavailable' },
  };
}
