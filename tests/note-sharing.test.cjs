const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label } = require('./component-fixture.cjs');

const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const noteInput = { title: '分享快照', content: '# Shared version\nOnly this note.' };
const createNote = async f => (await (await f.request('/v1/notes', json('POST', noteInput))).json()).note;
const route = note => `/v1/notes/${note.id}/share`;
const publish = (f, note) => f.request(route(note), json('POST', note));
const publicRequest = (f, path, method = 'GET') => f.worker.fetch(new Request(`https://fixture.invalid${path}`, { method }), f.env, f.ctx);
const withFixture = fn => async () => { const f = fixture(); f.env.PUBLIC_NOTE_SHARES_ENABLED = 'true'; try { await fn(f); } finally { await f.close(); } };

test('only explicit snapshots are public; creation is not automatic and private routes stay protected', withFixture(async f => {
  const note = await createNote(f);
  assert.equal((await (await f.request(route(note))).json()).share, null);
  assert.equal((await publicRequest(f, `/s/${note.id}`)).status, 404);
  for (const path of ['/v1/notes', `/v1/notes/${note.id}`, route(note), '/v1/mail', '/v1/files', '/f/private', '/t/private', '/health', '/s/../v1/notes']) {
    assert.equal((await publicRequest(f, path)).status, 401, path);
  }
  const anonymousWrite = await f.worker.fetch(new Request(`https://fixture.invalid${route(note)}`, json('POST', note)), f.env, f.ctx);
  assert.equal(anonymousWrite.status, 401);
  const forbidden = await f.request(route(note), { ...json('POST', note), headers: { 'content-type': 'application/json', Origin: 'https://foreign.invalid' } });
  assert.equal(forbidden.status, 403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_shares').get().n, 0);
  const status = await publicRequest(f, '/s/status');
  assert.deepEqual(await status.json(), { service: 'rachg-note-share', ready: true });
  assert.equal((await publicRequest(f, '/s/status', 'POST')).status, 405);
}));

test('public page is a read-only snapshot and rejects XSS and automatic external images', withFixture(async f => {
  const note = (await (await f.request('/v1/notes', json('POST', {
    title: '<script>privateTitle()</script>',
    content: '# Title\n<script>alert(1)</script>\n<img src=x onerror=alert(2)>\n\n[bad](javascript:alert%281%29)\n![tracking](https://tracking.invalid/a.png)\n[good](https://example.invalid/)\n\n- list\n\n```js\n<code>\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |',
  }))).json()).note;
  await f.request('/v1/notes', json('POST', { title: 'Other note', content: 'UNRELATED_PRIVATE_SECRET' }));
  const created = await publish(f, note); assert.equal(created.status, 201);
  const { share } = await created.json(); assert.match(share.token, /^[a-f0-9]{64}$/);
  assert.equal(share.expiresTimestamp - share.createdTimestamp, 7 * 86400_000);
  assert.equal((await (await f.request(route(note))).json()).share.token, share.token);
  const page = await publicRequest(f, `/s/${share.token}`); assert.equal(page.status, 200);
  assert.match(page.headers.get('cache-control'), /no-store/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(page.headers.get('x-robots-tag'), /noindex/);
  const html = await page.text();
  assert.match(html, /<h1>Title<\/h1>/); assert.match(html, /<table>/); assert.match(html, /<li>/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /href="https:\/\/example.invalid\//);
  assert.doesNotMatch(html, /<script|<img|href="javascript:|UNRELATED_PRIVATE_SECRET|note-\d/);
  assert.equal((await publicRequest(f, `/s/${share.token}`, 'DELETE')).status, 405);
  const head = await publicRequest(f, `/s/${share.token}`, 'HEAD'); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  await f.request(`/v1/notes/${note.id}`, json('PUT', { title: 'New PRIVATE TITLE', content: 'NEW_PRIVATE_CONTENT' }));
  assert.equal(await (await publicRequest(f, `/s/${share.token}`)).text(), html);
}));

test('revocation, expiration, deletion and disabled feature stop access', withFixture(async f => {
  const note = await createNote(f);
  const { share } = await (await publish(f, note)).json();
  f.env.PUBLIC_NOTE_SHARES_ENABLED = 'false';
  assert.equal((await publicRequest(f, `/s/${share.token}`)).status, 404);
  assert.equal((await publicRequest(f, '/s/status')).status, 404);
  assert.equal((await publish(f, note)).status, 503);
  // Admins can still revoke during a global shutdown.
  assert.equal((await f.request(route(note), json('DELETE', { token: share.token }))).status, 200);
  f.env.PUBLIC_NOTE_SHARES_ENABLED = 'true';
  assert.equal((await publicRequest(f, `/s/${share.token}`)).status, 404);
  const second = (await (await publish(f, note)).json()).share;
  assert.notEqual(second.token, share.token);
  await f.request(route(note), json('DELETE', { token: share.token }));
  assert.equal((await publicRequest(f, `/s/${second.token}`)).status, 200, 'stale revocation must not revoke a new link');
  f.sqlite.prepare('UPDATE note_shares SET expires_at = ?').run(Date.now());
  assert.equal((await publicRequest(f, `/s/${second.token}`)).status, 404);
  assert.equal((await (await f.request(route(note))).json()).share, null);
  await f.load('workers/file-service/src/note-shares.ts').cleanupNoteShares(f.DB);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_shares').get().n, 0);
  const third = (await (await publish(f, note)).json()).share;
  assert.equal((await f.request(`/v1/notes/${note.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await publicRequest(f, `/s/${third.token}`)).status, 404);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_shares').get().n, 0);
}));

test('stale versions, concurrent creation, oversized Unicode and deleted notes cannot publish', withFixture(async f => {
  const note = await createNote(f);
  assert.equal((await publish(f, { ...note, content: 'unreviewed' })).status, 409);
  assert.equal((await publish(f, { ...note, updatedTimestamp: note.updatedTimestamp - 1 })).status, 409);
  assert.equal((await publish(f, { ...note, updatedTimestamp: 'invalid' })).status, 400);
  const results = await Promise.all([publish(f, note), publish(f, note)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_shares').get().n, 1);
  const tooLarge = (await (await f.request('/v1/notes', json('POST', { title: 'large', content: '字'.repeat(67000) }))).json()).note;
  assert.equal((await publish(f, tooLarge)).status, 413);
  await f.request(`/v1/notes/${tooLarge.id}`, { method: 'DELETE' });
  assert.equal((await publish(f, { ...tooLarge, content: '' })).status, 409);
  const failed = await publicRequest(f, `/s/${'a'.repeat(64)}`);
  assert.equal(failed.status, 404); assert.match(failed.headers.get('cache-control'), /no-store/);
  f.hooks.failSql = sql => sql.includes('SELECT s.*');
  const unavailable = await publicRequest(f, `/s/${'a'.repeat(64)}`);
  assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /SQL|fixture/);
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const uiNote = { id: 'note-1', title: 'Saved title', content: 'Saved body', excerpt: 'Saved body', updatedTimestamp: 1, updatedAt: 'now' };
const uiShare = { token: 'a'.repeat(64), url: `https://api.rachg.com/s/${'a'.repeat(64)}`, title: uiNote.title, content: uiNote.content, createdTimestamp: Date.now(), expiresTimestamp: Date.now() + 7 * 86400_000 };
const button = (h, text) => find(h, n => n.type === 'button' && label(n) === text);

test('Share opens a review and remains disabled while note edits are unsaved', async () => {
  const f = components(); let saves = 0;
  const { NotesView } = f.load('apps/workspace/src/components/NotesView.tsx');
  const h = f.mount(NotesView, { notes: [uiNote], onNewNote() {}, onUpdateNote: async () => { saves++; }, onDeleteNote: async () => {} });
  assert.equal(button(h, 'Share').props.disabled, false);
  button(h, 'Share').props.onClick(); h.render();
  const dialog = find(h, n => n.type?.name === 'NoteShareDialog'); assert.equal(dialog.props.note, uiNote);
  dialog.props.onClose(); h.render(); button(h, 'Edit').props.onClick(); h.render();
  find(h, n => n.props['aria-label'] === 'Markdown content').props.onChange({ target: { value: 'Unsaved draft' } }); h.render();
  assert.equal(button(h, 'Share').props.disabled, true); assert.equal(saves, 0); h.unmount();
});

test('share dialog requires explicit creation and confirmed revocation; unavailable public route prevents creation', async () => {
  const f = components(); let creates = 0, revokes = 0;
  Object.assign(f.services.noteService, {
    getNoteShare: async () => ({ share: null, enabled: true }), isPublicNoteSharingReady: async () => true,
    createNoteShare: async () => { creates++; return uiShare; }, revokeNoteShare: async () => { revokes++; },
  });
  const { NoteShareDialog } = f.load('apps/workspace/src/components/NoteShareDialog.tsx');
  let h = f.mount(NoteShareDialog, { note: uiNote, onClose() {} });
  await flush(); h.render(); assert.equal(creates, 0);
  assert.equal(button(h, 'Create 7-day link').props.disabled, false);
  button(h, 'Create 7-day link').props.onClick(); button(h, 'Create 7-day link').props.onClick();
  await flush(); h.render(); assert.equal(creates, 1);
  assert.equal(find(h, n => n.props['aria-label'] === 'Note share link').props.value, uiShare.url);
  button(h, 'Revoke link').props.onClick(); h.render(); assert.equal(revokes, 0);
  button(h, 'Confirm revoke').props.onClick(); await flush(); h.render(); assert.equal(revokes, 1);
  assert.equal(button(h, 'Create 7-day link').props.disabled, false); h.unmount();
  f.services.noteService.isPublicNoteSharingReady = async () => false;
  h = f.mount(NoteShareDialog, { note: uiNote, onClose() {} }); await flush(); h.render();
  assert.equal(button(h, 'Create 7-day link').props.disabled, true);
  button(h, 'Create 7-day link').props.onClick(); await flush(); assert.equal(creates, 1); h.unmount();
});

test('public readiness check never sends administrator credentials or follows a login redirect', async t => {
  const f = components(); const api = f.load('apps/workspace/src/services/noteService.ts');
  const originalFetch = global.fetch; t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.rachg.com/s/status'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    return Response.json({ service: 'rachg-note-share', ready: true });
  };
  assert.equal(await api.isPublicNoteSharingReady(), true);
  global.fetch = async () => new Response('<html>Login</html>');
  assert.equal(await api.isPublicNoteSharingReady(), false);
});
