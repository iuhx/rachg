// Runs the generated release artifact in workerd with local D1/R2 and a mock JWKS endpoint.
// No Cloudflare account, production data or external mail service is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { generateKeyPairSync, sign, createHash, createHmac } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const tempRoot = path.join(root, '.wrangler', 'runtime-tests');
fs.mkdirSync(tempRoot, { recursive: true });
process.env.TMP = process.env.TEMP = process.env.TMPDIR = tempRoot;
const wranglerRequire = createRequire(fs.realpathSync(path.join(root, 'workers/file-service/node_modules/wrangler/package.json')));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { Response: MockResponse, FormData: RuntimeFormData } = wranglerRequire('undici');

test('release Worker runs reliably in workerd with actual D1 and R2 bindings', { timeout: 180_000 }, async t => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const issuer = 'https://access.example.invalid';
  const token = (claims = {}, header = {}) => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = `${encode({ alg: 'RS256', kid: 'test-key', ...header })}.${encode({
      iss: issuer, aud: ['local-workspace'], sub: 'test-admin', email: 'admin@example.invalid',
      exp: Math.floor(Date.now() / 1000) + 300, ...claims,
    })}`;
    return `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`;
  };
  const jwks = {
    keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }],
  };
  let outgoingMail;
  const webdavRoot = 'https://higa.teracloud.jp/dav/rachg/';
  const webdavFiles = new Map();
  let webdavNoLength = false;
  const telegramToken = '987654321:runtime_telegram_fixture_token_12345', telegramUser = 6121514938;
  const telegramFiles = new Map(), telegramReplies = [];
  const telegramSecret = createHmac('sha256', telegramToken).update('rachg:telegram-webhook:v1').digest('hex');
  const runtimeOptions = {
    rootPath: root, host: '127.0.0.1', port: 0, cf: false,
    modules: true, scriptPath: path.join(root, 'workers/file-service/cloudflare-editor-bundle/index.js'),
    compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], r2Buckets: ['FILES_BUCKET'], d1Persist: false, r2Persist: false,
    outboundService: async request => {
      if (request.url.startsWith(`https://api.telegram.org/bot${telegramToken}/`)) {
        const method = request.url.split('/').pop(), payload = await request.json();
        if (method === 'getMe') return MockResponse.json({ ok: true, result: { id: 987654321, is_bot: true, username: 'rachgx_bot' } });
        if (method === 'setWebhook') { assert.equal(payload.secret_token, telegramSecret); assert.deepEqual(payload.allowed_updates, ['message']); return MockResponse.json({ ok: true, result: true }); }
        if (method === 'getFile') { const data = telegramFiles.get(payload.file_id); assert.ok(data); return MockResponse.json({ ok: true, result: { file_path: `documents/${payload.file_id}`, file_size: data.byteLength } }); }
        assert.equal(method, 'sendMessage'); assert.equal(payload.chat_id, telegramUser); telegramReplies.push(payload);
        return MockResponse.json({ ok: true, result: { message_id: 1000 + telegramReplies.length } });
      }
      if (request.url.startsWith(`https://api.telegram.org/file/bot${telegramToken}/`)) {
        assert.equal(request.headers.get('accept-encoding'), 'identity');
        const data = telegramFiles.get(request.url.split('/').pop()); assert.ok(data);
        return new MockResponse(data, { headers: { 'Content-Length': String(data.byteLength) } });
      }
      if (request.url.startsWith(webdavRoot)) {
        assert.equal(request.headers.get('authorization'), 'Basic ' + Buffer.from('runtime-user:runtime-password').toString('base64'));
        assert.equal(request.headers.has('cf-access-jwt-assertion'), false);
        if (request.method === 'PROPFIND') return new MockResponse('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/rachg/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>', { status: 207 });
        if (request.method === 'PUT') { assert.equal(request.headers.get('if-none-match'), '*'); webdavFiles.set(request.url, await request.arrayBuffer()); return new MockResponse(null, { status: 201 }); }
        if (request.method === 'DELETE') { assert.notEqual(request.url, webdavRoot); webdavFiles.delete(request.url); return new MockResponse(null, { status: 204 }); }
        const data = webdavFiles.get(request.url);
        if (!data) return new MockResponse(null, { status: 404 });
        const headers = { 'Content-Type': 'text/plain', ETag: '"runtime-dav"' };
        if (!webdavNoLength) headers['Content-Length'] = String(data.byteLength);
        const stream = bytes => new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } });
        const range = request.headers.get('range')?.match(/^bytes=(\d+)-(\d+)$/);
        if (request.method !== 'HEAD' && range && Number(range[1]) < data.byteLength) {
          const from = Number(range[1]), to = Math.min(Number(range[2]), data.byteLength - 1);
          const part = data.slice(from, to + 1);
          const rangeHeaders = { ...headers, 'Content-Range': `bytes ${from}-${to}/${data.byteLength}` };
          if (!webdavNoLength) rangeHeaders['Content-Length'] = String(part.byteLength);
          return new MockResponse(webdavNoLength ? stream(part) : part, { status: 206, headers: rangeHeaders });
        }
        return new MockResponse(request.method === 'HEAD' ? null : (webdavNoLength ? stream(data) : data), { headers });
      }
      if (request.url === 'https://rdap.verisign.com/com/v1/domain/rachg.com') {
        assert.equal(request.headers.has('cf-access-jwt-assertion'), false);
        assert.equal(request.headers.has('authorization'), false);
        return MockResponse.json({ ldhName: 'RACHG.COM', events: [{ eventAction: 'expiration', eventDate: '2027-09-03T13:27:43Z' }] });
      }
      if (request.url === 'https://api.resend.com/emails') {
        assert.equal(request.method, 'POST');
        outgoingMail = await request.json();
        return MockResponse.json({ id: 'local-formatted-mail' });
      }
      assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`, 'Unexpected outbound network request');
      return MockResponse.json(jwks);
    },
    bindings: { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUDIENCE: 'local-workspace',
      ACCESS_ADMIN_EMAIL: 'admin@example.invalid', MAX_STORAGE_BYTES: '1000', RESEND_API_KEY: 'local-fixture-only', PUBLIC_NOTE_SHARES_ENABLED: 'true', WEBDAV_USERNAME: 'runtime-user', WEBDAV_PASSWORD: 'runtime-password',
      TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: telegramToken, TELEGRAM_ALLOWED_USER_ID: String(telegramUser), TELEGRAM_BOT_USERNAME: 'rachgx_bot' },
  };
  const mf = new Miniflare(convertV4MiniflareOptions(runtimeOptions));
  t.after(() => mf.dispose());
  await mf.ready;
  const auth = token();
  const request = (route, options = {}) => mf.dispatchFetch(`https://workspace.example.invalid${route}`, {
    ...options, headers: { 'cf-access-jwt-assertion': auth, ...options.headers },
  });
  const db = await mf.getD1Database('DB');
  const bucket = await mf.getR2Bucket('FILES_BUCKET');

  // Exercise the schema upgrade against the original notes-only schema.
  await db.prepare('CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run();
  await db.prepare("INSERT INTO notes VALUES ('legacy-organization', 'Legacy', 'Preserved body', 1, 2)").run();

  await t.test('signed admin access works; forged, expired and wrong-user assertions fail closed', async () => {
    const tampered = auth.split('.');
    tampered[2] = (tampered[2][0] === 'a' ? 'b' : 'a') + tampered[2].slice(1);
    for (const assertion of ['', 'malformed', token({ exp: 1 }), token({ aud: 'wrong' }),
      token({ email: 'other@example.invalid' }), token({}, { alg: 'none' }), tampered.join('.')]) {
      const response = await request('/health', { headers: { 'cf-access-jwt-assertion': assertion,
        'cf-access-authenticated-user-email': 'admin@example.invalid' } });
      assert.equal(response.status, 401);
      await response.text();
    }
    const response = await request('/health');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).schema, 'ready');
  });

  await t.test('private system health checks Worker, R2 and domain without deployment metadata', async () => {
    const anonymous = await mf.dispatchFetch('https://workspace.example.invalid/v1/system-health');
    assert.equal(anonymous.status, 401); await anonymous.text();
    const response = await request('/v1/system-health'); assert.equal(response.status, 200);
    const result = await response.json(); assert.deepEqual(result.worker, { status: 'reachable' });
    assert.equal(result.storage.status, 'available'); assert.equal(result.storage.availableBytes, 1000); assert.equal(result.storage.quotaScope, 'files');
    assert.equal(result.domain.expiresAt, Date.parse('2027-09-03T13:27:43Z'));
    assert.equal((await bucket.list()).objects.length, 0);
  });

  await t.test('WebDAV uses Worker Secrets and real workerd uploads/downloads/range fallback/delete preserve R2 accounting', async () => {
    const response = await request('/v1/storage/webdav', { method: 'POST' });
    assert.equal(response.status, 200); const config = await response.json(); assert.equal(config.settings.configured, true); assert.ok(!JSON.stringify(config).includes('runtime-password'));
    assert.equal(config.settings.source, 'worker-secrets'); assert.ok(!JSON.stringify(config).includes('runtime-user'));
    const form = new RuntimeFormData(); form.set('file', new Blob(['runtime webdav contents'], { type: 'text/plain' }), 'runtime.txt'); form.set('storageBackend', 'webdav'); form.set('expiry', 'permanent');
    const uploaded = await request('/v1/files/upload', { method: 'POST', body: form }); assert.equal(uploaded.status, 201); const { file } = await uploaded.json(); assert.equal(file.storageBackend, 'webdav');
    const health = await (await request('/health')).json(); assert.equal(health.quota.usedBytes, 0);
    const download = await request(`/f/${file.id}`); assert.equal(await download.text(), 'runtime webdav contents');
    const partial = await request(`/f/${file.id}`, { headers: { Range: 'bytes=0-6' } }); assert.equal(partial.status, 206); assert.equal(await partial.text(), 'runtime');
    webdavNoLength = true;
    const noLength = await request(`/f/${file.id}`); assert.equal(noLength.status, 200); assert.equal(await noLength.text(), 'runtime webdav contents');
    const noLengthHead = await request(`/f/${file.id}`, { method: 'HEAD' }); assert.equal(noLengthHead.status, 200); assert.equal(noLengthHead.headers.get('content-length'), '23');
    const noLengthRange = await request(`/f/${file.id}`, { headers: { Range: 'bytes=0-6' } }); assert.equal(noLengthRange.status, 206); assert.equal(await noLengthRange.text(), 'runtime');
    webdavNoLength = false;
    const removed = await request(`/v1/files/${file.id}?deleteRemote=true`, { method: 'DELETE' }); assert.equal(removed.status, 200); await removed.text(); assert.equal(webdavFiles.size, 0); assert.equal((await bucket.list()).objects.length, 0);
  });

  await t.test('note categories migrate legacy notes and preserve bodies through transactional moves, imports and deletion', async () => {
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const category = { id: crypto.randomUUID(), name: 'Runtime category' };
    const created = await request('/v1/note-categories', json('POST', category));
    assert.equal(created.status, 200); await created.text();
    const old = await (await request('/v1/notes/legacy-organization')).json();
    assert.equal(old.note.categoryId, null); assert.equal(old.note.organizationRevision, 0);
    const moved = await request('/v1/notes/legacy-organization/organization', json('PUT', { categoryId: category.id, pinned: true, revision: 0 }));
    assert.equal(moved.status, 200); assert.equal((await moved.json()).note.categoryName, category.name);
    const newResponse = await request('/v1/notes', json('POST', { title: 'Created in category', content: 'Atomic creation', categoryId: category.id }));
    assert.equal(newResponse.status, 201); const { note: newNote } = await newResponse.json(); assert.equal(newNote.categoryId, category.id);
    const input = { id: `import-${crypto.randomUUID()}`, title: 'Runtime classified import', content: 'Imported body', categoryName: category.name, pinned: true };
    const concurrent = await Promise.all([request('/v1/notes/import', json('POST', input)), request('/v1/notes/import', json('POST', { ...input, id: `import-${crypto.randomUUID()}` }))]);
    const imported = await Promise.all(concurrent.map(response => response.json()));
    assert.deepEqual(imported.map(result => result.imported).sort(), [false, true]);
    assert.equal(imported[0].note.pinned, true); assert.equal(imported[0].note.categoryName, category.name);
    const deleted = await request(`/v1/note-categories/${category.id}`, json('DELETE', { revision: 1 }));
    assert.equal(deleted.status, 200); await deleted.text();
    const after = await (await request('/v1/notes/legacy-organization')).json();
    assert.equal(after.note.content, 'Preserved body'); assert.equal(after.note.categoryId, null); assert.equal(after.note.pinned, true); assert.equal(after.note.organizationRevision, 2);
    const stale = await request('/v1/notes/legacy-organization/organization', json('PUT', { categoryId: null, pinned: false, revision: 1 }));
    assert.equal(stale.status, 409); await stale.text();
    for (const id of ['legacy-organization', newNote.id, imported[0].note.id]) { const removed = await request(`/v1/notes/${id}`, { method: 'DELETE' }); assert.equal(removed.status, 200); await removed.text(); }
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM note_organization').first()).n, 0);
  });

  await t.test('daily task completion and dated history persist in real D1', async () => {
    const body = { id: crypto.randomUUID(), date: '2026-10-13', text: 'Local runtime task' };
    const created = await request('/v1/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(created.status,200);const {todo}=await created.json();
    const saved = await request(`/v1/todos/${todo.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({date:todo.date,revision:todo.revision,completed:true}) });
    assert.equal((await saved.json()).todo.completed,true);
    const history=await (await request('/v1/todos?date=2026-10-13')).json();assert.equal(history.todos[0].text,body.text);
    const month=await (await request('/v1/todos?month=2026-10')).json();assert.equal(month.days[0].completed,1);
    assert.equal((await (await request('/v1/todos?date=2026-10-14')).json()).todos.length,0);
    const anonymous = await mf.dispatchFetch('https://workspace.example.invalid/v1/todos?date=2026-10-13');assert.equal(anonymous.status,401);await anonymous.text();
  });

  await t.test('private note CRUD persists Unicode and rejects foreign browser writes', async () => {
    const reconnect = await request('/auth/return?redirect_url=https://untrusted.invalid', { redirect: 'manual' });
    assert.equal(reconnect.status, 302);
    assert.equal(reconnect.headers.get('location'), 'https://rachg.com/');
    await reconnect.text();
    const create = { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '本地验证', content: '# 安全保存\nUnicode ✓' }) };
    const denied = await request('/v1/notes', { ...create, headers: { ...create.headers, Origin: 'https://untrusted.invalid' } });
    assert.equal(denied.status, 403);
    await denied.text();
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM notes').first()).n, 0);
    const created = await request('/v1/notes', create);
    assert.equal(created.status, 201);
    const { note } = await created.json();
    assert.equal((await (await request(`/v1/notes/${note.id}`)).json()).note.content, '# 安全保存\nUnicode ✓');
    const updated = await request(`/v1/notes/${note.id}`, { ...create, method: 'PUT', body: JSON.stringify({ title: 'Updated', content: 'saved edit' }) });
    assert.equal(updated.status, 200);
    await updated.text();
    assert.equal((await db.prepare('SELECT content FROM notes WHERE id=?').bind(note.id).first()).content, 'saved edit');
    const deleted = await request(`/v1/notes/${note.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    await deleted.text();
    const missing = await request(`/v1/notes/${note.id}`);
    assert.equal(missing.status, 404);
    await missing.text();
  });

  await t.test('note import/export works with real D1 and scratchpad routes are retired', async () => {
    const value = { id: `import-${crypto.randomUUID()}`, title: 'Import runtime check', content: '# Saved\nUnicode 中文' };
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
    const first = await request('/v1/notes/import', options); assert.equal(first.status, 200);
    assert.equal((await first.json()).imported, true);
    const repeated = await request('/v1/notes/import', options); assert.equal((await repeated.json()).imported, false);
    const exported = await (await request('/v1/notes/export')).json();
    assert.equal(exported.notes.find(note => note.id === value.id).content, value.content);
    assert.equal(exported.nextCursor, null);
    const retired = await request('/v1/scratchpad'); assert.equal(retired.status, 404); await retired.text();
    await (await request(`/v1/notes/${value.id}`, { method: 'DELETE' })).text();
  });

  await t.test('public note snapshots work in real D1 without opening private routes', async () => {
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const anon = path => mf.dispatchFetch(`https://workspace.example.invalid${path}`);
    const created = await request('/v1/notes', json('POST', { title: 'Public snapshot', content: '# Shared heading\n<script>unsafe()</script>' }));
    const { note } = await created.json();
    const route = `/v1/notes/${note.id}/share`;
    assert.equal((await anon('/s/status')).status, 200);
    for (const path of ['/v1/notes', route, '/v1/mail', '/v1/files', '/f/private', '/t/private']) {
      const response = await anon(path); assert.equal(response.status, 401); await response.text();
    }
    const shared = await request(route, json('POST', note)); assert.equal(shared.status, 201);
    const { share } = await shared.json();
    const page = await anon(`/s/${share.token}`); assert.equal(page.status, 200);
    const html = await page.text(); assert.match(html, /<h1>Shared heading<\/h1>/); assert.doesNotMatch(html, /<script/);
    assert.match(page.headers.get('cache-control'), /no-store/);
    const repeated = await request(route, json('POST', note)); assert.equal(repeated.status, 409); await repeated.text();
    await (await request(`/v1/notes/${note.id}`, json('PUT', { title: 'Private edit', content: 'Keep private' }))).text();
    assert.equal(await (await anon(`/s/${share.token}`)).text(), html);
    await (await request(route, json('DELETE', { token: share.token }))).text();
    const revoked = await anon(`/s/${share.token}`); assert.equal(revoked.status, 404); await revoked.text();
    const updated = (await (await request(`/v1/notes/${note.id}`)).json()).note;
    const renewed = (await (await request(route, json('POST', updated))).json()).share;
    await db.prepare('UPDATE note_shares SET expires_at = ? WHERE note_id = ?').bind(Date.now(), note.id).run();
    const expired = await anon(`/s/${renewed.token}`); assert.equal(expired.status, 404); await expired.text();
    const final = (await (await request(route, json('POST', updated))).json()).share;
    await (await request(`/v1/notes/${note.id}`, { method: 'DELETE' })).text();
    const deleted = await anon(`/s/${final.token}`); assert.equal(deleted.status, 404); await deleted.text();
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM note_shares').first()).n, 0);
  });

  await t.test('multipart upload, R2 ranges, HEAD, expiry and exact-key deletion agree', async () => {
    const form = new RuntimeFormData();
    form.set('file', new File(['0123456789'], '测试.txt', { type: 'text/plain' }));
    form.set('expiry', 'permanent');
    const uploaded = await request('/v1/files/upload', { method: 'POST', body: form });
    assert.equal(uploaded.status, 201);
    const { file } = await uploaded.json();
    const record = await db.prepare('SELECT * FROM files WHERE id=?').bind(file.id).first();
    assert.equal(record.expires_at, 0);
    assert.equal((await bucket.head(record.r2_key)).size, 10);
    await bucket.put('unrelated/keep', 'preserved');
    for (const [range, expected] of [['bytes=2-5', '2345'], ['bytes=-3', '789']]) {
      const partial = await request(`/f/${file.id}`, { headers: { Range: range } });
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get('content-length'), String(expected.length));
      assert.equal(await partial.text(), expected);
    }
    const head = await request(`/f/${file.id}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '10');
    assert.match(head.headers.get('content-disposition'), /filename\*=UTF-8''/);
    assert.equal(await head.text(), '');
    assert.equal((await db.prepare('SELECT download_count FROM files WHERE id=?').bind(file.id).first()).download_count, 0);
    const invalid = await request(`/f/${file.id}`, { headers: { Range: 'bytes=20-30' } });
    assert.equal(invalid.status, 416);
    await invalid.text();
    const full = await request(`/f/${file.id}`, { headers: { Range: 'bytes=2-5', 'If-Range': '"stale"' } });
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('cache-control'), 'private, no-store');
    assert.equal(await full.text(), '0123456789');
    await db.prepare('UPDATE files SET expires_at=1 WHERE id=?').bind(file.id).run();
    const expired = await request(`/f/${file.id}`);
    assert.equal(expired.status, 410);
    await expired.text();
    assert.equal((await (await request('/v1/files')).json()).totalSizeBytes, 10);
    const deleted = await request(`/v1/files/${file.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    await deleted.text();
    assert.equal(await bucket.head(record.r2_key), null);
    assert.equal(await (await bucket.get('unrelated/keep')).text(), 'preserved');
    assert.equal((await (await request('/v1/files')).json()).totalSizeBytes, 0);
  });

  await t.test('competing real D1 reservations keep total R2 storage within capacity', async () => {
    const upload = () => request('/v1/files/upload', { method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'x-filename': 'concurrent.txt', 'x-expiry': 'permanent' }, body: 'x'.repeat(700) });
    const responses = await Promise.all([upload(), upload()]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 413]);
    await Promise.all(responses.map(r => r.text()));
    assert.equal((await (await request('/v1/files')).json()).totalSizeBytes, 700);
    const objects = (await bucket.list({ prefix: 'transfers/' })).objects;
    assert.equal(objects.length, 1);
    assert.equal(objects[0].size, 700);
  });

  await t.test('a text share reuses the stored file and renders escaped content under the same access rules', async () => {
    const text = '<script>alert(1)</script>\n你好 & welcome';
    const uploaded = await request('/v1/files/upload', { method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', 'x-filename': 'share.txt', 'x-expiry': 'permanent' }, body: text });
    assert.equal(uploaded.status, 201);
    const { file } = await uploaded.json();
    const page = await request(`/t/${file.id}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(page.headers.get('cache-control'), 'private, no-store');
    const html = await page.text();
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('你好 &amp; welcome'));
    const denied = await request(`/t/${file.id}`, { headers: { 'cf-access-jwt-assertion': '' } });
    assert.equal(denied.status, 401); await denied.text();
    const deleted = await request(`/v1/files/${file.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200); await deleted.text();
    const revoked = await request(`/t/${file.id}`); assert.equal(revoked.status, 404); await revoked.text();
  });

  await t.test('formatted replies keep new text first, escape quotations and preserve thread headers', async () => {
    const response = await request('/v1/mail/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'recipient@example.invalid', subject: 'Re: Local check', text: 'New reply\n\nConfirmed.',
        inReplyTo: '<parent@example.invalid>', references: '<root@example.invalid> <parent@example.invalid>',
        quote: { from: 'sender@example.invalid', subject: 'Local check', receivedAt: 1791849600000, text: '<script>original</script>' } }) });
    assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.resendId, 'local-formatted-mail');
    assert.ok(outgoingMail.text.startsWith('New reply\n\nConfirmed.\n\n----- Original message -----'));
    assert.match(outgoingMail.html, /<blockquote type="cite"/);
    assert.ok(outgoingMail.html.includes('&lt;script&gt;original&lt;/script&gt;'));
    assert.equal(outgoingMail.headers['In-Reply-To'], '<parent@example.invalid>');
    assert.equal((await db.prepare('SELECT text FROM sent_mail WHERE id=?').bind(body.id).first()).text, outgoingMail.text);
  });

  await t.test('projects persist in real D1, reject stale edits/deletes and require Access', async () => {
    const payload = { id: crypto.randomUUID(), name: '真实项目', tagline: 'Persistent', description: '第一步\nNext step', status: 'Planning', externalUrl: 'https://example.com/project' };
    const post = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
    const denied = await request('/v1/projects', { ...post, headers: { ...post.headers, 'cf-access-jwt-assertion': '' } });
    assert.equal(denied.status, 401); await denied.text();
    const created = await request('/v1/projects', post); assert.equal(created.status, 201);
    const saved = (await created.json()).project;
    const retry = await request('/v1/projects', post); assert.equal(retry.status, 200); await retry.text();
    const list = await request('/v1/projects'); assert.equal((await list.json()).projects[0].id, saved.id);
    assert.equal((await db.prepare('SELECT description FROM workspace_projects WHERE id=?').bind(saved.id).first()).description, payload.description);
    const update = await request(`/v1/projects/${saved.id}`, { ...post, method: 'PUT', body: JSON.stringify({ ...payload, status: 'Completed', revision: 1 }) });
    assert.equal(update.status, 200); assert.equal((await update.json()).project.revision, 2);
    const stale = await request(`/v1/projects/${saved.id}`, { ...post, method: 'PUT', body: JSON.stringify({ ...payload, revision: 1 }) });
    assert.equal(stale.status, 409); await stale.text();
    const staleDelete = await request(`/v1/projects/${saved.id}`, { ...post, method: 'DELETE', body: JSON.stringify({ revision: 1 }) });
    assert.equal(staleDelete.status, 409); await staleDelete.text();
    const deleted = await request(`/v1/projects/${saved.id}`, { ...post, method: 'DELETE', body: JSON.stringify({ revision: 2 }) });
    assert.equal(deleted.status, 200); await deleted.text();
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM workspace_projects').first()).n, 0);
  });

  await t.test('Telegram webhook imports images and Unicode Markdown in workerd without weakening Access or duplicating records', async () => {
    const configured = await request('/v1/integrations/telegram', { method: 'POST' }); assert.equal(configured.status, 200); assert.equal((await configured.json()).telegram.enabled, true);
    const content = '# Telegram 笔记\r\n\r\n**完整正文**\n';
    telegramFiles.set('runtime_md', new Uint8Array(Buffer.concat([Buffer.from([255,254]), Buffer.from(content, 'utf16le')])));
    telegramFiles.set('runtime_photo', new Uint8Array([255,216,255,1,2,3,4]));
    const update = (id, attachment) => ({ update_id: id, message: { message_id: id, date: 1791936000, from: { id: telegramUser, is_bot: false }, chat: { id: telegramUser, type: 'private' }, ...attachment } });
    const post = (body, secret = telegramSecret) => request('/integrations/telegram/webhook', { method: 'POST', headers: { 'cf-access-jwt-assertion': '', 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(body) });
    const markdown = update(900, { document: { file_id: 'runtime_md', file_name: '真实笔记.md' } });
    const denied = await post(markdown, 'wrong'); assert.equal(denied.status, 401); await denied.text();
    const replies = await Promise.all([post(markdown), post(markdown), post(update(901, { photo: [{ file_id: 'runtime_photo', width: 640, height: 480 }] }))]);
    for (const response of replies) { assert.equal(response.status, 200); await response.text(); }
    for (let i = 0; i < 150; i++) { if ((await db.prepare("SELECT COUNT(*) n FROM telegram_jobs WHERE receipt_status='sent'").first()).n === 2) break; await new Promise(resolve => setTimeout(resolve, 30)); }
    const jobs = (await db.prepare('SELECT * FROM telegram_jobs ORDER BY message_id').all()).results;
    assert.equal(jobs.length, 2); assert.ok(jobs.every(job => job.status === 'done' && job.receipt_status === 'sent'), JSON.stringify(jobs.map(job => ({ status: job.status, result: job.result_text }))));
    const note = await db.prepare('SELECT * FROM notes WHERE id=?').bind(`telegram-${jobs[0].target_id}`).first(); assert.equal(note.title, '真实笔记'); assert.equal(note.content, content);
    const file = await db.prepare('SELECT * FROM files WHERE id=?').bind(jobs[1].target_id).first(); assert.equal(file.status, 'active'); assert.equal(file.expires_at, 0); assert.ok(file.r2_key.startsWith('webdav/'));
    const download = await request(`/f/${file.id}`); assert.deepEqual(new Uint8Array(await download.arrayBuffer()), telegramFiles.get('runtime_photo'));
    const protectedNotes = await request('/v1/notes', { headers: { 'cf-access-jwt-assertion': '', 'X-Telegram-Bot-Api-Secret-Token': telegramSecret } }); assert.equal(protectedNotes.status, 401); await protectedNotes.text();
    assert.equal(telegramReplies.length, 2);
    for (const route of [`/v1/notes/${note.id}`, `/v1/files/${file.id}`]) { const removed = await request(route, { method: 'DELETE' }); assert.equal(removed.status, 200); await removed.text(); }
    assert.equal((await db.prepare('SELECT status FROM files WHERE id=?').bind(file.id).first()).status, 'deleted');
    assert.ok(webdavFiles.has(webdavRoot + encodeURIComponent(file.r2_key.slice('webdav/'.length))), 'the permanent WebDAV original survives platform removal');
    const revoked = await request(`/f/${file.id}`); assert.equal(revoked.status, 404); await revoked.text();
    const replay = await post(markdown); assert.equal(replay.status, 200); await replay.text();
    assert.equal(await db.prepare('SELECT id FROM notes WHERE id=?').bind(note.id).first(), null);
  });

  await t.test('99 MB streams round trip through R2 and WebDAV; oversized and false lengths never activate', async () => {
    const largeRuntime = new Miniflare(convertV4MiniflareOptions({ ...runtimeOptions, bindings: { ...runtimeOptions.bindings, MAX_STORAGE_BYTES: '200000000' } }));
    try {
      await largeRuntime.ready;
      const send = (route, options = {}) => largeRuntime.dispatchFetch(`https://workspace.example.invalid${route}`, { ...options, headers: { 'cf-access-jwt-assertion': token(), ...options.headers } });
      const data = new Uint8Array(99_000_000).fill(73);
      data[0] = 11; data[data.length - 1] = 99;
      const expected = createHash('sha256').update(data).digest('hex');
      for (const backend of ['r2', 'webdav']) {
        const uploaded = await send(`/v1/files/upload?size=${data.length}&filename=large.bin&storageBackend=${backend}&expiry=permanent`, { method: 'POST', body: data });
        assert.equal(uploaded.status, 201, await uploaded.clone().text());
        const { file } = await uploaded.json(); assert.equal(file.sizeBytes, data.length);
        const download = await send(`/f/${file.id}`, { headers: { 'Accept-Encoding': 'identity' } }); assert.equal(download.status, 200); assert.equal(download.headers.get('content-length'), String(data.length), backend);
        const hash = createHash('sha256'), reader = download.body.getReader(); let size = 0;
        while (true) { const part = await reader.read(); if (part.done) break; hash.update(part.value); size += part.value.length; }
        assert.equal(size, data.length); assert.equal(hash.digest('hex'), expected);
        const range = await send(`/f/${file.id}`, { headers: { Range: 'bytes=98999990-98999999' } });
        assert.equal(range.status, 206); assert.deepEqual(new Uint8Array(await range.arrayBuffer()), data.slice(-10));
        const removed = await send(`/v1/files/${file.id}?deleteRemote=true`, { method: 'DELETE' }); assert.equal(removed.status, 200); await removed.text();
        const oversized = await send(`/v1/files/upload?size=99000001&storageBackend=${backend}`, { method: 'POST', body: 'x' });
        assert.equal(oversized.status, 413); await oversized.text();
        for (const declared of [2, 4]) {
          const wrong = await send(`/v1/files/upload?size=${declared}&storageBackend=${backend}`, { method: 'POST', body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1,2,3])); controller.close(); } }), duplex: 'half' });
          assert.ok(wrong.status >= 400, `false length activated: ${wrong.status}`); await wrong.text();
        }
      }
      const listing = await (await send('/v1/files')).json(); assert.deepEqual(listing.files, []);
    } finally { await largeRuntime.dispose(); }
  });
});
