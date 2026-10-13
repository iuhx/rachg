import type { SystemHealth } from '@rachg/shared';
import { API_BASE_URL } from '../config/api';

export interface HealthCheck<T> { data: T | null; error: string | null; checkedAt: number; latencyMs: number | null }
export type HealthSnapshot = HealthCheck<SystemHealth>;
const timestamp = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000_000;
const size = (value: unknown) => value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);

async function check<T>(url: string, validate: (value: any) => boolean, signal?: AbortSignal): Promise<HealthCheck<T>> {
  const start = performance.now();
  try {
    const timeout = AbortSignal.timeout(12_000);
    const response = await fetch(url, { credentials: 'include', redirect: 'manual', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (response.type === 'opaqueredirect' || response.redirected || [301, 302, 303, 307, 308, 401, 403].includes(response.status)) throw new Error('Sign in again to check this service.');
    if (!response.ok) throw new Error(`Check failed (HTTP ${response.status}).`);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The service did not return status data.');
    const data = await response.json();
    if (!validate(data)) throw new Error('The service returned incomplete status data.');
    return { data, error: null, checkedAt: Date.now(), latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unable to reach this service.', checkedAt: Date.now(), latencyMs: null };
  }
}

export function fetchSystemHealth(signal?: AbortSignal): Promise<HealthSnapshot> {
  return check<SystemHealth>(`${API_BASE_URL}/v1/system-health`, value => value?.service === 'rachg-system-health' && timestamp(value.checkedAt)
      && value.worker?.status === 'reachable'
      && ['available', 'unavailable'].includes(value.storage?.status) && value.storage?.quotaScope === 'files'
      && [value.storage.usedBytes, value.storage.limitBytes, value.storage.availableBytes].every(size)
      && (value.storage.status !== 'available' || [value.storage.usedBytes, value.storage.limitBytes, value.storage.availableBytes].every(item => item !== null))
      && value.domain?.name === 'rachg.com' && ['current', 'stale', 'unavailable'].includes(value.domain.status)
      && (value.domain.expiresAt === null || timestamp(value.domain.expiresAt)) && (value.domain.checkedAt === null || timestamp(value.domain.checkedAt)), signal);
}
