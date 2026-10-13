# System Health

The home card replaces Project overview and sits beside the latest five activity
items. It refreshes on opening Home, manually, and every five minutes while the
page is visible. The three rows use one refresh control and check timestamp.
A registry outage does not hide a working Worker check. Failed refreshes mark
retained domain data as cached and clear the green status and old response time.

- **Worker**: authenticated `GET /v1/system-health` against the live API. A response
  means that the API is reachable, not that every Cloudflare product is operational.
  The response time measures the complete status request, including dependency
  checks; it is not pure network latency. Login pages and redirects fail the check.
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

Pages checks, commit/build information and Worker version monitoring are removed.
The old static build-info endpoint and version-metadata binding are also removed.

## Configuration and security

No Cloudflare management API token, registrar credential, or new public bypass is
required. `/v1/system-health` uses the existing administrator JWT protection.
All registry requests use a fixed HTTPS host/path, reject redirects, forward no
cookies or authentication, time out after five seconds, and bound response size.
No database migration or new storage resource is needed.

## Verification

`tests/system-health.test.cjs` covers unauthorized requests, fixed request targets,
credential isolation, actual quota accounting, no R2 writes, partial failures,
registry cache expiry, malformed/login responses, and stale UI status. The release
bundle also exercises the route in workerd with real local D1/R2 bindings.
