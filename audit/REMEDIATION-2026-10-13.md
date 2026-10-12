# Audit remediation status — partial

The request to fix every audit item is **not complete**. No production deployment,
DNS changes, Cloudflare configuration changes, mail sending, or Git push occurred.

## Independently completed

- **A14:** Fixed both reported frontend TypeScript errors: the Markdown loop now
  gives TypeScript a valid control-flow path, and obsolete NotesView props are removed.
- **A14:** Added `pnpm check` and GitHub Actions checks for shared-package generation,
  both Worker typechecks, frontend typechecking, existing retention tests and the
  frontend production build. CI publishes a dependency advisory report separately;
  unresolved advisories are not represented as fixed.
- **A19:** Tailwind `dark:` utilities now follow the same `.dark` class as the
  application toggle and CSS variables.
- **A20 (partial):** Added Cloudflare Pages static response headers for MIME sniffing,
  referrers, framing, browser permissions and HTTPS, plus no-store for HTML routes.
  Worker download Range/cache changes remain unfinished.

## Validation

`pnpm check` completed successfully on 2026-10-13. It includes all listed typechecks,
the existing retention regression suite, 25 additional regression cases, the static
Astro production build, and generation of both Worker editor artifacts.
These checks do not establish that the remaining security or data-loss findings
have been fixed. CI itself has not yet run on the remote repository.

Backend tests use real route/SQL code with SQLite and isolated R2 fixtures. UI tests
exercise real component handlers with deterministic hooks/timers; these are not
authenticated browser acceptance tests or production load tests.

## Second pass: conservative, independently compatible fixes

No frontend service-layer files were modified in this pass. Existing request/response
contracts and administrator authentication remain compatible. No new external
permissions, accounts or secrets were introduced, and no cloud operation was executed.

| Finding | Current state |
| --- | --- |
| A01 | Single-tab note changes are backed up in session storage, saves cannot overlap, switching notes waits for successful saving, and changing tabs keeps the editor mounted. Recovered drafts require review before saving. Cross-device/database revision protection remains open. |
| A02 | Added a 15-minute cleanup handler and repository Cron configuration. Exact recorded expired keys are cleaned in bounded batches; permanent active files are excluded. Not yet deployed. |
| A03 | Uploads reserve a D1 row before R2 writes; failed uploads remain tracked for cleanup. File deletion no longer swallows R2 failures. Scratchpad image cleanup checks current references and no longer deletes the old image before a successful metadata update. Historical unindexed objects still need a separate reconciliation exercise. |
| A04 | Both mail paths use a bounded, forward-only HTML-to-text scanner; malformed-tag and Unicode-offset cases are tested. |
| A05 | New SVG attachments are rejected; legacy SVG is not served as an active document. Raster responses use attachment, sandbox CSP and nosniff. |
| A07 | Capacity is reserved by one conditional INSERT, counts pending/expired objects until cleanup, and uses actual request bytes rather than Content-Length. |
| A09 | File totals now come from the full accounting query, not the first 50 rows. Pagination and server-backed browsing/search remain open. |
| A10 | Schema initialization is coalesced and cached for the D1 binding within an isolate. Warm reads perform no DDL; failed initialization is retried. This is a conservative interim fix, not a versioned migration system. |
| A11 | Request bodies are bounded before JSON/multipart parsing. File uploads are capped at 10 MiB; mail ingestion/preview at 5 MiB; text validation uses UTF-8 bytes. Full note-list response optimization remains open. |
| A12 | Incoming raw bytes are bounded, schema checks occur before object storage, and compensation checks for an existing database reference. Mailbox-wide quotas, delivery deduplication and complete uncertain-failure reconciliation remain open. |
| A13 | Parsed RFC From is used for display and Reply-To is preferred when replying. |
| A14 | `build:all` now builds the frontend and regenerates both Worker artifacts; new regression tests are included in CI's `pnpm check`. |
| A16 | Late mail responses cannot overwrite the latest selection. Scratchpad save failure preserves the pending image. Image URLs change with their stored key and prohibit caching. Other upload/dialog and authentication-recovery UX remains open. |
| A17 | Invalid forms or missing content return an error instead of clearing scratchpad data. |
| A20 | Private API/download responses prohibit caching, use nosniff, and download filenames have an RFC 5987 UTF-8 parameter. Range/HEAD support remains open. |
| Origin validation | Authenticated writes with a foreign Origin are rejected before database/storage access. Browser-cookie/edge-policy validation is still needed. |

### Deployment notes

- Existing tables are preserved. The only new table is `scratchpad_cleanup`, created
  with `IF NOT EXISTS`; no column migration or database reset is performed.
- Expired bytes remain reserved until physical deletion succeeds. A backlog can
  temporarily prevent uploads; cleanup deliberately processes small batches.
- Replaced/cleared scratchpad images have a one-hour cleanup grace period, and
  objects still referenced by the current scratchpad are retained.
- The source Cron configuration must be applied during a future release. Pasting
  generated JavaScript into the Dashboard does not configure Cron Triggers.
- Existing messages above 5 MiB are preserved but not previewed. This conservative
  limit should be reviewed against actual usage before production rollout.
- Both editor artifacts are now generated from TypeScript by the same build script,
  removing the independent handwritten mail-worker deployment path.

## Why the remaining work is not applied

Automatic content review blocked a batch of frontend service-layer modifications
without giving a specific reason. The blocked operation was not retried or bypassed.
The earlier dependent, incomplete backend/contracts/migration/package changes were copied
to `audit/2026-10-13-incomplete-hardening/` and removed from the active source tree.
That directory is a local draft, is excluded from this commit, and must not be deployed.

The table above supersedes the first-pass open-item list. A06 (Projects persistence),
A08 (end-to-end send idempotency), A15 (dependency upgrades), A18 (DMARC), the stated
partial items, authenticated browser acceptance and recovery testing remain open.
The blocked service-layer batch was not retried, split up or reimplemented by another
route; independent compatible fixes were developed and tested separately.

The earlier audit report and local evidence remain available in `audit/2026-10-12/`.
