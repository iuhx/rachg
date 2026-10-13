const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label, elements } = require('./component-fixture.cjs');
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const withFixture = fn => async () => { const f = fixture(); try { await fn(f); } finally { await f.close(); } };
const createCategory = async (f, name = 'Work') => {
  const id = crypto.randomUUID(), response = await f.request('/v1/note-categories', json('POST', { id, name }));
  assert.equal(response.status, 200);
  return (await response.json()).categories.find(c => c.id === id);
};
const createNote = async (f, extra = {}) => {
  const response = await f.request('/v1/notes', json('POST', { title: 'Example', content: 'Keep this content', ...extra }));
  assert.equal(response.status, 201); return (await response.json()).note;
};
const organize = (f, note, categoryId, pinned = true, revision = note.organizationRevision) => f.request(`/v1/notes/${note.id}/organization`, json('PUT', { categoryId, pinned, revision }));

test('old plain notes migrate without body changes; category deletion preserves pins and invalidates stale writers', withFixture(async f => {
  f.sqlite.exec("CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL); INSERT INTO notes VALUES('legacy','Old title','Original content',1,2)");
  const old = (await (await f.request('/v1/notes/legacy')).json()).note;
  assert.equal(old.categoryId, null); assert.equal(old.pinned, false); assert.equal(old.organizationRevision, 0);
  const category = await createCategory(f);
  const note = (await (await organize(f, old, category.id)).json()).note;
  assert.equal(note.content, old.content); assert.equal(note.updatedTimestamp, 2); assert.equal(note.organizationRevision, 1);
  assert.equal((await organize(f, old, null)).status, 409);
  const renamed = await f.request(`/v1/note-categories/${category.id}`, json('PUT', { name: 'Projects', revision: 1 }));
  assert.equal(renamed.status, 200);
  assert.equal((await f.request(`/v1/note-categories/${category.id}`, json('DELETE', { revision: 1 }))).status, 409);
  assert.equal((await (await f.request('/v1/notes/legacy')).json()).note.categoryId, category.id);
  const removed = await f.request(`/v1/note-categories/${category.id}`, json('DELETE', { revision: 2 }));
  assert.equal(removed.status, 200);
  const after = (await (await f.request('/v1/notes/legacy')).json()).note;
  assert.equal(after.categoryId, null); assert.equal(after.pinned, true); assert.equal(after.content, old.content); assert.equal(after.organizationRevision, 2);
  assert.equal((await organize(f, note, null, false)).status, 409);
  assert.equal((await organize(f, after, category.id)).status, 409);
}));

test('category APIs reject unauthorized requests, invalid names, duplicate normalized names and stale updates', withFixture(async f => {
  const category = await createCategory(f, 'Ｗｏｒｋ');
  assert.equal(category.name, 'Work');
  for (const route of ['/v1/note-categories', `/v1/note-categories/${category.id}`, '/v1/notes/a/organization']) {
    assert.equal((await f.worker.fetch(new Request(`https://fixture.invalid${route}`), f.env, f.ctx)).status, 401);
    assert.equal((await f.request(route, { ...json('PUT', {}), headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.invalid' } })).status, 403);
  }
  assert.equal((await f.request('/v1/note-categories', json('POST', { id: crypto.randomUUID(), name: 'work' }))).status, 409);
  assert.equal((await f.request('/v1/note-categories', json('POST', { id: category.id, name: 'Work' }))).status, 200);
  for (const name of ['', 'x'.repeat(41), 'a\nb', 1]) assert.equal((await f.request('/v1/note-categories', json('POST', { id: crypto.randomUUID(), name }))).status, 400);
  const note = await createNote(f, { categoryId: category.id });
  const edited = await f.request(`/v1/notes/${note.id}`, json('PUT', { title: 'Edited', content: 'New body', categoryId: null, pinned: true }));
  assert.equal((await edited.json()).note.categoryId, category.id);
  assert.equal((await f.request('/v1/notes', json('POST', { title: 'No orphan', content: '', categoryId: crypto.randomUUID() }))).status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notes').get().n, 1);
  await f.request(`/v1/notes/${note.id}`, { method: 'DELETE' });
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_organization').get().n, 0);
}));

test('category delete and categorized note creation roll back completely on storage failure', withFixture(async f => {
  const category = await createCategory(f), note = await createNote(f, { categoryId: category.id });
  f.hooks.failSql = sql => sql.startsWith('DELETE FROM note_categories');
  assert.equal((await f.request(`/v1/note-categories/${category.id}`, json('DELETE', { revision: 1 }))).status, 500);
  assert.equal(f.sqlite.prepare('SELECT category_id FROM note_organization').get().category_id, category.id);
  f.hooks.failSql = sql => sql.includes('INSERT INTO note_organization');
  assert.equal((await f.request('/v1/notes', json('POST', { title: 'Rollback', content: 'No partial note', categoryId: category.id }))).status, 500);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notes').get().n, 1);
  assert.equal((await (await f.request(`/v1/notes/${note.id}`)).json()).note.content, note.content);
}));

test('category limit prevents orphan imports while backups preserve categories and pins without reclassifying duplicates', withFixture(async f => {
  const input = { id: `import-${crypto.randomUUID()}`, title: 'Backup', content: 'Saved', categoryName: 'Learning', pinned: true };
  const first = (await (await f.request('/v1/notes/import', json('POST', input))).json()).note;
  assert.equal(first.categoryName, 'Learning'); assert.equal(first.pinned, true);
  const exportPage = await (await f.request('/v1/notes/export')).json();
  const c = components(), utility = c.load('apps/workspace/src/utils/noteTransfer.ts');
  const restored = await utility.parseNoteFiles([new File([utility.noteBackup(exportPage.notes)], 'notes.json')]);
  assert.equal(restored[0].categoryName, 'Learning'); assert.equal(restored[0].pinned, true);
  const edited = (await (await organize(f, first, null, false)).json()).note;
  for (const body of [input, { ...restored[0], categoryName: 'Do not create' }]) {
    const retried = await (await f.request('/v1/notes/import', json('POST', body))).json();
    assert.equal(retried.imported, false); assert.equal(retried.note.categoryId, null); assert.equal(retried.note.pinned, false); assert.equal(retried.note.organizationRevision, edited.organizationRevision);
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_categories').get().n, 1);
  const insert = f.sqlite.prepare('INSERT INTO note_categories(id,name,name_key,created_at,updated_at) VALUES(?,?,?,?,?)');
  for (let i = 0; i < 49; i++) insert.run(crypto.randomUUID(), `c${i}`, `c${i}`, 1, 1);
  assert.equal((await f.request('/v1/notes/import', json('POST', { ...input, id: `import-${crypto.randomUUID()}`, title: 'Too many', categoryName: 'Extra' }))).status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notes').get().n, 1);
  const existingCategory = await f.request('/v1/notes/import', json('POST', { ...input, id: `import-${crypto.randomUUID()}`, title: 'Still allowed' }));
  assert.equal(existingCategory.status, 200); assert.equal((await existingCategory.json()).note.categoryName, 'Learning');
}));

const note = (id, extra = {}) => ({ id, title: id, content: 'body', excerpt: 'body', updatedAt: 'now', updatedTimestamp: 1, ...extra });
const flush = () => new Promise(resolve => setImmediate(resolve));
test('category search and pin ordering work together; metadata merges never roll back newer organization or bodies', () => {
  const f = components(), { filterOrganizedNotes, mergeNoteOrganization } = f.load('apps/workspace/src/utils/noteOrganization.ts');
  const notes = [note('A', { categoryId: 'work', updatedTimestamp: 3 }), note('B', { categoryId: 'work', pinned: true }), note('C', { categoryId: null, pinned: true, updatedTimestamp: 2 })];
  assert.deepEqual(filterOrganizedNotes(notes, 'work', '', false).map(n => n.id), ['B', 'A']);
  assert.deepEqual(filterOrganizedNotes(notes, 'work', 'body', true).map(n => n.id), ['C', 'B', 'A']);
  assert.deepEqual(filterOrganizedNotes(notes, '', '', false).map(n => n.id), ['C']);
  const current = note('A', { content: 'fresh body', pinned: true, organizationRevision: 3 });
  assert.equal(mergeNoteOrganization(current, note('A', { pinned: false, organizationRevision: 2 })).pinned, true);
  assert.equal(mergeNoteOrganization(current, note('A', { categoryId: 'work', organizationRevision: 4 })).content, 'fresh body');
});

test('failed save blocks category changes and search cannot hide a dirty draft', async () => {
  const f = components(), { NotesView } = f.load('apps/workspace/src/components/NotesView.tsx');
  f.services.noteService.fetchNoteCategories = async () => [{ id: 'work', name: 'Work', revision: 1 }];
  const props = { notes: [note('A'), note('B', { categoryId: 'work' })], onNewNote() {}, onDeleteNote: async () => {}, onUpdateNote: async () => { throw new Error('offline'); } };
  const h = f.mount(NotesView, props); await flush(); h.render();
  find(h, n => n.type === 'button' && label(n) === 'Edit').props.onClick(); h.render();
  find(h, n => n.type === 'textarea').props.onChange({ target: { value: 'unsaved text' } }); h.render();
  await find(h, n => n.props['aria-label'] === 'Filter notes by category').props.onChange({ target: { value: 'work' } }); await flush(); h.render();
  assert.equal(find(h, n => n.props['aria-label'] === 'Filter notes by category').props.value, 'all');
  find(h, n => n.props['aria-label'] === 'Search notes').props.onChange({ target: { value: 'no matches' } }); h.render();
  assert.equal(find(h, n => n.type === 'textarea').props.value, 'unsaved text');
  assert.match(label(h.tree), /outside the current filter/); assert.ok(f.storage.has('rachg.note-draft.A')); h.unmount();
});

test('category changes wait for saving and new notes use only the selected category', async () => {
  let resolve, created;
  const f = components(), { NotesView } = f.load('apps/workspace/src/components/NotesView.tsx');
  f.services.noteService.fetchNoteCategories = async () => [{ id: 'work', name: 'Work', revision: 1 }];
  const props = { notes: [note('A'), note('B', { categoryId: 'work' })], onNewNote(id) { created = id; }, onDeleteNote: async () => {}, onUpdateNote: n => new Promise(r => { resolve = () => { props.notes = props.notes.map(old => old.id === n.id ? n : old); r(); }; }) };
  const h = f.mount(NotesView, props); await flush(); h.render();
  find(h, n => n.type === 'button' && label(n) === 'Edit').props.onClick(); h.render();
  find(h, n => n.type === 'textarea').props.onChange({ target: { value: 'saved before switching' } }); h.render();
  find(h, n => n.props['aria-label'] === 'Filter notes by category').props.onChange({ target: { value: 'work' } }); h.render();
  assert.equal(find(h, n => n.type === 'textarea').props.value, 'saved before switching'); resolve(); await flush(); h.render();
  assert.equal(elements(h.tree).some(n => n.type === 'textarea'), false);
  assert.equal(find(h, n => n.props['aria-label'] === 'Filter notes by category').props.value, 'work');
  find(h, n => n.type === 'button' && label(n) === 'New Note').props.onClick(); await flush(); assert.equal(created, 'work'); h.unmount();
});
