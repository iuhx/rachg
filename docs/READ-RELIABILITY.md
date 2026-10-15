# Notes / Files read reliability

Updated 2026-10-15.

## Observations and limits of the diagnosis

The reported error is `Loading notes timed out. Please retry.`. Files is also
affected, while Mail can load. Three read-only production D1 inventory queries
succeeded: three notes, approximately 123 KB of content, SQL durations below
1 ms. This does not establish the timing of an affected browser request.
Live tail observation was unavailable because the diagnostic WebSocket handshake
timed out. A specific production root cause has not yet been established.

## Changes

- Notes pagination and Files listing use the same GET-only read helper.
- It retries one transient network, timeout, response-body interruption or
  HTTP 408/500/502/503/504 failure. It never retries writes.
- The first attempt retains its 30-second allowance; both attempts and the
  500 ms retry delay fit within a maximum 45-second page budget. A second attempt
  after a full first timeout gets at most 14.5 seconds.
- JSON body consumption is inside the attempt. Receiving headers alone is not
  considered a complete read.
- Login redirects and 401/403 remain authentication failures and are not retried.
  Network errors in Files are no longer reported as expired authentication.
- Access public-key retrieval has a five-second timeout covering the response
  body. Failure returns a temporary 503, without accepting an unverified token
  or requiring a still-valid administrator session to be replaced.
- Successful keys keep the existing five-minute cache; failed retrievals are
  not cached. Signature, issuer, audience, expiry and administrator checks remain.
- Files listing and Notes export return `Server-Timing` for authentication and
  database/read work. It is exposed to the authenticated frontend for diagnosis.
- Workers Logs persistence is enabled, with automatic invocation logs disabled.
  These two reads log their start, authentication result, completion timings or
  failure status, without note contents, tokens or request headers in these
  diagnostic messages. Other pre-existing application logs retain their own
  behavior; this is not a claim that every existing log has been sanitized.
- Timeout messages distinguish waiting for response headers from a stalled
  response body. A validated Server-Timing header is included when available.

## Recurrence observed later on 2026-10-15

The user reported another timeout, with a successful manual Retry. The first
normal reload captured after enabling log persistence showed Files authentication
at 47 ms and read work at 944 ms. The Notes event sequence was incomplete, so it
does not establish the failed request's root cause. Initial public probes also
took several seconds. Network instability, authentication and database wait
must still be distinguished using a failed request's complete trace.

Enabling diagnostics is not a root-cause fix. The page/attempt timeouts were not
extended again during this investigation, and no data or authentication policy
was changed.

## Verification

Regression tests cover recovery after the original request times out, response
body interruption, complete paginated results, bounded retries, non-retried
authentication failures and writes, failing/slow JWKS, and invalid signatures.
`pnpm check` includes `pnpm test:auth` and the existing workerd runtime suite.

For a future recurrence, record the Network request status, duration and
Server-Timing fields for `/v1/notes/export` and `/v1/files`, plus the same-time
Worker log. A fast Worker read with a slow browser request points to a different
stage than a high `auth` or `read` duration. Do not infer data loss from a timeout.
