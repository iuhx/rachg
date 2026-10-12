# Projects

Projects is a simple private list of goals and their progress. Sign in, open
**Projects**, click **New Project**, enter a name and click **Save project**.
The command palette's **New Project** action opens the same editor.

## Daily use

- Add an optional short summary, details and an HTTP(S) project link.
- Choose **Planning**, **In Progress**, **Completed** or **Archived** in the editor
  or directly on a card. Archived projects remain available in All and Archived.
- Search names, summaries and details, or filter by status. Use **Edit** to read
  the complete details and update them; cards show a short preview.
- Use **Refresh** to load changes made elsewhere. Returning to Projects also reloads
  the saved list, while an open editor keeps its current draft.
- **Delete** asks for confirmation and removes only the project record. It does not
  delete files, notes or mail. Deletion has no undo; use Archived to keep the record.

A workspace holds at most **200 projects**. Names are required and limited to
120 characters; summaries to 200 characters; details to **10,000 UTF-8 bytes**;
links to 2,048 characters. Links cannot contain embedded usernames or passwords.
This feature does not introduce attachments, subtasks or public project sharing.

## Save and conflict behavior

Changes persist only after Save succeeds. Failed saves retain the editor input.
Closing a changed editor asks before discarding, and leaving the browser page warns
about unsaved input. Drafts are held in memory, not durable browser storage.

Create retries reuse one UUID while that editor remains open, preventing duplicate
projects when a save response is lost. Edits and deletes send the saved revision;
the server rejects stale operations with HTTP 409 instead of overwriting newer work.
If this happens, copy any draft you want to keep, close the editor, refresh the list,
then reopen the latest project and reapply the changes. A lost update response can
also produce a conflict on retry; refreshing shows the saved outcome.

## API and storage

All routes run behind the existing administrator Access JWT and Origin checks:

| Route | Request / result |
| --- | --- |
| `GET /v1/projects` | All projects (bounded at 200), newest updated first |
| `GET /v1/projects/:id` | One project |
| `POST /v1/projects` | UUIDv4 `id`, `name`, `tagline`, `description`, `status`, `externalUrl` |
| `PUT /v1/projects/:id` | All editable fields plus the current `revision` |
| `DELETE /v1/projects/:id` | JSON body containing the current `revision` |

Optional UI fields are sent as empty strings. Responses use the shared Project
contract and private/no-store headers. Request bodies and field sizes are bounded;
database values are parameterized. Project text is rendered as text, not HTML.

Projects use an additive `workspace_projects` table in the existing D1 binding.
The Worker creates it and its update-time index on the first authenticated project
request, caches successful initialization and retries failed setup. Existing tables
and R2 objects are unaffected. The 200-record cap is enforced atomically in D1.

## Release and verification

Release the **file-service Worker first**, then the **workspace frontend**, from the
same revision. Both are needed for this feature to work online. Existing D1 bindings
and Access permissions are sufficient; no new secret or manual database reset is
required. Frontend build/dev scripts, Wrangler's custom build and the Worker artifact
builder compile the shared package before using its runtime constants.

Validation on 2026-10-13:

- `pnpm check`: all typechecks, retention tests, **90 regression tests**, production
  frontend/Worker builds and **7 workerd integration scenarios** passed (8 Node test
  records including their parent).
- Projects tests cover CRUD, authentication, Origin, invalid fields/links, duplicate
  creates, conflicting edits/deletes, capacity races, schema retry, retained drafts,
  repeated submit, search/filter and shared workspace state.
- A browser harness using the actual project components, API client and generated
  Worker with isolated local D1 verified create, reload persistence, edit, status
  changes, search/filter, deletion and draft discard confirmation. Desktop and 375px
  layouts were checked; the browser reported no errors or warnings.
- Dependency audit found no known vulnerabilities.
- Frontend build succeeded with the shared build output removed; Wrangler's
  `deploy --dry-run` also compiled and bundled the Worker successfully without deploying.

These checks use local test data; they do not confirm a production deployment.
