import type { APIRoute } from 'astro';
import type { PagesBuildInfo } from '@rachg/shared';

// Astro emits this file during the build. Only explicitly selected public
// metadata is published; no environment object or credential is serialized.
export const GET: APIRoute = () => {
  const commit = process.env.CF_PAGES_COMMIT_SHA;
  const info: PagesBuildInfo = {
    service: 'rachg-workspace', buildTimestamp: Date.now(),
    commit: commit && /^[a-f0-9]{40}$/i.test(commit) ? commit : null,
    branch: process.env.CF_PAGES_BRANCH?.slice(0, 100) || null,
  };
  return Response.json(info);
};
