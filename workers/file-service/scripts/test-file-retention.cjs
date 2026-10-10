// Local regression checks using the real Worker routes/SQL, SQLite and in-memory R2.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const modules = new Map();
function loadModule(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const file = path.join(__dirname, '..', 'src', `${name}.ts`);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (specifier) => {
    // Auth is controlled by the fixture; no real Access credentials are used.
    if (specifier === './auth') return {
      resolveAuth: async (request) => ({ authType: request.headers.has('test-auth') ? 'cf_access' : 'anonymous' }),
      isAuthenticated: (auth) => auth.authType === 'cf_access',
    };
    return specifier.startsWith('./') ? loadModule(specifier.slice(2)) : require(specifier);
  };
  new Function('require', 'exports', code)(localRequire, exports);
  return exports;
}

const sqlite = new DatabaseSync(':memory:');
const DB = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let parameters = [];
    return {
      bind(...values) { parameters = values; return this; },
      async run() { const result = statement.run(...parameters); return { meta: { changes: result.changes } }; },
      async first() { return statement.get(...parameters) || null; },
      async all() { return { results: statement.all(...parameters) }; },
    };
  },
};
const objects = new Map();
const FILES_BUCKET = {
  async put(key, body, options) { objects.set(key, { bytes: await new Response(body).arrayBuffer(), options }); return {}; },
  async get(key) {
    const object = objects.get(key);
    return object ? {
      body: object.bytes,
      httpEtag: 'test-etag',
      writeHttpMetadata(headers) { headers.set('Content-Type', object.options.httpMetadata.contentType); },
    } : null;
  },
  async delete(key) { objects.delete(key); },
};
const worker = loadModule('index').default;
const { getFileExpiry, isFileExpired } = loadModule('expiry');
const { getActiveStorageUsage } = loadModule('quota');
const env = { DB, FILES_BUCKET, MAX_STORAGE_BYTES: '1024' };
const tasks = [];
const ctx = { waitUntil(task) { tasks.push(task); } };
const request = (route, options = {}) => worker.fetch(new Request(`https://files.rachg.com${route}`, {
  ...options, headers: { 'test-auth': 'yes', ...options.headers },
}), env, ctx);
async function upload(expiry, name) {
  const form = new FormData();
  form.set('file', new File(['private content'], name, { type: 'text/plain' }));
  if (expiry) form.set('expiry', expiry);
  return request('/v1/files/upload', { method: 'POST', body: form });
}

(async () => {
  const now = Date.now();
  for (const [value, hours] of [['1 hour', 1], ['24 hours', 24], ['48 hours', 48], ['7 days', 168], [null, 48]]) {
    assert.equal(getFileExpiry(value, now), now + hours * 3600000);
  }
  assert.equal(getFileExpiry('permanent', now), 0);
  assert.equal(isFileExpired(0, now + 1000 * 365 * 86400000), false);
  assert.equal(isFileExpired(now, now), true);

  const anonymous = await worker.fetch(new Request('https://files.rachg.com/v1/files/upload', { method: 'POST' }), env, ctx);
  assert.equal(anonymous.status, 401);

  const response = await upload('permanent', 'kept.txt');
  assert.equal(response.status, 201);
  const { file } = await response.json();
  assert.equal(file.status, 'active');
  assert.equal(file.expiresIn, 'Permanent');
  assert.equal(file.expiresTimestamp, undefined);
  const row = sqlite.prepare('SELECT * FROM files WHERE id = ?').get(file.id);
  assert.equal(row.expires_at, 0);
  assert.equal(objects.get(row.r2_key).options.customMetadata.expiresAt, '0');

  const timedResponse = await upload('1 hour', 'temporary.txt');
  assert.equal(timedResponse.status, 201);
  const timed = (await timedResponse.json()).file;
  sqlite.prepare('UPDATE files SET expires_at = ? WHERE id = ?').run(Date.now() - 1, timed.id);
  const list = await (await request('/v1/files')).json();
  assert.deepEqual(list.files.map((item) => item.id), [file.id]);
  assert.equal(sqlite.prepare('SELECT status FROM files WHERE id = ?').get(timed.id).status, 'expired');
  assert.equal(await getActiveStorageUsage(DB), row.size_bytes);

  assert.equal((await request(`/v1/files/${file.id}`)).status, 200);
  const download = await request(`/f/${file.id}`);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'private content');
  assert.equal((await request(`/f/${timed.id}`)).status, 410);

  env.MAX_STORAGE_BYTES = String(row.size_bytes);
  assert.equal((await upload('permanent', 'over-quota.txt')).status, 413);
  assert.equal((await request(`/v1/files/${file.id}`, { method: 'DELETE' })).status, 200);
  assert.equal(objects.has(row.r2_key), false);
  assert.equal((await request(`/f/${file.id}`)).status, 404);
  assert.equal(await getActiveStorageUsage(DB), 0);
  await Promise.all(tasks);
  sqlite.close();
  console.log('PASS: retention options, permanent list/download, quota, deletion and anonymous rejection');
})().catch((error) => { sqlite.close(); console.error(error); process.exitCode = 1; });
