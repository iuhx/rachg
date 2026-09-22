export interface AccessIdentity {
  email?: string;
  name?: string;
  userId?: string;
}

const ACCESS_TEAM_DOMAIN = 'https://rachg.cloudflareaccess.com';

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
  // Start authentication on the protected workspace origin so Access returns
  // to the page the user is looking at and refreshes the workspace cookie.
  const url = new URL('/cdn-cgi/access/login', window.location.origin);
  url.searchParams.set('redirect_url', returnTo);
  return url.toString();
}

export function getAccessLogoutUrl(returnTo = `${window.location.origin}/cdn-cgi/access/login`): string {
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
