const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');

async function withFixture(fn) {
  const f = fixture();
  try { await fn(f); } finally { await f.close(); }
}
const cleanup = f => f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket);
const message = () => {
  const raw = 'From: sender@example.invalid\r\nSubject: race regression\r\n\r\nhello';
  return { from: 'sender@example.invalid', to: 'inbox@rachg.com', rawSize: Buffer.byteLength(raw), raw: new Response(raw).body };
};
const send = f => f.request('/v1/mail/send', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ to: 'recipient@example.invalid', subject: 'Local test', text: 'No real email is sent.' }),
});

test('cleanup cannot delete a permanent upload completed after candidate selection', () => withFixture(async f => {
  const { file } = await (await f.upload()).json();
  f.sqlite.prepare("UPDATE files SET status='uploading', created_at=0 WHERE id=?").run(file.id);
  let claimed = false;
  f.hooks.beforeSql = sql => {
    if (/UPDATE files SET status = 'purging'/.test(sql)) {
      claimed = true;
      f.sqlite.prepare("UPDATE files SET status='active' WHERE id=?").run(file.id);
    }
  };
  assert.deepEqual(await cleanup(f), { deleted: 0, failed: 0 });
  assert.ok(claimed);
  assert.equal((await f.request(`/f/${file.id}`)).status, 200);
  assert.equal(f.objects.size, 1);
}));

test('cleanup claimed before upload completion prevents activation and success response', () => withFixture(async f => {
  f.hooks.afterPut = async () => {
    f.sqlite.prepare('UPDATE files SET created_at=0').run();
    assert.equal((await cleanup(f)).deleted, 1);
  };
  assert.equal((await f.upload()).status, 500);
  assert.equal(f.sqlite.prepare('SELECT status FROM files').get().status, 'purged');
  assert.equal(f.objects.size, 0);
}));

test('failed physical deletion keeps purging bytes reserved until retry succeeds', () => withFixture(async f => {
  const { file } = await (await f.upload(100, '1 hour')).json();
  f.sqlite.prepare('UPDATE files SET expires_at=1 WHERE id=?').run(file.id);
  f.hooks.failDelete = true;
  assert.equal((await cleanup(f)).failed, 1);
  assert.equal(f.sqlite.prepare('SELECT status FROM files').get().status, 'purging');
  assert.equal((await f.request(`/f/${file.id}`)).status, 410);
  assert.equal((await (await f.request('/v1/files')).json()).totalSizeBytes, 100);
  f.hooks.failDelete = false;
  assert.equal((await cleanup(f)).deleted, 1);
  assert.equal(f.objects.size, 0);
}));

test('a full cold cleanup batch stays within 50 storage calls', () => withFixture(async f => {
  f.env.MAX_STORAGE_BYTES = '10000';
  for (let i = 0; i < 6; i++) await f.upload(10, '1 hour');
  f.sqlite.prepare('UPDATE files SET expires_at=1').run();
  for (let i = 0; i < 2; i++) {
    const key = `mail/stale-${i}`;
    f.sqlite.prepare('INSERT INTO mail_ingestions (id,r2_key,size_bytes,created_at) VALUES (?,?,1,0)').run(`stale-${i}`, key);
    await f.bucket.put(key, 'mail', {});
  }
  const start = f.queries.length;
  let storageCalls = 0;
  const bucket = { ...f.bucket, async delete(key) { storageCalls++; return f.bucket.delete(key); } };
  const coldDB = { ...f.DB };
  const [result] = await Promise.all([
    f.load('workers/file-service/src/cleanup.ts').cleanupStorage(coldDB, bucket),
    f.load('workers/file-service/src/note-shares.ts').cleanupNoteShares(coldDB),
  ]);
  assert.deepEqual(result, { deleted: 7, failed: 0 });
  assert.equal(f.queries.length - start + storageCalls, 39);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM files WHERE status='active'").get().n, 1);
}));

test('incoming delivery cannot commit after cleanup claims its reservation', () => withFixture(async f => {
  const ingest = f.load('workers/mail-ingest/src/index.ts').default;
  f.hooks.afterPut = async () => {
    f.sqlite.prepare('UPDATE mail_ingestions SET created_at=0').run();
    f.hooks.failDelete = true;
    assert.equal((await cleanup(f)).failed, 1);
    f.hooks.failDelete = false;
  };
  await assert.rejects(ingest.email(message(), f.env, f.ctx), /reclaimed/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM mail').get().n, 0);
  assert.equal(f.objects.size, 0);
  assert.equal((await cleanup(f)).deleted, 1);
}));

test('an old delivery completing late cannot delete or index a newer retry object', () => withFixture(async f => {
  const ingest = f.load('workers/mail-ingest/src/index.ts').default;
  let firstKey;
  f.hooks.afterPut = async key => {
    firstKey = key;
    f.hooks.afterPut = null;
    f.sqlite.prepare('UPDATE mail_ingestions SET created_at=0').run();
    assert.equal((await cleanup(f)).deleted, 1);
    await ingest.email(message(), f.env, f.ctx);
  };
  await assert.rejects(ingest.email(message(), f.env, f.ctx), /reclaimed/);
  const saved = f.sqlite.prepare('SELECT r2_key FROM mail').get();
  assert.notEqual(saved.r2_key, firstKey);
  assert.equal(f.sqlite.prepare('SELECT state FROM mail_ingestions').get().state, 'stored');
  assert.ok(f.objects.has(saved.r2_key));
  assert.equal(f.objects.size, 1);
}));

test('mail indexing and reservation completion roll back together on database failure', () => withFixture(async f => {
  const ingest = f.load('workers/mail-ingest/src/index.ts').default;
  f.hooks.failSql = sql => /UPDATE mail_ingestions SET state = 'stored'/.test(sql);
  await assert.rejects(ingest.email(message(), f.env, f.ctx), /database failure/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM mail').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT state FROM mail_ingestions').get().state, 'pending');
  f.hooks.failSql = null;
  f.sqlite.prepare('UPDATE mail_ingestions SET created_at=0').run();
  assert.equal((await cleanup(f)).deleted, 1);
  assert.equal(f.objects.size, 0);
}));

test('provider acceptance followed by database failure still returns success and retries only bookkeeping', async t => withFixture(async f => {
  f.env.RESEND_API_KEY = 'local-fixture-only';
  let calls = 0, writes = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ id: 'local-provider-id' }); });
  f.hooks.failSql = sql => /UPDATE sent_mail SET/.test(sql) && ++writes === 1;
  const response = await send(f);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).resendId, 'local-provider-id');
  await Promise.all(f.pending);
  assert.equal(calls, 1);
  assert.equal(writes, 2);
  assert.equal(f.sqlite.prepare('SELECT status FROM sent_mail').get().status, 'sent');
}));

test('persistent bookkeeping failure never changes accepted mail into failure', async t => withFixture(async f => {
  f.env.RESEND_API_KEY = 'local-fixture-only';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ id: 'accepted-id' }); });
  f.hooks.failSql = sql => /UPDATE sent_mail SET/.test(sql);
  assert.equal((await send(f)).status, 200);
  await Promise.all(f.pending);
  assert.equal(calls, 1);
  assert.equal(f.sqlite.prepare('SELECT status FROM sent_mail').get().status, 'sending');
}));

test('ambiguous provider network outcomes are shown as unconfirmed without resending', async t => withFixture(async f => {
  f.env.RESEND_API_KEY = 'local-fixture-only';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Connection lost after request'); });
  const response = await send(f);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.code, 'MAIL_STATUS_UNKNOWN');
  assert.match(body.error, /before sending.*again/);
  assert.equal(f.sqlite.prepare('SELECT status FROM sent_mail').get().status, 'unknown');
  assert.equal(calls, 1);
}));

test('provider rejection, server error and invalid success responses have distinct outcomes', async t => withFixture(async f => {
  f.env.RESEND_API_KEY = 'local-fixture-only';
  let status = 422;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'fixture' }, { status }));
  for (const [http, expected] of [[422, 'MAIL_SEND_FAILED'], [408, 'MAIL_STATUS_UNKNOWN'], [503, 'MAIL_STATUS_UNKNOWN'], [200, 'MAIL_STATUS_UNKNOWN']]) {
    status = http;
    assert.equal((await (await send(f)).json()).code, expected);
  }
}));
