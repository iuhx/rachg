import type { AuthContext } from '@rachg/shared';

interface AccessClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  preferred_username?: unknown;
  exp?: unknown;
  nbf?: unknown;
}

interface AccessJwk extends JsonWebKey {
  kid?: string;
}

interface AccessJwks {
  keys?: AccessJwk[];
}

export interface AccessAuthEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  ACCESS_ADMIN_EMAIL?: string;
}

const jwksCache = new Map<string, { expiresAt: number; keys: AccessJwk[] }>();
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeTeamDomain(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function audienceMatches(aud: unknown, expected: string): boolean {
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}

async function getAccessKeys(teamDomain: string): Promise<AccessJwk[]> {
  const cached = jwksCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Access JWKS request failed with HTTP ${response.status}`);

  const body = (await response.json()) as AccessJwks;
  const keys = body.keys?.filter((key) => key.kty === 'RSA' && key.n && key.e) ?? [];
  if (keys.length === 0) throw new Error('Access JWKS did not contain RSA keys');

  jwksCache.set(teamDomain, { expiresAt: Date.now() + JWKS_CACHE_TTL_MS, keys });
  return keys;
}

async function verifyAccessJwt(token: string, env: AccessAuthEnv): Promise<AccessClaims> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN ? normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN) : '';
  const audience = env.ACCESS_AUDIENCE?.trim();
  if (!teamDomain || !audience || !env.ACCESS_ADMIN_EMAIL?.trim()) {
    throw new Error('Cloudflare Access authentication is not configured');
  }

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed Access JWT');

  const header = decodeJson<{ alg?: unknown; kid?: unknown }>(parts[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Unsupported Access JWT header');
  }

  const claims = decodeJson<AccessClaims>(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  const issuer = teamDomain;
  if (claims.iss !== issuer || !audienceMatches(claims.aud, audience)) {
    throw new Error('Access JWT issuer or audience mismatch');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('Access JWT expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now) throw new Error('Access JWT not active');

  const email = typeof claims.email === 'string'
    ? claims.email
    : typeof claims.preferred_username === 'string'
      ? claims.preferred_username
      : '';
  if (!email || email.toLowerCase() !== env.ACCESS_ADMIN_EMAIL.trim().toLowerCase()) {
    throw new Error('Access JWT user is not the administrator');
  }

  const key = (await getAccessKeys(teamDomain)).find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error('Access JWT key id not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error('Access JWT signature is invalid');

  return claims;
}

/** Authenticate with Cloudflare Access JWT; the forgeable email header is ignored. */
export async function resolveAuth(request: Request, env: AccessAuthEnv): Promise<AuthContext> {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) return { authType: 'anonymous' };

  let claims: AccessClaims;
  try {
    claims = await verifyAccessJwt(assertion, env);
  } catch (error) {
    // Treat malformed, expired, non-admin, and unverifiable assertions alike.
    // This keeps every private route at 401 without leaking verification details.
    console.warn('Cloudflare Access assertion rejected:', error);
    return { authType: 'anonymous' };
  }
  const email = typeof claims.email === 'string'
    ? claims.email
    : typeof claims.preferred_username === 'string'
      ? claims.preferred_username
      : undefined;

  return {
    userId: typeof claims.sub === 'string' ? claims.sub : email,
    userEmail: email,
    authType: 'cf_access',
  };
}

export function isAuthenticated(auth: AuthContext): boolean {
  return auth.authType === 'cf_access';
}
