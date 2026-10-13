# Note categories and pins

Notes keeps its list/editor layout and adds a category filter with note counts.
**Manage categories** creates, renames and deletes one-level categories. A note
belongs to one category, or **Uncategorized**. Category names support 1–40
characters; names are normalized with NFKC and compared case-insensitively. There
can be up to 50 categories.

The Uncategorized filter appears only when it contains notes. Moving or deleting
its last note returns the filter to All notes. The note's category selector always
keeps Uncategorized available as a destination.

Select a note's category above its content to move it, and use **Pin note** to put
it first in the current list. Pinned notes sort first, then by last body update.
Search matches title and content. Within a category, select **This category** or
**All notes** for the search scope; an empty search retains the selected category.
New notes created from Notes inherit the selected category. Global and Tools
creation use Uncategorized.

Deleting a category moves its notes to Uncategorized and preserves their content,
pin state and share links. It does not delete notes. Category changes wait for an
open draft to save; failed saves keep the draft visible. A search that hides the
selected note keeps its open editor visible until editing ends.

JSON backups and the `notes.json` inside Markdown ZIPs preserve category names and
pins. Older backups remain supported. See [Import/export](NOTE-IMPORT-EXPORT.md).

## Storage and API

The original `notes` rows remain intact. Two additive tables store categories and
note organization, with a category index. Old notes without an organization row
read as Uncategorized, unpinned, revision 0. Normal startup creates the tables;
there is no manual data rewrite or destructive migration.

- `GET /v1/note-categories`: list `{id,name,revision}` categories.
- `POST /v1/note-categories`: create `{id: UUIDv4,name}`; same-ID retries are safe.
- `PUT /v1/note-categories/:id`: rename with `{name,revision}`.
- `DELETE /v1/note-categories/:id`: delete with `{revision}`.
- `PUT /v1/notes/:id/organization`: update `{categoryId: UUIDv4|null,pinned,revision}`.
- `POST /v1/notes`: accepts optional `categoryId` for atomic creation in a category.

All routes retain administrator JWT and write-Origin checks. Stale metadata
writes return 409 and can be refreshed without overwriting a body draft. Category
deletion atomically clears associations and increments their revisions before
deleting the category. Imports atomically create the note and its metadata, and
never reset classification on an exact duplicate or retry. Body saves and
organization responses merge independently in the client. Public share snapshots
contain only the shared title and content; categories and pins stay private.

## Verification

`pnpm check` includes old-schema upgrades, category deletion and rollback, invalid
names, uniqueness, limits, stale writes, auth/Origin rejection, backup round trips,
duplicates/retries, pin ordering and search, and draft preservation on failed saves.
The release bundle also runs in workerd against actual local D1, including
concurrent classified imports and note creation/deletion with foreign keys.
