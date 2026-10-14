const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const token = '987654321:fixture_token_not_a_real_secret_12345', owner = 6121514938;
const telegramRoot = `https://api.telegram.org/bot${token}/`;
const fileRoot = `https://api.telegram.org/file/bot${token}/`;
const davRoot = 'https://higa.teracloud.jp/dav/rachg/';

async function setup(t) {
  const f = fixture(); t.after(() => f.close());
  Object.assign(f.env, { TELEGRAM_ENABLED: 'true', TELEGRAM_BOT_TOKEN: token, TELEGRAM_ALLOWED_USER_ID: String(owner), TELEGRAM_BOT_USERNAME: 'rachgx_bot', WEBDAV_USERNAME: 'fixture-user', WEBDAV_PASSWORD: 'fixture-password' });
  const source = new Map(), remote = new Map(), calls = [], receipts = [];
  const behavior = { failDownload: false, failPut: false, losePutResponse: false, collision: false, failReceipt: false, wrongBot: false, customPath: null };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, method: init.method }); assert.equal(init.redirect, 'manual');
    if (url.startsWith(telegramRoot)) {
      const method = url.slice(telegramRoot.length), body = JSON.parse(init.body);
      if (method === 'getMe') return Response.json({ ok: true, result: { id: 987654321, username: behavior.wrongBot ? 'other_bot' : 'rachgx_bot', is_bot: true } });
      if (method === 'setWebhook') {
        assert.equal(body.url, 'https://rachg-file-service.haenlau.workers.dev/integrations/telegram/webhook');
        assert.match(body.secret_token, /^[a-f0-9]{64}$/); assert.equal(body.drop_pending_updates, false);
        assert.deepEqual(body.allowed_updates, ['message']); return Response.json({ ok: true, result: true });
      }
      if (method === 'getFile') {
        const content = source.get(body.file_id); assert.ok(content, body.file_id);
        return Response.json({ ok: true, result: { file_path: behavior.customPath || `documents/${body.file_id}`, file_size: content.byteLength } });
      }
      assert.equal(method, 'sendMessage'); assert.equal(body.chat_id, owner); assert.equal(body.parse_mode, undefined);
      assert.equal(body.link_preview_options.is_disabled, true); receipts.push(body.text);
      if (behavior.failReceipt) throw Error(`Network error ${telegramRoot}`);
      return Response.json({ ok: true, result: { message_id: 1000 + receipts.length } });
    }
    if (url.startsWith(fileRoot)) {
      assert.equal(init.headers['Accept-Encoding'], 'identity');
      if (behavior.failDownload) throw Error(`Network error ${fileRoot}`);
      const content = source.get(url.slice(fileRoot.length).split('/').pop());
      return new Response(content, { headers: { 'content-length': String(content.byteLength) } });
    }
    assert.ok(url.startsWith(davRoot), 'No arbitrary outbound requests');
    assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('fixture-user:fixture-password').toString('base64'));
    if (init.method === 'PUT') {
      assert.equal(init.headers['If-None-Match'], '*');
      if (behavior.collision) { remote.set(url, new TextEncoder().encode('foreign file')); return new Response(null, { status: 412 }); }
      if (behavior.failPut) return new Response(null, { status: 503 });
      remote.set(url, new Uint8Array(await new Response(init.body).arrayBuffer()));
      if (behavior.losePutResponse) throw Error('Connection lost after storing file');
      return new Response(null, { status: 201 });
    }
    if (init.method === 'DELETE') { remote.delete(url); return new Response(null, { status: 204 }); }
    const content = remote.get(url); if (!content) return new Response(null, { status: 404 });
    return new Response(init.method === 'HEAD' ? null : content, { headers: { 'content-length': String(content.byteLength), 'content-type': 'image/png' } });
  });
  const module = f.load('workers/file-service/src/telegram.ts'), client = f.load('workers/file-service/src/telegram-client.ts');
  const secret = await client.webhookSecret(token);
  const message = (id, attachment = {}) => ({ update_id: id, message: { message_id: id, date: 1791936000, from: { id: owner, is_bot: false }, chat: { id: owner, type: 'private' }, ...attachment } });
  const deliver = (payload, key = secret) => f.worker.fetch(new Request('https://fixture.invalid/integrations/telegram/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': key }, body: JSON.stringify(payload) }), f.env, f.ctx);
  const settle = async () => { await Promise.all(f.pending); };
  const retry = async id => { f.sqlite.prepare("UPDATE telegram_jobs SET next_attempt_at=0,lease_until=0 WHERE id=?").run(`987654321:${owner}:${id}`); await module.processTelegramJob(`987654321:${owner}:${id}`, f.env); };
  const putSource = (id, text) => source.set(id, typeof text === 'string' ? new TextEncoder().encode(text) : text);
  return { ...f, module, client, secret, source, remote, calls, receipts, behavior, message, deliver, settle, retry, putSource };
}

test('Telegram authentication is separate from Access and rejects other users, groups and edits before any storage work', async t => {
  const f = await setup(t);
  assert.equal((await f.deliver(f.message(1), 'wrong')).status, 401);
  for (const edit of [
    { from: { id: owner + 1, is_bot: false } }, { from: { id: String(owner), is_bot: false } },
    { chat: { id: owner, type: 'group' } }, { chat: { id: owner + 1, type: 'private' } }, { from: { id: owner, is_bot: true } },
  ]) assert.equal((await f.deliver(f.message(2, edit))).status, 200);
  assert.equal((await f.deliver({ update_id: 3, edited_message: f.message(3).message })).status, 200);
  assert.equal(f.queries.length, 0); assert.equal(f.calls.length, 0);
  assert.equal((await f.worker.fetch(new Request('https://fixture.invalid/v1/notes', { headers: { 'X-Telegram-Bot-Api-Secret-Token': f.secret } }), f.env, f.ctx)).status, 401);
  assert.equal((await f.worker.fetch(new Request('https://fixture.invalid/v1/integrations/telegram'), f.env, f.ctx)).status, 401);
});

test('Markdown imports preserve complete content; concurrent repeats and later replays never duplicate or recreate deleted notes', async t => {
  const f = await setup(t), content = '# 标题\r\n\r\n**正文** [链接](https://example.com)\n<script>literal</script>\n';
  f.putSource('md_one', content);
  const update = f.message(10, { document: { file_id: 'md_one', file_name: '会议记录.md', file_size: Buffer.byteLength(content) } });
  const responses = await Promise.all([f.deliver(update), f.deliver(update)]); assert.ok(responses.every(r => r.status === 200)); await f.settle();
  const notes = await (await f.request('/v1/notes')).json(); assert.equal(notes.notes.length, 1); assert.equal(notes.notes[0].title, '会议记录'); assert.equal(notes.notes[0].content, content);
  assert.equal(f.receipts.length, 1); assert.match(f.receipts[0], /已保存到 Notes/); assert.equal(f.remote.size, 0); assert.equal(f.objects.size, 0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM note_organization').get().n, 1);
  await f.request(`/v1/notes/${notes.notes[0].id}`, { method: 'DELETE' });
  await f.deliver(update); await f.settle(); assert.equal((await (await f.request('/v1/notes')).json()).notes.length, 0); assert.equal(f.receipts.length, 1);
});

test('photos and original image documents save to permanent WebDAV Files with the normal download/delete path', async t => {
  const f = await setup(t); f.putSource('photo_large', new Uint8Array([255,216,255,99,4,5])); f.putSource('png_doc', new Uint8Array([137,80,78,71,13,10,26,10]));
  await f.deliver(f.message(20, { photo: [{ file_id: 'small_not_requested', width: 40, height: 40 }, { file_id: 'photo_large', width: 100, height: 100 }] }));
  await f.deliver(f.message(21, { document: { file_id: 'png_doc', file_name: '原图.png', mime_type: 'image/png', file_size: 8 } })); await f.settle();
  const listed = await (await f.request('/v1/files')).json(); assert.equal(listed.files.length, 2); assert.equal(listed.totalSizeBytes, 0); assert.equal(f.objects.size, 0);
  for (const file of listed.files) {
    assert.equal(file.storageBackend, 'webdav'); assert.equal(file.expiresIn, 'Permanent');
    const downloaded = await f.request(`/f/${file.id}`); assert.equal(downloaded.status, 200); assert.equal((await downloaded.arrayBuffer()).byteLength, file.sizeBytes);
    assert.equal((await f.request(`/v1/files/${file.id}`, { method: 'DELETE' })).status, 200);
  }
  assert.equal(f.remote.size, 0); assert.equal(f.receipts.length, 2);
});

test('oversized, binary and unsupported documents return useful replies without false success', async t => {
  const f = await setup(t);
  f.putSource('bad_md', new Uint8Array([0,1,2]));
  for (const [id, document] of [[31, { file_id: 'large', file_name: 'large.md', file_size: 1_000_001 }], [32, { file_id: 'bad_md', file_name: 'bad.md', file_size: 3 }], [33, { file_id: 'pdf', file_name: 'doc.pdf' }], [34, { file_id: 'img', file_name: 'huge.png', file_size: 20_000_001 }]]) await f.deliver(f.message(id, { document }));
  await f.settle(); assert.equal(f.remote.size, 0); assert.equal(f.receipts.length, 4);
  assert.ok(f.receipts.some(text => text.includes('1MB'))); assert.ok(f.receipts.some(text => text.includes('20MB'))); assert.ok(f.receipts.some(text => text.includes('未保存成功')));
  assert.ok(f.receipts.every(text => !text.includes('已保存到')));
  assert.equal(f.calls.filter(call => call.url.includes('/getFile')).length, 1);
});

test('network failures retry durably, ambiguous WebDAV writes never publish twice and cleanup preserves unrelated files', async t => {
  const f = await setup(t); f.putSource('retry_image', new Uint8Array([1,2,3,4,5]));
  f.remote.set(davRoot + 'unrelated.png', new Uint8Array([7])); f.behavior.losePutResponse = true;
  await f.deliver(f.message(40, { document: { file_id: 'retry_image', file_name: 'retry.png' } })); await f.settle();
  assert.equal(f.sqlite.prepare('SELECT status FROM telegram_jobs').get().status, 'pending'); assert.equal(f.receipts.length, 0);
  assert.equal((await (await f.request('/v1/files')).json()).files.length, 0);
  f.behavior.losePutResponse = false; await f.retry(40);
  assert.equal((await (await f.request('/v1/files')).json()).files.length, 1); assert.equal(f.remote.size, 3);
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket, f.env);
  assert.equal(f.remote.size, 2); assert.ok(f.remote.has(davRoot + 'unrelated.png')); assert.equal(f.receipts.length, 1);
});

test('interrupted jobs resume under a lease and database transaction failures leave no partial note', async t => {
  const f = await setup(t); f.putSource('tx_md', '# Transaction');
  f.hooks.failSql = sql => /INSERT INTO note_organization/.test(sql);
  await f.deliver(f.message(50, { document: { file_id: 'tx_md', file_name: 'tx.md' } })); await f.settle();
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notes').get().n, 0); assert.equal(f.receipts.length, 0);
  f.hooks.failSql = null;
  f.sqlite.prepare("UPDATE telegram_jobs SET status='processing',lease_until=0").run();
  await f.retry(50); assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notes').get().n, 1); assert.equal(f.receipts.length, 1);
});

test('collisions do not delete foreign files and a lost reply does not trigger duplicate imports or replies', async t => {
  const f = await setup(t); f.putSource('collision', new Uint8Array([1,2,3])); f.behavior.collision = true;
  await f.deliver(f.message(60, { document: { file_id: 'collision', file_name: 'collision.png' } })); await f.settle();
  assert.equal(f.sqlite.prepare('SELECT status FROM files').get().status, 'purged');
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB, f.bucket, f.env); assert.equal(f.remote.size, 1);
  f.behavior.collision = false; f.behavior.failReceipt = true; await f.retry(60);
  assert.equal(f.receipts.length, 1); assert.equal(f.sqlite.prepare('SELECT receipt_status FROM telegram_jobs').get().receipt_status, 'unknown');
  await f.retry(60); assert.equal(f.receipts.length, 1); assert.equal((await (await f.request('/v1/files')).json()).files.length, 1);
  assert.ok(!f.receipts.join('\n').includes(token));
});

test('configuration verifies the intended bot and stores neither bot token nor webhook secret', async t => {
  const f = await setup(t);
  f.behavior.wrongBot = true; assert.equal(await f.module.configureTelegram(f.env), false); assert.equal(f.calls.filter(c => c.url.endsWith('/setWebhook')).length, 0);
  f.behavior.wrongBot = false; assert.equal(await f.module.configureTelegram(f.env), true); assert.equal(await f.module.configureTelegram(f.env), true);
  assert.equal(f.calls.filter(c => c.url.endsWith('/setWebhook')).length, 1);
  const status = await (await f.request('/v1/integrations/telegram')).json(); assert.equal(status.telegram.enabled, true);
  const serialized = JSON.stringify(status) + JSON.stringify(f.sqlite.prepare('SELECT * FROM telegram_config').all()); assert.ok(!serialized.includes(token)); assert.ok(!serialized.includes(f.secret));
});

test('unsafe Telegram download paths are rejected without following redirects or contacting third parties', async t => {
  const f = await setup(t); f.putSource('path', '# Safe');
  for (const path of ['../secret', 'https://example.com/file', '/documents/path', 'documents/../path']) {
    f.behavior.customPath = path;
    await assert.rejects(f.client.telegramFile(token, 'path', 1_000_000), /无效的文件地址/);
  }
  assert.equal(f.calls.filter(call => call.url.startsWith(fileRoot)).length, 0);
});

test('repeated interrupted jobs stop after three attempts and disabling the integration fails closed', async t => {
  const f = await setup(t); f.putSource('interrupted', '# Pending'); f.behavior.failDownload = true;
  await f.deliver(f.message(80, { document: { file_id: 'interrupted', file_name: 'pending.md' } })); await f.settle();
  f.sqlite.prepare("UPDATE telegram_jobs SET status='processing',attempts=3,lease_until=0").run();
  const downloads = f.calls.filter(call => call.url.startsWith(fileRoot)).length;
  await f.retry(80);
  assert.equal(f.calls.filter(call => call.url.startsWith(fileRoot)).length, downloads);
  assert.equal(f.sqlite.prepare('SELECT status FROM telegram_jobs').get().status, 'failed'); assert.equal(f.receipts.length, 1);
  f.env.TELEGRAM_ENABLED = 'false'; assert.equal((await f.deliver(f.message(81))).status, 401);
});
