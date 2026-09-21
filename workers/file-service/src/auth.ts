import type { AuthContext } from '@rachg/shared';

/**
 * Extensible Authentication resolver.
 * Supports:
 * 1. Cloudflare Access JWT / Headers (Cf-Access-Authenticated-User-Email)
 * 2. Personal Bearer Token (Authorization: Bearer <token>)
 * 3. File Owner Delete Token (X-Delete-Token / query param)
 * 4. Anonymous fallback
 */
export function resolveAuth(request: Request, envSecret?: string): AuthContext {
  // 1. Cloudflare Access header
  const cfAccessEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (cfAccessEmail) {
    return {
      userId: cfAccessEmail,
      userEmail: cfAccessEmail,
      authType: 'cf_access',
    };
  }

  // 2. Personal Bearer Token
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (envSecret && token === envSecret) {
      return {
        userId: 'admin',
        authType: 'bearer',
      };
    }
  }

  // 3. Fallback to anonymous
  return {
    authType: 'anonymous',
  };
}

/**
 * Verify whether caller can delete or modify a file.
 * Returns true if caller is admin OR provided deleteToken matches.
 */
export function canManageFile(
  auth: AuthContext,
  providedDeleteToken: string | null,
  fileDeleteToken: string
): boolean {
  if (auth.authType === 'bearer' || auth.authType === 'cf_access') {
    return true; // Admin or Access-verified user
  }
  if (!providedDeleteToken) return false;
  return providedDeleteToken === fileDeleteToken;
}
