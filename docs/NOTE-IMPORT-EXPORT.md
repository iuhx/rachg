# Note import and export

In Notes, **Import** accepts one or more `.md`, `.markdown`, `.txt`, or `.json`
files. Markdown and TXT use the filename as the title and keep the complete file
as content. JSON accepts a rachg version-1/version-2 backup or an array of objects with
`title` and `content` fields, including older local recovery backups.

Files are parsed and previewed in the browser before any write. Confirm Import to
create new private notes. The server skips exact title-and-content duplicates,
including notes outside the currently displayed list. A matching title with
different content creates a separate note. Existing notes are never overwritten;
backup IDs, timestamps and sharing permissions are not restored. Version-2 backups
also preserve category names and pin states. Categories match by normalized,
case-insensitive name, and missing categories are created (up to 50 total).
Exact duplicates and retries keep the existing note's current category and pin.
An import requiring a new category at the limit stops without creating that note;
completed notes remain saved. Empty categories are not included in note backups.

Import progress is recorded after each confirmed response. An interrupted batch
can continue with **Import remaining**. Stable random IDs make retries safe when a
response is lost. Re-importing a backup also skips exact duplicates. **Stop after
current note** pauses the batch; it does not roll back already imported notes.

The download icon beside Edit/Share exports that saved note as Markdown. Save any
pending or recovered draft first. **Export all** downloads either:

- **JSON backup**: exact titles/content, categories and pins with an export timestamp and informational
  modification times. This is the recommended restore format.
- **Markdown ZIP**: one Markdown file per note and `notes.json`. Filenames are
  sanitized and numbered to avoid collisions. Extract and import `notes.json` to
  preserve exact titles, categories and pins. Individual Markdown/TXT files import
  as unpinned, Uncategorized notes. Import the JSON or the Markdown files, not both.

Both the Notes list and all-note export read authenticated pages of 10 notes until
complete, so imports beyond 200 notes remain visible after reloading. A failed page
produces no partial download. Smaller pages bound Worker memory usage for large notes.
Transfers support up to 1,000 notes and 20 MB of input/JSON backup data, and 1,000,000 UTF-8
bytes per note. Encoded import requests must fit the existing 2 MiB request limit.
The Markdown ZIP includes both Markdown and JSON copies and may be larger.
Markdown exports contain saved content without adding a duplicate heading. Titles
that cannot be used as filenames are preserved exactly in the JSON backup.

## API and security

- `GET /v1/notes/export?after=<last-id>` returns `notes` and `nextCursor` (or null).
- `POST /v1/notes/import` accepts `{id,title,content,categoryName?,pinned?}` where the ID is a newly
  generated `import-<UUIDv4>`, and returns `{success,note,imported}`.
- Both endpoints retain administrator Access authentication; writes retain Origin
  validation and bounded JSON parsing. These endpoints do not create public shares.
- Imported text uses the existing safe Markdown preview. File/archive parsing does
  not execute HTML, load remote images, or follow links.
- The existing `notes` table gets a title index for duplicate detection. No notes
  or other data are deleted as part of deployment.

## Retired scratchpad

The old frontend service, shared types, API routes, R2 helpers, table initialization
and scheduled image cleanup have been removed. Authenticated requests to its old
routes now return 404; anonymous requests still require Access.

At the owner's request, the historical `scratchpad` and `scratchpad_cleanup`
tables were permanently removed on 2026-10-13. The `scratchpad/` R2 prefix was
checked and contained no objects. Active Notes, Files and Mail data were unchanged.
The one-time SQL is recorded in
`workers/file-service/scripts/remove-retired-scratchpad.sql`; ordinary deployments
do not recreate these tables or run this cleanup.

## Checks

`pnpm check` covers paginated export beyond 200 notes, Unicode/Markdown round trips,
ZIP extraction, duplicate/concurrent/retried imports, saved-edit protection,
authentication, limits, partial UI progress, and retired-route isolation.
