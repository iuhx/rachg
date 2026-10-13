const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label } = require('./component-fixture.cjs');
const root = 'https://higa.teracloud.jp/dav/rachg/';
const username = 'fixture-user', password = 'fixture-password';
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const collection = () => new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/rachg/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`, { status: 207, headers: { 'Content-Type': 'application/xml' } });
function setup(t) {
  const f = fixture(); t.after(() => f.close()); f.env.WEBDAV_USERNAME = username; f.env.WEBDAV_PASSWORD = password;
  const remote = new Map([[root + 'unrelated.txt', new TextEncoder().encode('keep me').buffer]]), calls = [];
  const options = { deny: false, ignoreRange: false, collision: false, failAfterPut: false };
  t.mock.method(global, 'fetch', async (url, init) => {
    calls.push({ url, method: init.method }); assert.equal(init.redirect, 'manual'); assert.ok(String(url).startsWith(root));
    const headers = new Headers(init.headers); assert.equal(headers.get('authorization'), 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'));
    assert.equal(headers.has('cookie'), false); assert.equal(headers.has('cf-access-jwt-assertion'), false);
    if (options.deny) return new Response(password, { status: 401 });
    if (init.method === 'PROPFIND') { assert.equal(url, root); assert.equal(headers.get('depth'), '0'); return collection(); }
    if (init.method === 'PUT') {
      assert.equal(headers.get('if-none-match'), '*');
      if (options.collision) return new Response('', { status: 412 });
      remote.set(url, await new Response(init.body).arrayBuffer());
      if (options.failAfterPut) throw Error('Connection lost after storing bytes');
      return new Response(null, { status: 201 });
    }
    if (init.method === 'DELETE') { assert.notEqual(url, root); assert.notEqual(url, root + 'unrelated.txt'); remote.delete(url); return new Response(null, { status: 204 }); }
    const data = remote.get(url); if (!data) return new Response(null, { status: 404 });
    assert.equal(headers.get('accept-encoding'), 'identity');
    const responseHeaders = { 'Content-Type': 'text/plain', 'Content-Length': String(data.byteLength), ETag: '"fixture-etag"' };
    if (init.method === 'HEAD') return new Response(null, { headers: responseHeaders });
    if (headers.has('range') && !options.ignoreRange) {
      const [, a, b] = headers.get('range').match(/bytes=(\d+)-(\d+)/); const from = Number(a), to = Number(b);
      return new Response(data.slice(from, to + 1), { status: 206, headers: { ...responseHeaders, 'Content-Length': String(to - from + 1), 'Content-Range': `bytes ${from}-${to}/${data.byteLength}` } });
    }
    return new Response(data, { headers: responseHeaders });
  });
  const save = async () => f.request('/v1/storage/webdav', { method: 'POST' });
  const upload = (content = 'hello world', expiry = 'permanent', name = '测试.txt') => {
    const form = new FormData(); form.set('file', new File([content], name, { type: 'text/plain' })); form.set('expiry', expiry); form.set('storageBackend', 'webdav');
    return f.request('/v1/files/upload', { method: 'POST', body: form });
  };
  return { ...f, remote, calls, options, save, uploadWebdav: upload };
}

test('Worker Secrets are private, require no settings database and cannot be overwritten through the API', async t => {
  const f = setup(t);
  assert.equal((await f.worker.fetch(new Request('https://fixture.invalid/v1/storage/webdav'), f.env, f.ctx)).status, 401);
  assert.equal((await f.request('/v1/storage/webdav', { ...json('PUT', { username, password, revision: 0 }), headers: { Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' } })).status, 403);
  assert.equal(f.calls.length, 0);
  f.hooks.failSql = () => true;
  const result = await (await f.request('/v1/storage/webdav')).json(); assert.equal(result.settings.baseUrl, root); assert.equal(result.settings.configured, true); assert.equal(result.settings.source, 'worker-secrets');
  assert.doesNotMatch(JSON.stringify(result), /fixture-password|fixture-user/);
  assert.equal(f.queries.length, 0); assert.equal(f.calls.length, 0);
  assert.equal((await f.request('/v1/storage/webdav', json('PUT', { username, password }))).status, 405);
  assert.equal((await f.save()).status, 200);
  delete f.env.WEBDAV_PASSWORD;
  assert.equal((await (await f.request('/v1/storage/webdav')).json()).settings.configured, false);
  assert.equal((await f.save()).status, 503);
  assert.equal(f.remote.size, 1, 'connection testing does not create files');
});

test('uploads, downloads, ranges, text pages and deletion use WebDAV while preserving R2 quotas and unrelated objects', async t => {
  const f = setup(t); assert.equal((await f.save()).status, 200);
  await f.upload(100);
  const response = await f.uploadWebdav('hello world'); assert.equal(response.status, 201);
  const { file } = await response.json(); assert.equal(file.storageBackend, 'webdav'); assert.equal(f.objects.size, 1);
  const listed = await (await f.request('/v1/files')).json(); assert.equal(listed.totalSizeBytes, 100); assert.equal(listed.files.length, 2);
  const full = await f.request(`/f/${file.id}`); assert.equal(await full.text(), 'hello world');
  const head = await f.request(`/f/${file.id}`, { method: 'HEAD' }); assert.equal(head.headers.get('content-length'), '11'); assert.equal(await head.text(), '');
  for (const ignore of [false, true]) {
    f.options.ignoreRange = ignore;
    const range = await f.request(`/f/${file.id}`, { headers: { Range: 'bytes=2-4' } }); assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), 'bytes 2-4/11'); assert.equal(await range.text(), 'llo');
  }
  assert.equal((await f.request(`/f/${file.id}`, { headers: { Range: 'bytes=99-100' } })).status, 416);
  assert.match(await (await f.request(`/t/${file.id}`)).text(), /hello world/);
  assert.equal((await f.uploadWebdav('x'.repeat(1100))).status, 201, 'WebDAV is not capped by the R2 quota');
  assert.equal((await f.request(`/v1/files/${file.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await f.request(`/f/${file.id}`)).status, 404); assert.ok(f.remote.has(root + 'unrelated.txt')); assert.equal(f.objects.size, 1);
});

test('expired and ambiguous WebDAV uploads are cleaned only by exact key, and failed deletes remain retryable', async t => {
  const f = setup(t); await f.save();
  const { file } = await (await f.uploadWebdav('expire', '1 hour')).json();
  f.sqlite.prepare('UPDATE files SET expires_at=1 WHERE id=?').run(file.id);
  f.options.deny = true;
  let cleanup = await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket, f.env); assert.equal(cleanup.failed, 1); assert.equal(f.remote.size, 2);
  f.options.deny = false;
  cleanup = await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket, f.env); assert.equal(cleanup.deleted, 1); assert.equal(f.remote.size, 1);
  f.options.failAfterPut = true; assert.equal((await f.uploadWebdav('ambiguous')).status, 502);
  f.sqlite.prepare("UPDATE files SET created_at=0 WHERE status='uploading'").run();
  cleanup = await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket, f.env); assert.equal(cleanup.deleted, 1); assert.equal(f.remote.size, 1);
  assert.ok(f.remote.has(root + 'unrelated.txt'));
});

test('failed authentication is never stored or leaked; path traversal and collisions cannot delete other files', async t => {
  const f = setup(t); f.options.deny = true;
  const rejected = await f.save(); assert.equal(rejected.status, 502); assert.ok(!(await rejected.text()).includes(password));
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='webdav_settings'").get().n, 0);
  f.options.deny = false; await f.save();
  const { loadWebdav } = f.load('workers/file-service/src/webdav.ts'), client = await loadWebdav(f.env);
  const { buildWebdavKey } = f.load('workers/file-service/src/stored-files.ts');
  const longKey = buildWebdavKey(crypto.randomUUID(), '中文'.repeat(100) + '.txt');
  assert.ok(new TextEncoder().encode(longKey.slice(7)).byteLength <= 255);
  for (const value of ['webdav/../unrelated.txt', 'webdav/', 'https://foreign.invalid/', 'webdav/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa--a/b']) await assert.rejects(client.delete(value), /Invalid WebDAV storage key/);
  f.options.collision = true; assert.equal((await f.uploadWebdav('collision')).status, 409);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM files WHERE status='uploading'").get().n, 0);
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket, f.env);
  assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
});

const flush = () => new Promise(resolve => setImmediate(resolve));
test('storage status avoids preflight and times out even when a fetch never settles', async t => {
  const f = components(), service = f.load('apps/workspace/src/services/storageService.ts');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal;
  t.mock.method(global, 'fetch', (_url, options) => {
    assert.equal(new Headers(options.headers).has('content-type'), false);
    requestSignal = options.signal;
    return new Promise(() => {});
  });
  const pending = service.fetchWebdavSettings();
  const rejected = assert.rejects(pending, /timed out/);
  t.mock.timers.tick(8000); await rejected;
  assert.equal(requestSignal.aborted, true);
});

test('settings UI has no password form and recovers from failed loading', async () => {
  const f = components(); let changed, fail = true;
  const config = { baseUrl: root, configured: true, source: 'worker-secrets', verifiedAt: null };
  f.services.storageService.fetchWebdavSettings = async () => { if (fail) throw Error('Storage request timed out'); return config; };
  f.services.storageService.testWebdavConnection = async () => ({ ...config, verifiedAt: Date.now() });
  const { WebdavSettingsPanel } = f.load('apps/workspace/src/components/WebdavSettingsPanel.tsx');
  const h = f.mount(WebdavSettingsPanel, { canManage: true, onChanged: next => changed = next }); await flush(); h.render();
  assert.match(label(h.tree), /timed out/); assert.doesNotMatch(label(h.tree), /Loading storage status/);
  assert.equal(find(h, n => n.type === 'button' && label(n) === 'Refresh status').props.disabled, false);
  fail = false; find(h, n => n.type === 'button' && label(n) === 'Refresh status').props.onClick(); await flush(); h.render();
  assert.equal(changed.configured, true); assert.doesNotMatch(label(h.tree), /Apps Password|Save & check/);
  find(h, n => n.type === 'button' && label(n) === 'Test connection').props.onClick(); await flush(); h.render();
  assert.match(label(h.tree), /Connected/); assert.equal(f.storage.size, 0); h.unmount();
});
