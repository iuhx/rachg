import { API_CONNECT_URL } from '../config/api';

export class AuthenticationRequiredError extends Error {
  readonly loginUrl = API_CONNECT_URL;
  constructor() {
    super('Authentication required. Complete Cloudflare Access sign-in to continue.');
    this.name = 'AuthenticationRequiredError';
  }
}

/** GET only: retry one interrupted read, including its body, never a mutation. */
export async function readApiJson<T>(url: string, resource: string): Promise<T> {
  const deadline = Date.now() + 45_000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Loading ${resource} timed out. Please retry.`);
    let response: Response;
    let data: any;
    try {
      response = await fetch(url, {
        credentials: 'include', redirect: 'manual', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(Math.min(30_000, remaining)),
      });
      if (response.type === 'opaqueredirect' || response.redirected || [301, 302, 303, 307, 308, 401, 403].includes(response.status)) {
        void response.body?.cancel().catch(() => {});
        throw new AuthenticationRequiredError();
      }
      if (attempt === 0 && [408, 500, 502, 503, 504].includes(response.status)) {
        void response.body?.cancel().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      // Keep body consumption inside the attempt: a successful header response
      // does not mean the JSON reached the browser in full.
      try { data = await response.json(); }
      catch (error) {
        // Edge failures can return HTML. Preserve their HTTP status instead of
        // presenting a temporary upstream error as a login problem.
        if (error instanceof SyntaxError && !response.ok) data = null;
        else throw error;
      }
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) throw error;
      if (error instanceof SyntaxError) throw new Error(`${resource} could not be loaded. Reconnect your workspace and try again.`);
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new Error(`Loading ${resource} timed out. Please retry.`);
      }
      throw new Error(`Unable to reach the ${resource} service. Please retry.`);
    }
    if (!response.ok) throw new Error(data?.error || `Unable to load ${resource} (HTTP ${response.status})`);
    return data as T;
  }
  throw new Error(`Unable to load ${resource}. Please retry.`);
}
