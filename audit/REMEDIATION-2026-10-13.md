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

`pnpm check` completed successfully on 2026-10-13. It included all listed typechecks,
the existing retention regression suite, and a static Astro production build.
These checks do not establish that the remaining security or data-loss findings
have been fixed. CI itself has not yet run on the remote repository.

## Why the remaining work is not applied

Automatic content review blocked a batch of frontend service-layer modifications
without giving a specific reason. The blocked operation was not retried or bypassed.
The dependent, incomplete backend/contracts/migration/package changes were copied
to `audit/2026-10-13-incomplete-hardening/` and removed from the active source tree.
That directory is a local draft, is excluded from this commit, and must not be deployed.

A01–A13, A15–A18, and the unfinished parts of A14/A20 remain open. Dependency upgrades
were not installed. Authentication changes, production configuration checks,
DMARC setup, authenticated browser acceptance and restore testing remain open.

The earlier audit report and local evidence remain available in `audit/2026-10-12/`.
