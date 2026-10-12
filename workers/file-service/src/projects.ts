import { PROJECT_LIMITS, PROJECT_STATUSES, type Project, type ProjectInput } from '@rachg/shared';
import { boundedJson, InputError, utf8Size } from '../../common/content';

interface ProjectRecord {
  id: string; name: string; tagline: string; description: string; status: ProjectInput['status'];
  external_url: string; created_at: number; updated_at: number; revision: number;
}
const ready = new WeakMap<D1Database, Promise<void>>();

// Initialized only by project routes; existing storage cleanup keeps its call budget.
async function ensureProjects(db: D1Database) {
  let pending = ready.get(db);
  if (!pending) {
    pending = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS workspace_projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Planning'
          CHECK(status IN ('Planning','In Progress','Completed','Archived')),
        external_url TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_workspace_projects_updated ON workspace_projects(updated_at DESC, id DESC)').run();
    })().catch(error => { ready.delete(db); throw error; });
    ready.set(db, pending);
  }
  await pending;
}

function mapProject(row: ProjectRecord): Project {
  return { id: row.id, name: row.name, tagline: row.tagline, description: row.description,
    status: row.status, externalUrl: row.external_url, revision: row.revision,
    createdTimestamp: row.created_at, updatedTimestamp: row.updated_at,
    updatedAt: new Date(row.updated_at).toISOString() };
}

function parseInput(value: Record<string, unknown>): ProjectInput {
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > PROJECT_LIMITS.name ||
      typeof value.tagline !== 'string' || value.tagline.length > PROJECT_LIMITS.tagline ||
      typeof value.description !== 'string' || utf8Size(value.description) > PROJECT_LIMITS.descriptionBytes ||
      !PROJECT_STATUSES.includes(value.status as ProjectInput['status']) ||
      typeof value.externalUrl !== 'string' || value.externalUrl.length > PROJECT_LIMITS.externalUrl) {
    throw new InputError('Provide a project name, valid status and fields within the size limits.');
  }
  let externalUrl = value.externalUrl.trim();
  if (externalUrl) {
    let parsed: URL;
    try { parsed = new URL(externalUrl); } catch { throw new InputError('Use a complete http:// or https:// project link.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new InputError('Use an HTTP(S) link without embedded credentials.');
    externalUrl = parsed.href;
    if (externalUrl.length > PROJECT_LIMITS.externalUrl) throw new InputError('The project link is too long.');
  }
  return { name: value.name.trim(), tagline: value.tagline.trim(), description: value.description,
    status: value.status as ProjectInput['status'], externalUrl };
}

const revisionOf = (body: Record<string, unknown>) => {
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new InputError('A valid project revision is required. Refresh the project and try again.');
  return body.revision as number;
};
const sameInput = (row: ProjectRecord, value: ProjectInput) => row.name === value.name && row.tagline === value.tagline && row.description === value.description && row.status === value.status && row.external_url === value.externalUrl;

/** Called only after the Worker's existing Access and Origin checks. */
export async function routeProjects(request: Request, db: D1Database): Promise<{ status: number; body: unknown }> {
  const pathname = new URL(request.url).pathname;
  const detail = /^\/v1\/projects\/([a-zA-Z0-9_-]+)$/.exec(pathname);
  const id = detail?.[1];
  if (!id && pathname !== '/v1/projects') throw new InputError('Project route not found', 404);
  const method = request.method;
  if (!['GET', ...(id ? ['PUT', 'DELETE'] : ['POST'])].includes(method)) throw new InputError('Method not allowed', 405);

  let body: Record<string, unknown> = {};
  let input: ProjectInput | undefined;
  let revision = 0;
  if (method !== 'GET') {
    const value = await boundedJson(request);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected a project object.');
    body = value as Record<string, unknown>;
    if (method !== 'DELETE') input = parseInput(body);
    if (id) revision = revisionOf(body);
    else if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) throw new InputError('A stable project creation ID is required.');
  }
  await ensureProjects(db);
  if (method === 'GET' && !id) {
    const result = await db.prepare('SELECT * FROM workspace_projects ORDER BY updated_at DESC, id DESC LIMIT ?').bind(PROJECT_LIMITS.count).all<ProjectRecord>();
    return { status: 200, body: { success: true, projects: result.results.map(mapProject), limit: PROJECT_LIMITS.count } };
  }
  if (method === 'GET') {
    const row = await db.prepare('SELECT * FROM workspace_projects WHERE id=?').bind(id).first<ProjectRecord>();
    if (!row) throw new InputError('Project not found', 404);
    return { status: 200, body: { success: true, project: mapProject(row) } };
  }
  if (method === 'POST') {
    const value = input!;
    const timestamp = Date.now();
    const row = await db.prepare(`INSERT OR IGNORE INTO workspace_projects
      (id,name,tagline,description,status,external_url,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM workspace_projects) < ? RETURNING *`)
      .bind(body.id, value.name, value.tagline, value.description, value.status, value.externalUrl, timestamp, timestamp, PROJECT_LIMITS.count).first<ProjectRecord>();
    if (row) return { status: 201, body: { success: true, project: mapProject(row) } };
    const existing = await db.prepare('SELECT * FROM workspace_projects WHERE id=?').bind(body.id).first<ProjectRecord>();
    if (existing && sameInput(existing, value)) return { status: 200, body: { success: true, project: mapProject(existing) } };
    throw new InputError(existing ? 'This creation already succeeded with different content. Refresh Projects before editing it.' : `Your workspace has reached ${PROJECT_LIMITS.count} projects. Remove an unused project first.`, 409);
  }
  if (method === 'PUT') {
    const value = input!;
    const row = await db.prepare(`UPDATE workspace_projects SET name=?,tagline=?,description=?,status=?,external_url=?,
      updated_at=MAX(updated_at+1,?),revision=revision+1 WHERE id=? AND revision=? RETURNING *`)
      .bind(value.name, value.tagline, value.description, value.status, value.externalUrl, Date.now(), id, revision).first<ProjectRecord>();
    if (row) return { status: 200, body: { success: true, project: mapProject(row) } };
  } else {
    const deleted = await db.prepare('DELETE FROM workspace_projects WHERE id=? AND revision=? RETURNING id').bind(id, revision).first();
    if (deleted) return { status: 200, body: { success: true, id } };
  }
  const exists = await db.prepare('SELECT id FROM workspace_projects WHERE id=?').bind(id).first();
  if (!exists && method === 'DELETE') return { status: 200, body: { success: true, id } };
  if (!exists) throw new InputError('Project not found. It may have been deleted elsewhere.', 404);
  throw new InputError('This project changed elsewhere. Your edits are kept. Close this form, refresh Projects and reopen the latest version before saving or deleting.', 409);
}
