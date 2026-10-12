// Runs the generated release artifact in workerd with local D1/R2 and a mock JWKS endpoint.
// No Cloudflare account, production data or external mail service is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { generateKeyPairSync, sign } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const tempRoot = path.join(root, '.wrangler', 'runtime-tests');
fs.mkdirSync(tempRoot, { recursive: true });
process.env.TMP = process.env.TEMP = process.env.TMPDIR = tempRoot;
const wranglerRequire = createRequire(fs.realpathSync(path.join(root, 'workers/file-service/node_modules/wrangler/package.json')));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { Response: MockResponse, FormData: RuntimeFormData } = wranglerRequire('undici');

test('release Worker runs reliably in workerd with actual D1 and R2 bindings', { timeout: 60_000 }, async t => {
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
  const mf = new Miniflare(convertV4MiniflareOptions({
    rootPath: root, host: '127.0.0.1', port: 0, cf: false,
    modules: true, scriptPath: path.join(root, 'workers/file-service/cloudflare-editor-bundle/index.js'),
    compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], r2Buckets: ['FILES_BUCKET'], d1Persist: false, r2Persist: false,
    outboundService: async request => {
      assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`, 'Unexpected outbound network request');
      return MockResponse.json(jwks);
    },
    bindings: { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUDIENCE: 'local-workspace',
      ACCESS_ADMIN_EMAIL: 'admin@example.invalid', MAX_STORAGE_BYTES: '1000' },
  }));
  t.after(() => mf.dispose());
  await mf.ready;
  const auth = token();
  const request = (route, options = {}) => mf.dispatchFetch(`https://workspace.example.invalid${route}`, {
    ...options, headers: { 'cf-access-jwt-assertion': auth, ...options.headers },
  });
  const db = await mf.getD1Database('DB');
  const bucket = await mf.getR2Bucket('FILES_BUCKET');

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

  await t.test('private note CRUD persists Unicode and rejects foreign browser writes', async () => {
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
});
