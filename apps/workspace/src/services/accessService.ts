export interface AccessIdentity {
  email?: string;
  name?: string;
  userId?: string;
}

const ACCESS_TEAM_DOMAIN = import.meta.env.PUBLIC_ACCESS_TEAM_DOMAIN || 'https://haenl.cloudflareaccess.com';
const API_BASE_URL = import.meta.env.PUBLIC_FILE_SERVICE_URL || 'https://files.rachg.com';

function normalizeIdentity(payload: unknown): AccessIdentity | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const nested = source.user && typeof source.user === 'object' ? source.user as Record<string, unknown> : source;
  const email = typeof nested.email === 'string' ? nested.email : typeof nested.user_email === 'string' ? nested.user_email : undefined;
  const name = typeof nested.name === 'string' ? nested.name : undefined;
  const userId = typeof nested.id === 'string' ? nested.id : typeof nested.sub === 'string' ? nested.sub : undefined;
  return email || name || userId ? { email, name, userId } : null;
}

export async function getAccessIdentity(): Promise<AccessIdentity | null> {
  const response = await fetch('/cdn-cgi/access/get-identity', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) return null;
  return normalizeIdentity(await response.json().catch(() => null));
}

export function getAccessLoginUrl(returnTo = window.location.href): string {
  const url = new URL('/cdn-cgi/access/login', API_BASE_URL);
  url.searchParams.set('redirect_url', returnTo);
  return url.toString();
}

export function getAccessLogoutUrl(returnTo = window.location.origin): string {
  const url = new URL('/cdn-cgi/access/logout', ACCESS_TEAM_DOMAIN);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}

export function startAccessLogin(): void {
  window.location.assign(getAccessLoginUrl());
}

export function startAccessLogout(): void {
  window.location.assign(getAccessLogoutUrl());
}
