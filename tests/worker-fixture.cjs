const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const workerRequire = createRequire(path.join(root, 'workers/file-service/package.json'));
const ts = workerRequire('typescript');

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const objects = new Map(), queries = [], pending = [], cache = new Map();
  const hooks = { failSql: null, failDelete: false, failPut: false };
  const DB = { prepare(sql) {
    let args = [];
    const execute = async (kind) => {
      queries.push(sql);
      if (hooks.failSql?.(sql, args)) throw new Error('fixture database failure');
      const stmt = sqlite.prepare(sql);
      if (kind === 'run') return { meta: { changes: stmt.run(...args).changes } };
      if (kind === 'all') return { results: stmt.all(...args) };
      return stmt.get(...args) || null;
    };
    return { bind(...values) { args = values; return this; }, run: () => execute('run'), all: () => execute('all'), first: () => execute('first') };
  } };
  DB.batch = async (statements) => {
    sqlite.exec('BEGIN');
    try { const results=[]; for(const statement of statements)results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  };
  const bucket = {
    async put(key, body, options) {
      if (hooks.failPut) throw new Error('fixture storage failure');
      const bytes = await new Response(body).arrayBuffer(); objects.set(key, { bytes, options }); return { size: bytes.byteLength };
    },
    async get(key, options) {
      const stored = objects.get(key);
      const range = options?.range;
      return stored ? { size: stored.bytes.byteLength, body: range ? stored.bytes.slice(range.offset, range.offset + range.length) : stored.bytes, httpEtag: '"fixture"', arrayBuffer: async () => stored.bytes,
        writeHttpMetadata(headers) { headers.set('Content-Type', stored.options.httpMetadata.contentType); } } : null;
    },
    async head(key) { return this.get(key); },
    async delete(key) { if (hooks.failDelete) throw new Error('fixture delete failure'); objects.delete(key); },
  };
  function load(file) {
    file = path.isAbsolute(file) ? file : path.join(root, file);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = (specifier) => {
      if (specifier === './auth') return { resolveAuth: async r => ({ authType: r.headers.has('fixture-auth') ? 'cf_access' : 'anonymous' }), isAuthenticated: a => a.authType === 'cf_access' };
      return specifier.startsWith('.') ? load(path.resolve(path.dirname(file), specifier + '.ts')) : workerRequire(specifier);
    };
    new Function('require', 'exports', code)(localRequire, exports);
    return exports;
  }
  const worker = load('workers/file-service/src/index.ts').default;
  const env = { DB, FILES_BUCKET: bucket, MAX_STORAGE_BYTES: '1000' };
  const ctx = { waitUntil(p) { pending.push(p); } };
  const request = (route, options = {}) => worker.fetch(new Request(`https://fixture.invalid${route}`, { ...options, headers: { 'fixture-auth': 'local', ...options.headers } }), env, ctx);
  const upload = (size = 100, expiry = 'permanent') => {
    const form = new FormData(); form.set('file', new File(['x'.repeat(size)], 'fixture.txt', { type: 'text/plain' })); form.set('expiry', expiry);
    return request('/v1/files/upload', { method: 'POST', body: form });
  };
  return { sqlite, objects, queries, hooks, DB, bucket, env, ctx, worker, request, upload, load,
    async close() { await Promise.allSettled(pending); sqlite.close(); } };
}
module.exports = { fixture };
