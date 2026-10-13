const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label } = require('./component-fixture.cjs');
const req = createRequire(path.resolve('apps/workspace/package.json'));
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const item = (extra = {}) => ({ id: `import-${crypto.randomUUID()}`, title: '笔记 / title', content: '# Heading\n\n- Item\n\n```\n  code\n```\n[link](https://example.invalid)', ...extra });
const withFixture = fn => async () => { const f = fixture(); try { await fn(f); } finally { await f.close(); } };
const put = (f, value, headers = {}) => f.request('/v1/notes/import', { ...json('POST', value), headers: { ...json('POST', value).headers, ...headers } });

test('note imports are idempotent, skip exact duplicates and never overwrite edits', withFixture(async f => {
  const value = item();
  const first = await (await put(f, value)).json(); assert.equal(first.imported, true);
  assert.equal(first.note.content, value.content);
  assert.equal((await (await put(f, value)).json()).imported, false);
  const duplicate = await (await put(f, item())).json();
  assert.equal(duplicate.imported, false); assert.equal(duplicate.note.id, value.id);
  assert.equal((await (await put(f, item({ content: 'A different note with the same title' }))).json()).imported, true);
  await f.request(`/v1/notes/${value.id}`, json('PUT', { title: value.title, content: 'Edited after import' }));
  assert.equal((await put(f, value)).status, 409);
  assert.equal(f.sqlite.prepare('SELECT content FROM notes WHERE id=?').get(value.id).content, 'Edited after import');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_shares').get().n, 0);
}));

test('concurrent duplicate imports create only one note and enforce permissions and limits', withFixture(async f => {
  const results = await Promise.all([put(f, item()), put(f, item())]);
  assert.deepEqual((await Promise.all(results.map(r => r.json()))).map(r => r.imported).sort(), [false, true]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notes').get().n, 1);
  for (const url of ['/v1/notes/import', '/v1/notes/export']) assert.equal((await f.worker.fetch(new Request(`https://fixture.invalid${url}`, url.endsWith('import') ? json('POST', item()) : {}), f.env, f.ctx)).status, 401);
  assert.equal((await put(f, item(), { Origin: 'https://untrusted.invalid' })).status, 403);
  for (const value of [item({ id: 'existing-note' }), item({ title: '' }), item({ title: 'a'.repeat(201) }), item({ content: '字'.repeat(333334) })]) assert.equal((await put(f, value)).status, 400);
  assert.equal((await f.request('/v1/notes/export?after=bad%20cursor')).status, 400);
}));

test('paginated export covers more than the first 200 notes and duplicate detection covers older notes', withFixture(async f => {
  await f.request('/health');
  const insert = f.sqlite.prepare('INSERT INTO notes (id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)');
  for (let i = 0; i < 215; i++) insert.run(`n-${String(i).padStart(3, '0')}`, `title ${i}`, `content ${i}`, i, i);
  assert.equal((await (await f.request('/v1/notes')).json()).notes.length, 200);
  const ids = []; let cursor = '';
  do {
    const response = await f.request(`/v1/notes/export${cursor ? `?after=${cursor}` : ''}`);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const page = await response.json(); assert.ok(page.notes.length <= 10);
    ids.push(...page.notes.map(n => n.id)); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 215); assert.equal(new Set(ids).size, 215);
  const duplicate = await (await put(f, item({ title: 'title 0', content: 'content 0' }))).json();
  assert.equal(duplicate.imported, false); assert.equal(duplicate.note.id, 'n-000');
}));

test('retired scratchpad endpoints and scheduled cleanup preserve legacy rows and objects', withFixture(async f => {
  f.sqlite.exec("CREATE TABLE scratchpad (id TEXT PRIMARY KEY, content TEXT, image_key TEXT); INSERT INTO scratchpad VALUES ('default','keep legacy data','scratchpad/legacy.png'); CREATE TABLE scratchpad_cleanup (r2_key TEXT PRIMARY KEY, not_before INTEGER); INSERT INTO scratchpad_cleanup VALUES ('scratchpad/legacy.png',0)");
  await f.bucket.put('scratchpad/legacy.png', 'legacy image', {});
  for (const method of ['GET','PUT','DELETE']) assert.equal((await f.request('/v1/scratchpad', { method })).status, 404);
  assert.equal((await f.request('/v1/scratchpad/image')).status, 404);
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket);
  assert.equal(f.sqlite.prepare('SELECT content FROM scratchpad').get().content, 'keep legacy data');
  assert.ok(f.objects.has('scratchpad/legacy.png'));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM scratchpad_cleanup').get().n, 1);
}));

test('JSON and Markdown ZIP exports preserve Unicode, content and colliding titles', async () => {
  const f = components(), utility = f.load('apps/workspace/src/utils/noteTransfer.ts');
  const notes = [item({ title: '../报告:a', updatedTimestamp: 5 }), item({ title: '../报告:a', content: '\nsecond\n', updatedTimestamp: 6 })];
  const backup = utility.noteBackup(notes);
  const restored = await utility.parseNoteFiles([new File([backup], 'notes.json')]);
  assert.deepEqual(restored.map(({ title, content }) => ({ title, content })), notes.map(({ title, content }) => ({ title, content })));
  assert.notEqual(restored[0].id, notes[0].id);
  const zip = await utility.markdownArchive(notes);
  const files = req('fflate').unzipSync(new Uint8Array(await zip.arrayBuffer()));
  assert.equal(Object.keys(files).length, 3);
  assert.ok(Object.keys(files).every(name => !name.includes('/') && !name.includes('\\')));
  assert.equal(new TextDecoder().decode(files[Object.keys(files).find(name => name.startsWith('0002-'))]), '\nsecond\n');
  assert.equal(JSON.parse(new TextDecoder().decode(files['notes.json'])).notes[0].title, notes[0].title);
  const md = await utility.parseNoteFiles([new File(['# Keep heading\n'], 'Example.md')]);
  assert.equal(md[0].title, 'Example'); assert.equal(md[0].content, '# Keep heading\n');
  await assert.rejects(utility.parseNoteFiles([new File(['{'], 'bad.json')]), /valid JSON/);
  await assert.rejects(utility.parseNoteFiles([new File(['{}'], 'wrong.json')]), /supported/);
  await assert.rejects(utility.parseNoteFiles([new File(['x'.repeat(1000001)], 'large.md')]), /1 MB/);
  await assert.rejects(utility.parseNoteFiles([new File(['x'], 'unsafe.html')]), /Choose Markdown/);
});

const flush = () => new Promise(resolve => setImmediate(resolve));
const button = (h, name) => find(h, n => n.type === 'button' && label(n) === name);
test('import preview stays local; failed imports resume with stable IDs and retain confirmed progress', async () => {
  const f = components(); const calls = [], saved = []; let fail = true;
  f.services.noteService.importNote = async value => { calls.push(value); if (value.title === 'B' && fail) throw new Error('Connection interrupted'); return { note: value, imported: true }; };
  const { NoteTransferDialog } = f.load('apps/workspace/src/components/NoteTransferDialog.tsx');
  const h = f.mount(NoteTransferDialog, { mode: 'import', onClose() {}, onImported: note => saved.push(note) });
  find(h, n => n.props['aria-label'] === 'Choose notes to import').props.onChange({ target: { files: [new File(['alpha'], 'A.md'), new File(['beta'], 'B.md')], value: '' } });
  await flush(); h.render(); assert.equal(calls.length, 0);
  button(h, 'Import 2 notes').props.onClick(); await flush(); h.render();
  assert.equal(saved.length, 1); assert.match(label(h.tree), /Completed notes are kept/);
  fail = false; button(h, 'Import remaining (1)').props.onClick(); await flush(); h.render();
  assert.equal(saved.length, 2); assert.equal(calls[1].id, calls[2].id); assert.equal(calls.length, 3);
  assert.match(label(h.tree), /Import finished/); h.unmount();
});

test('export client follows all pages and rejects a failed page instead of returning a partial backup', async t => {
  const f = components(), service = f.load('apps/workspace/src/services/noteService.ts');
  const original = global.fetch; t.after(() => { global.fetch = original; });
  const urls = [];
  global.fetch = async url => { urls.push(url); return Response.json({ success: true, notes: [item()], nextCursor: urls.length === 1 ? 'page-two' : null }); };
  assert.equal((await service.fetchNotesForExport()).length, 2);
  assert.match(urls[1], /after=page-two/);
  let page = 0;
  global.fetch = async () => ++page === 1 ? Response.json({ success: true, notes: [item()], nextCursor: 'next' }) : Response.json({ error: 'temporary failure' }, { status: 503 });
  await assert.rejects(service.fetchNotesForExport(), /temporary failure/);
  const largeNotebook = Array.from({ length: 1001 }, (_, index) => ({ ...item(), updatedTimestamp: index }));
  global.fetch = async () => Response.json({ success: true, notes: largeNotebook, nextCursor: null });
  assert.equal((await service.fetchNotes()).length, 1001, 'Archive limits must not hide existing notes');
  await assert.rejects(service.fetchNotesForExport(), /1,000/);
});

test('note reads retry a transient network failure once and recover the complete notebook', async t => {
  const f = components(), service = f.load('apps/workspace/src/services/noteService.ts');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const saved = item({ updatedTimestamp: 1 }); let calls = 0;
  t.mock.method(global, 'fetch', async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['Content-Type'], undefined);
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return Response.json({ success: true, notes: [saved], nextCursor: null });
  });
  const pending = service.fetchNotes(); await new Promise(setImmediate);
  assert.equal(calls, 1); t.mock.timers.tick(500);
  assert.deepEqual(await pending, [saved]); assert.equal(calls, 2);
});

test('a retry repeats only the failed page and preserves previous pages without duplicates', async t => {
  const f = components(), service = f.load('apps/workspace/src/services/noteService.ts');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = item(), second = item(), urls = [];
  t.mock.method(global, 'fetch', async url => {
    urls.push(url);
    if (urls.length === 1) return Response.json({ success: true, notes: [first], nextCursor: 'next-page' });
    if (urls.length === 2) return Response.json({ error: 'Upstream temporarily unavailable' }, { status: 503 });
    return Response.json({ success: true, notes: [second], nextCursor: null });
  });
  const pending = service.fetchNotesForExport(); await new Promise(setImmediate);
  t.mock.timers.tick(500);
  assert.deepEqual(await pending, [first, second]);
  assert.equal(urls.length, 3); assert.equal(urls[1], urls[2]); assert.match(urls[2], /after=next-page/);
});

test('persistent read failures stop after two attempts and authentication failures are not retried', async t => {
  const f = components(), service = f.load('apps/workspace/src/services/noteService.ts');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const fetch = t.mock.method(global, 'fetch', async () => { calls++; throw new TypeError('Failed to fetch'); });
  const rejected = assert.rejects(service.fetchNotes(), /Unable to reach the notes service/);
  await new Promise(setImmediate); t.mock.timers.tick(500); await rejected;
  assert.equal(calls, 2);
  for (const status of [302, 401, 403]) {
    calls = 0; fetch.mock.mockImplementation(async () => { calls++; return new Response(null, { status }); });
    await assert.rejects(service.fetchNotes()); assert.equal(calls, 1);
  }
});
