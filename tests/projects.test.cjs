const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label, elements } = require('./component-fixture.cjs');
const input = (overrides = {}) => ({ name: 'Workspace project', tagline: 'A useful goal', description: '第一步\nSecond step', status: 'Planning', externalUrl: '', ...overrides });
const project = (overrides = {}) => ({ ...input(), id: crypto.randomUUID(), revision: 1, createdTimestamp: 1, updatedTimestamp: 1, updatedAt: new Date(1).toISOString(), ...overrides });
const request = (f, path, method, body, headers = {}) => f.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
const create = (f, overrides = {}) => request(f, '/v1/projects', 'POST', { ...input(), id: crypto.randomUUID(), ...overrides });
async function withFixture(fn) { const f = fixture(); try { await fn(f); } finally { await f.close(); } }
const flush = () => new Promise(resolve => setImmediate(resolve));
const field = (h, name) => find(h, n => n.props['aria-label'] === name);
const button = (h, text) => find(h, n => n.type === 'button' && label(n) === text);

test('projects persist in D1 and support complete CRUD with revisions', () => withFixture(async f => {
  const response = await create(f, { externalUrl: 'https://example.com' }); assert.equal(response.status, 201);
  const saved = (await response.json()).project;
  assert.equal(saved.externalUrl, 'https://example.com/'); assert.equal(saved.revision, 1);
  assert.equal((await (await f.request('/v1/projects')).json()).projects[0].description, '第一步\nSecond step');
  assert.equal((await (await f.request(`/v1/projects/${saved.id}`)).json()).project.name, saved.name);
  const updated = await request(f, `/v1/projects/${saved.id}`, 'PUT', { ...input({ status: 'Completed' }), revision: 1 });
  assert.equal(updated.status, 200); const next = (await updated.json()).project;
  assert.equal(next.revision, 2); assert.equal(next.status, 'Completed'); assert.ok(next.updatedTimestamp > saved.updatedTimestamp);
  assert.equal((await request(f, `/v1/projects/${saved.id}`, 'DELETE', { revision: 2 })).status, 200);
  assert.equal((await (await f.request('/v1/projects')).json()).projects.length, 0);
  assert.equal((await request(f, `/v1/projects/${saved.id}`, 'DELETE', { revision: 2 })).status, 200);
  assert.equal(f.objects.size, 0);
}));

test('retrying the same create cannot duplicate a project or silently replace different content', () => withFixture(async f => {
  const id = crypto.randomUUID();
  const responses = await Promise.all([create(f, { id }), create(f, { id })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM workspace_projects').get().n, 1);
  assert.equal((await create(f, { id, name: 'Changed after uncertain response' })).status, 409);
  assert.equal(f.sqlite.prepare('SELECT name FROM workspace_projects').get().name, 'Workspace project');
}));

test('competing edits and stale deletes cannot overwrite a newer project', () => withFixture(async f => {
  const saved = (await (await create(f)).json()).project;
  const responses = await Promise.all(['one', 'two'].map(name => request(f, `/v1/projects/${saved.id}`, 'PUT', { ...input({ name }), revision: 1 })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await request(f, `/v1/projects/${saved.id}`, 'DELETE', { revision: 1 })).status, 409);
  assert.equal(f.sqlite.prepare('SELECT revision FROM workspace_projects').get().revision, 2);
}));

test('project mutations require existing admin authentication and a trusted Origin', () => withFixture(async f => {
  const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input(), id: crypto.randomUUID() }) };
  assert.equal((await f.worker.fetch(new Request('https://fixture.invalid/v1/projects', options), f.env, f.ctx)).status, 401);
  assert.equal(f.queries.length, 0);
  assert.equal((await create(f)).status, 201);
  const queries = f.queries.length;
  assert.equal((await request(f, '/v1/projects', 'POST', { ...input(), id: crypto.randomUUID() }, { Origin: 'https://bad.invalid' })).status, 403);
  assert.equal(f.queries.length, queries);
}));

test('invalid project fields and unsafe URLs are rejected before database access', () => withFixture(async f => {
  for (const overrides of [{ name: ' ' }, { name: 'x'.repeat(121) }, { tagline: 'x'.repeat(201) }, { status: 'unknown' },
    { description: '字'.repeat(3334) }, { externalUrl: 'javascript:alert(1)' }, { externalUrl: 'data:text/html,test' },
    { externalUrl: 'https://user:password@example.invalid' }, { id: 'not-a-uuid' }]) {
    assert.equal((await create(f, overrides)).status, 400);
  }
  assert.equal(f.queries.length, 0);
}));

test('the bounded project list cannot lose rows through concurrent capacity checks', () => withFixture(async f => {
  const saved = (await (await create(f)).json()).project;
  for (let i = 0; i < 198; i++) f.sqlite.prepare('INSERT INTO workspace_projects SELECT ?,name,tagline,description,status,external_url,created_at,updated_at,revision FROM workspace_projects WHERE id=?').run(crypto.randomUUID(), saved.id);
  const responses = await Promise.all([create(f), create(f)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  const list = await (await f.request('/v1/projects')).json(); assert.equal(list.projects.length, 200); assert.equal(list.limit, 200);
}));

test('failed project schema setup is retried and project deletion does not touch file storage', () => withFixture(async f => {
  f.hooks.failSql = sql => /idx_workspace_projects/.test(sql);
  assert.equal((await f.request('/v1/projects')).status, 500);
  f.hooks.failSql = null;
  const saved = (await (await create(f)).json()).project;
  await f.upload(100);
  await request(f, `/v1/projects/${saved.id}`, 'DELETE', { revision: 1 });
  assert.equal(f.objects.size, 1); assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM files').get().n, 1);
}));

test('project editor validates input and preserves it on save failure without duplicate calls', async () => {
  const f = components(), { ProjectEditor } = f.load('apps/workspace/src/components/ProjectEditor.tsx');
  let calls = 0, closed = false, reject;
  const h = f.mount(ProjectEditor, { isActive: true, onSave: () => { calls++; return new Promise((_, fail) => reject = fail); }, onClose() { closed = true; } });
  const submit = () => find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await submit(); h.render(); assert.equal(calls, 0); assert.equal(closed, false);
  field(h, 'Project name').props.onChange({ target: { value: 'Keep this draft' } }); h.render();
  const a = submit(), b = submit(); assert.equal(calls, 1);
  reject(new Error('Database unavailable')); await Promise.all([a, b]); h.render();
  assert.equal(field(h, 'Project name').props.value, 'Keep this draft'); assert.match(label(h.tree), /Database unavailable/); assert.equal(closed, false);
  button(h, 'Cancel').props.onClick(); h.render(); assert.equal(find(h, n => n.type?.name === 'ConfirmDialog').props.isOpen, true); h.unmount();
});

test('project search and status filters work without network calls', () => {
  const f = components(), { ProjectsView } = f.load('apps/workspace/src/components/ProjectsView.tsx');
  const a = project({ name: 'Website' }), b = project({ name: 'Books', status: 'Completed', description: 'Reading list' });
  const h = f.mount(ProjectsView, { projects: [a, b], isActive: true, canManage: true, isLoading: false, isSaving: false, error: '', createRequest: 0, onRefresh() {}, onSave: async () => {}, onDelete: async () => {} });
  field(h, 'Search projects').props.onChange({ target: { value: 'reading' } }); h.render();
  assert.equal(elements(h.tree).filter(n => n.type === 'article').length, 1); assert.match(label(h.tree), /Books/);
  find(h, n => n.type === 'button' && label(n).startsWith('Planning')).props.onClick(); h.render();
  assert.equal(elements(h.tree).filter(n => n.type === 'article').length, 0); assert.match(label(h.tree), /No matching projects/); h.unmount();
});

test('a global creation request keeps one stable ID until the editor closes', () => {
  const f = components(), { ProjectsView } = f.load('apps/workspace/src/components/ProjectsView.tsx');
  const props = { projects: [], isActive: true, canManage: true, isLoading: false, isSaving: false, error: '', createRequest: 1, onRefresh() {}, onSave: async () => {}, onDelete: async () => {} };
  const h = f.mount(ProjectsView, props); const editor = find(h, n => n.type?.name === 'ProjectEditor'); const key = editor.key;
  props.createRequest = 2; h.render(); assert.equal(find(h, n => n.type?.name === 'ProjectEditor').key, key);
  find(h, n => n.type?.name === 'ProjectEditor').props.onClose(); h.render();
  assert.equal(elements(h.tree).some(n => n.type?.name === 'ProjectEditor'), false); h.unmount();
});

test('project API client sends stable IDs/revisions and rejects malformed or failed responses', async t => {
  const f = components(), api = f.load('apps/workspace/src/services/projectService.ts');
  let captured, response = Response.json({ success: true, project: project() });
  t.mock.method(globalThis, 'fetch', async (url, options) => { captured = { url, options }; return response; });
  const id = crypto.randomUUID(); await api.saveProject(id, input());
  assert.equal(captured.options.credentials, 'include'); assert.equal(JSON.parse(captured.options.body).id, id);
  response = Response.json({ success: true, project: project({ id, revision: 2 }) }); await api.saveProject(id, input(), 1);
  assert.equal(captured.options.method, 'PUT'); assert.equal(JSON.parse(captured.options.body).revision, 1);
  response = Response.json({ success: false, error: 'Changed elsewhere' }, { status: 409 });
  await assert.rejects(api.saveProject(id, input(), 1), /Changed elsewhere/);
  response = new Response('<html>Login</html>'); await assert.rejects(api.fetchProjects(), /invalid project response/);
});

test('workspace project saves update shared data and returning to the tab refreshes the list', async () => {
  const f = components(); let loads = 0;
  f.services.accessService.getAccessIdentity = async () => ({ email: 'admin@example.invalid' });
  f.services.fileService.fetchActiveFiles = f.services.noteService.fetchNotes = f.services.mailService.fetchMail = f.services.mailService.fetchSentMail = async () => [];
  const saved = project(); f.services.projectService.fetchProjects = async () => { loads++; return [saved]; };
  f.services.projectService.saveProject = async (_id, payload) => ({ ...saved, ...payload, revision: 2 });
  f.services.projectService.deleteProject = async () => {};
  const { WorkspaceApp } = f.load('apps/workspace/src/components/WorkspaceApp.tsx'); const h = f.mount(WorkspaceApp, {});
  await flush(); h.render();
  const navigate = tab => { find(h, n => n.type?.name === 'Sidebar').props.onTabChange(tab); h.render(); };
  const props = () => find(h, n => n.type?.name === 'ProjectsView').props;
  navigate('projects'); await flush(); h.render(); assert.equal(props().projects[0].id, saved.id);
  await props().onSave(saved.id, input({ name: 'Changed' }), 1); h.render(); assert.equal(props().projects[0].name, 'Changed');
  assert.equal(find(h, n => n.type?.name === 'CommandPalette').props.projects[0].name, 'Changed');
  navigate('files'); navigate('projects'); await flush(); h.render(); assert.equal(loads, 2);
  await props().onDelete(saved); h.render(); assert.equal(props().projects.length, 0); h.unmount();
});
