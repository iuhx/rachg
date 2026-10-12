# Audit remediation status — 2026-10-13

Latest functional follow-up: [71-test review and fixes](FOLLOWUP-2026-10-13.md).

The verified changes are ready for Git submission on `fix/audit-hardening`.
This report describes the current implementation, replacing the earlier intermediate
status lists. It does **not** claim that every original audit item is complete.
No production Worker, DNS, Access policy or real user data was changed during testing.
The final chat reports the actual Git push result.

## Verified changes

| Finding | Current implementation |
| --- | --- |
| A01 — note drafts | Session draft backups, serialized saves within one tab, save-before-switch, preserved editor on navigation and manual review of recovered drafts. Cross-tab/device revision conflicts remain unresolved. |
| A02/A03 — storage lifecycle | Atomic upload reservations, exact-key cleanup, retryable deletion and byte accounting until physical cleanup succeeds. Cleanup atomically claims candidates before deleting, so an upload completed after selection is preserved. |
| A03 — scratchpad attachments | Old images remain until metadata commits; replaced/orphaned images have a one-hour cleanup grace period and current references are checked. |
| A04 — mail parsing | Bounded forward-only HTML-to-text scan replaces the quadratic conversion path; malformed tags and Unicode offsets are tested. |
| A05 — active attachments | New SVG attachments are rejected. Legacy SVG is not served as an active document; raster responses use attachment, sandbox CSP and nosniff. |
| A06 — temporary projects | New-project creation is disabled, including submission from the command palette. The UI explains that saving is unavailable and points to Notes. Projects persistence has not been implemented. |
| A07 — quota races | A conditional D1 INSERT reserves capacity before R2 writes, using measured body bytes and counting pending/expired/purging objects until cleanup. |
| A08 — outgoing mail | A 15-second provider timeout; explicit `unknown` outcomes for ambiguous responses; accepted messages return success even if status persistence fails. Only the database status write is retried, never the provider send. End-to-end idempotency remains open. |
| A09 — totals | File usage totals include all accounted rows, independent of the first page. Full browsing/search pagination remains open. |
| A10 — repeated schema setup | Initialization is coalesced and cached per binding/isolate; failed initialization is retried. Versioned migrations remain open. |
| A11 — byte limits | Bodies are bounded before JSON/multipart/MIME parsing; file uploads are limited to 10 MiB, mail to 5 MiB and text fields use UTF-8 byte limits. Full note-list payload optimization remains open. |
| A12 — incoming mail | Content/recipient SHA-256 deduplication, atomic reservations and an additive byte ledger. Each attempt uses a distinct R2 key. Mail indexing and reservation completion commit in one D1 batch only while that exact reservation remains pending. |
| A13 — sender identity | Display uses parsed RFC From; replies prefer Reply-To. |
| A14 — verification/build | Frontend type errors corrected; `pnpm check` runs all typechecks, regressions, production build, generated Worker artifacts and local workerd integration. GitHub Actions uses the same command. |
| A15 — dependencies | Astro, Wrangler, Worker types and compatible dependencies updated; patched transitive versions pinned. Registry audit reports zero known vulnerabilities; CI rejects high-severity advisories. |
| A16 — asynchronous UI | Late mail-detail responses cannot replace newer selections. Upload dialogs await completion, prevent repeated submission and retain input on failure. Deletion dialogs remain open on failure. |
| A17 — malformed scratchpad input | Missing/invalid content is rejected instead of clearing saved content. |
| A19 — theme | Tailwind dark utilities follow the application's `.dark` class. |
| A20 — responses/downloads | Static security headers; private API/download no-store and nosniff; UTF-8 filenames; GET single/suffix byte ranges, HEAD, 416 and If-Range handling. |
| Origin checks | Authenticated writes with a foreign Origin are rejected before storage access; existing Access signature/admin checks remain in place. |

The homepage no longer renders or fetches the scratchpad. It displays local date/time,
the current week, recent notes/mail activity and expiry reminders among recent files.
No weather API, geolocation, external feed or new secret is required.

## Reliability verification

Completed locally on 2026-10-13:

- `pnpm check`: shared build, both Worker typechecks, frontend typecheck, existing
  retention tests, **43 regression tests**, Astro production build, regenerated Worker
  editor artifacts and **4 workerd integration scenarios** (5 Node test records including
  their parent). All passed.
- `pnpm audit --audit-level high`: **zero known vulnerabilities**.
- `git diff --check`: passed.

The integration test executes the generated file-service release artifact in the
Cloudflare workerd runtime with real local D1 and R2 bindings. It uses freshly generated
RSA keys and an isolated mock JWKS endpoint; all other outbound fetches are rejected.
It verifies valid admin access and rejection of forged/expired/wrong-user tokens,
Unicode note CRUD, foreign-Origin rejection, multipart file upload, byte/suffix ranges,
HEAD, expiry, exact-key deletion and competing storage reservations.

Failure tests cover cleanup before/after upload activation, retryable physical deletion,
late incoming deliveries and newer retries, transactional mail-index rollback, accepted
outgoing mail followed by transient/persistent database failure, ambiguous network
results, and explicit provider rejection. A full cold cleanup batch uses 48 storage
calls, leaving room within the conservative 50-call budget.

UI tests execute real handlers with deterministic hooks/timers. The earlier homepage
browser preview had no console errors, but it had no authenticated production data.
These checks are not a production load test, authenticated browser acceptance test or
backup-recovery drill. Remote CI has not run until the commits are pushed.

## Operational limits and remaining work

- **Multiple editors:** simultaneous edits to the same note from different tabs/devices
  still use last-write-wins. The single-tab queue does not provide database revisions.
- **Outgoing retries:** a browser losing the response after provider acceptance can
  still create a duplicate if the user submits again. Check the provider before retrying
  an unconfirmed send. If both status writes fail, the local row remains `sending`;
  the accepted provider ID is retained in Worker logs for manual reconciliation.
- **Scale:** lists remain bounded (50 files, 100 inbox/sent messages, 200 notes), with
  no complete pagination/search. Notes still include full bodies; large collections
  require payload optimization before substantial growth.
- **Legacy storage:** historical unindexed objects and old mail byte inventory are
  not backfilled or bulk-deleted. Existing large mail is retained but cannot be previewed
  above the 5 MiB limit.
- **Incoming quotas:** defaults are 1 GiB of newly tracked mail, 5,000 indexed messages
  and 200 new receipts/hour. Pending failed deliveries continue consuming capacity
  until reconciliation; forwarding/notification delivery is not guaranteed by this ledger.
- **Cleanup:** each invocation handles up to 5 transfers, 3 scratchpad keys and 2 mail
  receipts. Backlogs can temporarily prevent uploads while reserved bytes await cleanup.
- **Production:** DMARC, deployed Access configuration, Cron activation and authenticated
  acceptance/recovery checks remain outstanding. No production deployment was requested
  in the latest instruction or performed in this pass.

Existing tables and data are preserved. `scratchpad_cleanup` and `mail_ingestions` are
additive `IF NOT EXISTS` tables; statuses are stored as text. Deploy both Workers from
the same revision. The file-service's 15-minute Cron configuration must be applied at
release time; pasting editor JavaScript alone does not configure Cron Triggers.

## Previously blocked operation

Automatic content review rejected a frontend service-layer modification batch without
providing a specific reason. It was not retried, split or reimplemented by another route.
No `apps/workspace/src/services/*` files were modified in the conservative follow-up.
The incomplete drafts in `audit/2026-10-13-incomplete-hardening/` remain local-only,
are excluded from commits, and must not be deployed. The original audit and local
validation evidence remain in `audit/2026-10-12/`.
