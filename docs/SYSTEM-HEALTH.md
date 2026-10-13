# System Health

The home card replaces Project overview and sits beside the latest five activity
items. It refreshes on opening Home, manually, and every five minutes while the
page is visible. Each dependency has its own result; a registry outage does not
hide a working Pages or Worker check. Failed refreshes mark retained metadata as
last known rather than keeping a green status.

- **Pages**: authenticated, uncached same-origin request to `/build-info.json`.
  The response must contain the workspace service marker and valid build metadata;
  Access login pages and redirects are failures, not healthy results.
- **Worker**: authenticated `GET /v1/system-health` against the live API. A response
  means that the API is reachable, not that every Cloudflare product is operational.
- **R2**: a read-only HEAD of a fixed probe key checks the bucket binding. No object
  is created. Remaining space is the existing **file upload quota**, calculated
  from D1 using the same accounting as upload admission. It includes expired and
  pending uploads until cleaned up, excludes mail storage, and is not the entire
  bucket size or Cloudflare's free-tier allowance. R2 itself is pay-as-you-go.
- **Domain**: `rachg.com` expiration from Verisign's official `.com` RDAP endpoint.
  This is the registry expiration, which can differ from a registrar's billing or
  renewal deadline. Results are cached for 24 hours per warm Worker isolate. On
  failure, at most seven-day-old values are explicitly stale; failures retry after
  five minutes. Contact data is never returned or logged.
- **Current deployment**: the build timestamp and commit of the Pages artifact
  currently being served, plus the live Worker's version ID and version creation
  timestamp from Cloudflare's native version-metadata binding. These are explicitly
  labeled build/version times, **not Cloudflare deployment-completion timestamps**.

## Configuration and security

No Cloudflare management API token, registrar credential, or new public bypass is
required. `/v1/system-health` uses the existing administrator JWT protection.
All registry requests use a fixed HTTPS host/path, reject redirects, forward no
cookies or authentication, time out after five seconds, and bound response size.
The static Pages endpoint emits only an allowlist of build metadata and uses the
same Access protection as the site. `public/_headers` disables browser caching.

Wrangler binds `CF_VERSION_METADATA`; Pages provides `CF_PAGES_COMMIT_SHA` and
`CF_PAGES_BRANCH` during builds. Local builds omit unavailable commit metadata.
No database migration or new storage resource is needed.

## Verification

`tests/system-health.test.cjs` covers unauthorized requests, fixed request targets,
credential isolation, actual quota accounting, no R2 writes, partial failures,
registry cache expiry, malformed/login responses, and stale UI status. The release
bundle also exercises the route in workerd with real local D1/R2 bindings.
