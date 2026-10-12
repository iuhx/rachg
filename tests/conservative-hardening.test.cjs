const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { fixture } = require('./worker-fixture.cjs');

async function withFixture(fn) { const f = fixture(); try { await fn(f); } finally { await f.close(); } }

test('concurrent upload reservations cannot exceed capacity', () => withFixture(async f => {
  const responses = await Promise.all([f.upload(800), f.upload(800)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 413]);
  assert.equal(f.objects.size, 1);
  assert.equal((await f.request('/v1/files').then(r => r.json())).totalSizeBytes, 800);
}));

test('expired files remain accounted until exact-key cleanup succeeds; permanent/unrelated objects survive', () => withFixture(async f => {
  const permanent = await (await f.upload()).json();
  const timed = await (await f.upload(100, '1 hour')).json();
  f.sqlite.prepare('UPDATE files SET expires_at=? WHERE id=?').run(Date.now()-1,timed.file.id);
  f.objects.set('images/unrelated', { bytes: new ArrayBuffer(1) });
  const cleanup = f.load('workers/file-service/src/cleanup.ts').cleanupStorage;
  const quota = f.load('workers/file-service/src/quota.ts').getActiveStorageUsage;
  f.hooks.failDelete = true;
  assert.equal((await cleanup(f.DB,f.bucket)).failed,1);
  assert.equal(await quota(f.DB),200);
  f.hooks.failDelete = false;
  assert.equal((await cleanup(f.DB,f.bucket)).deleted,1);
  assert.equal(await quota(f.DB),100);
  assert.equal((await f.request(`/f/${permanent.file.id}`)).status,200);
  assert.equal((await f.request(`/f/${timed.file.id}`)).status,410);
  assert.ok(f.objects.has('images/unrelated'));
}));

test('storage delete failure does not report success or release bytes', () => withFixture(async f => {
  const {file}=await (await f.upload()).json(); f.hooks.failDelete=true;
  const response=await f.request(`/v1/files/${file.id}`,{method:'DELETE'});
  assert.equal(response.status,500);assert.equal(f.objects.size,1);
  assert.equal((await f.request('/v1/files').then(r=>r.json())).totalSizeBytes,100);
}));

test('database reservation failure cannot create an unindexed object', () => withFixture(async f => {
  f.hooks.failSql=sql=>/INSERT INTO files/.test(sql);
  assert.equal((await f.upload()).status,500);assert.equal(f.objects.size,0);
}));

test('failed upload is reserved until a stale reservation is cleaned', () => withFixture(async f => {
  f.hooks.failPut=true;assert.equal((await f.upload()).status,500);
  assert.equal(f.sqlite.prepare('SELECT status FROM files').get().status,'uploading');
  f.sqlite.prepare('UPDATE files SET created_at=0').run();f.hooks.failPut=false;
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB,f.bucket);
  assert.equal((await f.request('/v1/files').then(r=>r.json())).totalSizeBytes,0);
}));

test('raw body size uses actual bytes even without Content-Length', () => withFixture(async f => {
  const response=await f.request('/v1/files/upload',{method:'POST',body:'x'.repeat(1001),headers:{'content-type':'application/octet-stream'}});
  assert.equal(response.status,413);assert.equal(f.objects.size,0);
}));

test('schema initialization is shared and warm reads execute no DDL', () => withFixture(async f => {
  await Promise.all([f.request('/v1/files'),f.request('/v1/notes')]);
  const tableCreates=f.queries.filter(sql=>/CREATE TABLE IF NOT EXISTS files/.test(sql));assert.equal(tableCreates.length,1);
  f.queries.length=0;
  assert.equal((await f.request('/v1/notes')).status,200);
  assert.equal(f.queries.filter(sql=>/CREATE/.test(sql)).length,0);
}));

test('malformed scratchpad input cannot erase saved content', () => withFixture(async f => {
  const form=new FormData();form.set('content','keep this');
  assert.equal((await f.request('/v1/scratchpad',{method:'PUT',body:form})).status,200);
  const response=await f.request('/v1/scratchpad',{method:'PUT',body:'{}',headers:{'content-type':'application/json'}});
  assert.equal(response.status,415);
  assert.equal(f.sqlite.prepare('SELECT content FROM scratchpad').get().content,'keep this');
}));

test('SVG upload is rejected; legacy SVG cannot be served as an active document', () => withFixture(async f => {
  const form=new FormData();form.set('content','test');form.set('image',new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],'test.svg',{type:'image/svg+xml'}));
  assert.equal((await f.request('/v1/scratchpad',{method:'PUT',body:form})).status,400);
  await f.load('workers/file-service/src/db.ts').updateScratchpadRecord(f.DB,'test','scratchpad/legacy.svg');
  await f.bucket.put('scratchpad/legacy.svg','<svg/>',{httpMetadata:{contentType:'image/svg+xml'}});
  assert.equal((await f.request('/v1/scratchpad/image')).status,415);
}));

test('image replacement failure preserves old reference and defers unreferenced-image cleanup', () => withFixture(async f => {
  const save=name=>{const form=new FormData();form.set('content',name);form.set('image',new File([name],name+'.png',{type:'image/png'}));return f.request('/v1/scratchpad',{method:'PUT',body:form});};
  assert.equal((await save('old')).status,200);
  const old=f.sqlite.prepare('SELECT image_key FROM scratchpad').get().image_key;
  f.hooks.failSql=sql=>/^UPDATE scratchpad SET/.test(sql);
  assert.equal((await save('new')).status,500);
  assert.equal(f.sqlite.prepare('SELECT image_key FROM scratchpad').get().image_key,old);assert.ok(f.objects.has(old));
  f.hooks.failSql=null;f.sqlite.prepare('UPDATE scratchpad_cleanup SET not_before=0').run();
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB,f.bucket);
  assert.equal(f.objects.size,1);assert.ok(f.objects.has(old));
}));

test('image URL changes with its storage key and responses prohibit active content/caching', () => withFixture(async f => {
  const save=async name=>{const form=new FormData();form.set('content',name);form.set('image',new File([name],name+'.png',{type:'image/png'}));return (await f.request('/v1/scratchpad',{method:'PUT',body:form})).json();};
  const first=await save('first'),second=await save('second');assert.notEqual(first.scratchpad.imageUrl,second.scratchpad.imageUrl);
  const response=await f.request('/v1/scratchpad/image');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('content-security-policy'),/sandbox/);
}));

test('HTML-only mail conversion remains bounded on unfinished tags', () => withFixture(async f => {
  const {mailPlainText}=f.load('workers/common/content.ts');
  assert.equal(mailPlainText('<p>Hello &amp; goodbye</p><script>hidden</script><div>Visible</div>'),'Hello & goodbye\n\nVisible');
  const start=performance.now();assert.equal(mailPlainText('<script>'.repeat(130000)),'');
  assert.ok(performance.now()-start<2000,'Forward scan should not exhibit quadratic growth');
  assert.equal(mailPlainText('a'.repeat(1000),100).length,100);
  assert.equal(mailPlainText('İ<script>hidden</script>visible'),'İvisible');
}));

test('failed schema initialization is retried instead of cached as ready', () => withFixture(async f => {
  f.hooks.failSql=sql=>/CREATE INDEX/.test(sql);
  assert.equal((await f.request('/v1/notes')).status,500);
  f.hooks.failSql=null;
  assert.equal((await f.request('/v1/notes')).status,200);
}));

test('active-commit failure preserves a reserved object for later exact-key cleanup', () => withFixture(async f => {
  f.hooks.failSql=sql=>/UPDATE files SET status = 'active'/.test(sql);
  assert.equal((await f.upload()).status,500);assert.equal(f.objects.size,1);
  assert.equal(f.sqlite.prepare('SELECT status FROM files').get().status,'uploading');
  f.hooks.failSql=null;f.sqlite.prepare('UPDATE files SET created_at=0').run();
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB,f.bucket);
  assert.equal(f.objects.size,0);
}));

test('byte-bounded reader cancels oversized streams and note validation uses UTF-8 bytes', () => withFixture(async f => {
  const {readBounded}=f.load('workers/common/content.ts');let cancelled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}});
  await assert.rejects(readBounded(stream,20),/limit/);assert.equal(cancelled,true);
  const response=await f.request('/v1/notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'test',content:'字'.repeat(400000)})});
  assert.equal(response.status,400);
}));

test('received-mail parsing uses RFC From/Reply-To and rejects oversized input before storage', () => withFixture(async f => {
  const ingest=f.load('workers/mail-ingest/src/index.ts').default;
  let rejected=false;
  await ingest.email({to:'test@rachg.com',rawSize:6*1024*1024,setReject(){rejected=true;}},f.env,f.ctx);
  assert.ok(rejected);assert.equal(f.objects.size,0);
  const raw='From: human@example.invalid\r\nReply-To: reply@example.invalid\r\nTo: test@rachg.com\r\nSubject: test\r\nContent-Type: text/plain\r\n\r\nhello';
  await ingest.email({from:'bounce@example.invalid',to:'test@rachg.com',rawSize:Buffer.byteLength(raw),raw:new Response(raw).body},f.env,f.ctx);
  const row=f.sqlite.prepare('SELECT * FROM mail').get();assert.equal(row.from_address,'human@example.invalid');
  const response=await f.request(`/v1/mail/${row.id}`);assert.equal((await response.json()).message.replyTo,'reply@example.invalid');
}));

test('mail schema failure occurs before writing raw mail', () => withFixture(async f => {
  const ingest=f.load('workers/mail-ingest/src/index.ts').default;f.hooks.failSql=sql=>/CREATE TABLE/.test(sql);
  await assert.rejects(ingest.email({from:'a@example.invalid',to:'a@rachg.com',rawSize:30,raw:new Response('Subject: test\r\n\r\nhello').body},f.env,f.ctx));
  assert.equal(f.objects.size,0);
}));

test('identical deliveries create one mail record and capacity is released on deletion', () => withFixture(async f => {
  const ingest=f.load('workers/mail-ingest/src/index.ts').default;
  const raw='From: sender@example.invalid\r\nSubject: delivery\r\n\r\nhello';
  const message=()=>({from:'sender@example.invalid',to:'inbox@rachg.com',rawSize:Buffer.byteLength(raw),raw:new Response(raw).body});
  await ingest.email(message(),f.env,f.ctx);await ingest.email(message(),f.env,f.ctx);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM mail').get().n,1);assert.equal(f.objects.size,1);
  const row=f.sqlite.prepare('SELECT * FROM mail').get();
  assert.equal((await f.request(`/v1/mail/${row.id}`,{method:'DELETE'})).status,200);
  assert.equal(f.sqlite.prepare('SELECT state FROM mail_ingestions').get().state,'purged');assert.equal(f.objects.size,0);
  await ingest.email(message(),f.env,f.ctx);assert.equal(f.objects.size,0);
}));

test('mail capacity refusal writes no object and stale failed deliveries are reconciled', () => withFixture(async f => {
  const ingest=f.load('workers/mail-ingest/src/index.ts').default;
  const raw='Subject: test\r\n\r\nhello';
  const message=()=>({from:'sender@example.invalid',to:'inbox@rachg.com',rawSize:Buffer.byteLength(raw),raw:new Response(raw).body});
  f.env.MAX_MAIL_STORAGE_BYTES='1';await assert.rejects(ingest.email(message(),f.env,f.ctx),/budget/);assert.equal(f.objects.size,0);
  f.env.MAX_MAIL_STORAGE_BYTES='1000';f.hooks.failPut=true;
  await assert.rejects(ingest.email(message(),f.env,f.ctx));assert.equal(f.sqlite.prepare('SELECT state FROM mail_ingestions').get().state,'pending');
  f.hooks.failPut=false;f.sqlite.prepare('UPDATE mail_ingestions SET created_at=0').run();
  await f.load('workers/file-service/src/cleanup.ts').cleanupStorage(f.DB,f.bucket);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM mail_ingestions').get().n,0);
}));

test('unauthenticated requests remain rejected before private writes', () => withFixture(async f => {
  const response=await f.worker.fetch(new Request('https://fixture.invalid/v1/files/upload',{method:'POST'}),f.env,f.ctx);
  assert.equal(response.status,401);assert.equal(f.objects.size,0);assert.equal(f.queries.length,0);
}));

test('authenticated browser writes reject foreign Origin before accessing storage', () => withFixture(async f => {
  const response=await f.request('/v1/files/upload',{method:'POST',headers:{Origin:'https://untrusted.invalid'},body:'test'});
  assert.equal(response.status,403);assert.equal(f.queries.length,0);assert.equal(f.objects.size,0);
}));

test('download byte ranges, suffix ranges and HEAD return correct metadata without counting partial reads', () => withFixture(async f => {
  const {file}=await (await f.upload(100)).json();
  const route=`/f/${file.id}`;
  const partial=await f.request(route,{headers:{Range:'bytes=10-19'}});
  assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 10-19/100');assert.equal((await partial.arrayBuffer()).byteLength,10);
  const suffix=await f.request(route,{headers:{Range:'bytes=-7'}});
  assert.equal(suffix.status,206);assert.equal(suffix.headers.get('content-length'),'7');
  const head=await f.request(route,{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'100');assert.equal(await head.text(),'');
  assert.equal(f.sqlite.prepare('SELECT download_count FROM files').get().download_count,0);
}));

test('invalid ranges return 416 while a stale If-Range returns the complete object', () => withFixture(async f => {
  const {file}=await (await f.upload(100)).json();const route=`/f/${file.id}`;
  for(const range of ['bytes=200-300','bytes=-0','bytes=20-10','bytes=0-1,3-4','bytes=9007199254740992-']) {
    const response=await f.request(route,{headers:{Range:range}});assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),'bytes */100');
  }
  const full=await f.request(route,{headers:{Range:'bytes=0-9','If-Range':'"stale"'}});
  assert.equal(full.status,200);assert.equal((await full.arrayBuffer()).byteLength,100);
}));
