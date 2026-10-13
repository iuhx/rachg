const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label } = require('./component-fixture.cjs');
const expiry = Date.parse('2027-09-03T13:27:43Z');
const rdap = () => Response.json({ ldhName: 'RACHG.COM', events: [{ eventAction: 'expiration', eventDate: new Date(expiry).toISOString() }], entities: [{ secretContact: 'DO_NOT_EXPOSE_CONTACT' }] });
const api = () => ({ service: 'rachg-system-health', checkedAt: Date.now(), worker: { status: 'reachable' }, storage: { status: 'available', usedBytes: 100, limitBytes: 1000, availableBytes: 900, quotaScope: 'files' }, domain: { name: 'rachg.com', expiresAt: expiry, checkedAt: Date.now(), status: 'current' } });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('system health is private, reads actual file quota/R2 and never forwards credentials or arbitrary URLs', async t => {
  const f = fixture(); t.after(() => f.close()); let calls = 0, reads = 0;
  t.mock.method(global, 'fetch', async (url, options) => { calls++; assert.equal(url, 'https://rdap.verisign.com/com/v1/domain/rachg.com'); assert.equal(options.redirect, 'manual'); assert.equal(new Headers(options.headers).has('authorization'), false); assert.equal(new Headers(options.headers).has('cookie'), false); return rdap(); });
  f.env.RESEND_API_KEY = 'DO_NOT_EXPOSE_CREDENTIAL';
  assert.equal((await f.worker.fetch(new Request('https://fixture.invalid/v1/system-health'), f.env, f.ctx)).status, 401); assert.equal(calls, 0);
  await f.upload(100); t.mock.method(f.bucket, 'head', async key => { reads++; assert.equal(key, '__workspace_health_probe__'); return null; });
  const response = await f.request('/v1/system-health?url=https://foreign.invalid'); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/);
  const body = await response.json(); assert.deepEqual(body.worker, { status: 'reachable' });
  assert.deepEqual(body.storage, api().storage); assert.equal(body.domain.expiresAt, expiry);
  assert.doesNotMatch(JSON.stringify(body), /DO_NOT_EXPOSE|delete_token|r2_key/);
  assert.equal(f.objects.size, 1); assert.equal(reads, 1);
  await f.request('/v1/system-health'); assert.equal(calls, 1, 'warm registry cache avoids repeated lookups');
  assert.equal((await f.request('/v1/system-health', { method: 'POST' })).status, 405);
});

test('registry failure keeps working services available, and stale registry data is clearly marked', async t => {
  const f = fixture(); t.after(() => f.close()); let fail = false, now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(global, 'fetch', async () => { if (fail) throw Error('network unavailable'); return rdap(); });
  await f.request('/v1/system-health'); fail = true; now += 86_400_001;
  let result = await (await f.request('/v1/system-health')).json();
  assert.equal(result.worker.status, 'reachable'); assert.equal(result.storage.status, 'available'); assert.equal(result.domain.status, 'stale'); assert.equal(result.domain.expiresAt, expiry);
  now += 7 * 86_400_000;
  result = await (await f.request('/v1/system-health')).json(); assert.equal(result.domain.status, 'unavailable'); assert.equal(result.domain.expiresAt, null);
  t.mock.method(f.bucket, 'head', async () => { throw Error('R2 unavailable'); });
  result = await (await f.request('/v1/system-health')).json(); assert.equal(result.storage.status, 'unavailable'); assert.equal(result.worker.status, 'reachable');
});

test('database failure never reports a made-up full quota, and wrong-domain RDAP responses are rejected', async t => {
  const f = fixture(); t.after(() => f.close());
  t.mock.method(global, 'fetch', async () => Response.json({ ldhName: 'foreign.invalid', events: [{ eventAction: 'expiration', eventDate: new Date(expiry).toISOString() }] }));
  f.hooks.failSql = sql => sql.includes('SUM(size_bytes)');
  const result = await (await f.request('/v1/system-health')).json();
  assert.equal(result.worker.status, 'reachable'); assert.equal(result.storage.status, 'unavailable'); assert.equal(result.storage.usedBytes, null); assert.equal(result.storage.availableBytes, null); assert.equal(result.domain.expiresAt, null);
});

test('status client checks only the Worker endpoint and rejects login HTML and malformed payloads', async t => {
  const f = components(), service = f.load('apps/workspace/src/services/systemHealthService.ts'); let response = Response.json(api());
  t.mock.method(global, 'fetch', async (url, options) => { assert.equal(url, 'https://api.rachg.com/v1/system-health'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'manual'); return response; });
  let result = await service.fetchSystemHealth(); assert.equal(result.error, null); assert.ok(result.latencyMs >= 0);
  response = new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } });
  result = await service.fetchSystemHealth(); assert.ok(result.error); assert.equal(result.data, null); assert.equal(result.latencyMs, null);
  response = Response.json({ ...api(), storage: { ...api().storage, availableBytes: -1 } });
  result = await service.fetchSystemHealth(); assert.ok(result.error);
  response = new Response('', { status: 401 }); result = await service.fetchSystemHealth(); assert.match(result.error, /Sign in/);
});

test('health card retains cached domain data after failure but never keeps a stale green status or latency', async () => {
  const f = components(); let fail = false, pendingSignal;
  f.services.systemHealthService = { fetchSystemHealth: async signal => { pendingSignal = signal; return { data: fail ? null : api(), error: fail ? 'offline' : null, checkedAt: Date.now(), latencyMs: fail ? null : 20 }; } };
  const { SystemHealthCard } = f.load('apps/workspace/src/components/SystemHealthCard.tsx');
  const h = f.mount(SystemHealthCard, { canCheck: true }); await flush(); h.render();
  assert.equal(find(h, n => n.type?.name === 'Status').props.ok, true);
  assert.match(label(h.tree), /Status response · 20 ms/); assert.doesNotMatch(label(h.tree), /Pages|deployment|version|commit/i);
  fail = true; find(h, n => n.props['aria-label'] === 'Refresh system health').props.onClick(); await flush(); h.render();
  assert.equal(find(h, n => n.type?.name === 'Status').props.ok, false); assert.match(label(h.tree), /cached/); assert.match(label(h.tree), /Check unavailable/); assert.doesNotMatch(label(h.tree), /20 ms/);
  h.unmount(); assert.equal(pendingSignal.aborted, true);
});
