const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');

function setup(t) {
  const f = fixture();
  t.after(() => f.close());
  f.env.DOUYIN_API_BASE_URL = 'https://douyin.example.invalid';
  f.env.DOUYIN_API_KEY = 'local-fixture-secret';
  return f;
}

test('Douyin proxy is Access protected and refuses HTTP upstreams without making a request', async t => {
  const f = setup(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected outbound request'); });

  const anonymous = await f.worker.fetch(new Request('https://fixture.invalid/v1/tools/douyin/info?url=https%3A%2F%2Fv.douyin.com%2Fabc'), f.env, f.ctx);
  assert.equal(anonymous.status, 401);
  await anonymous.text();

  f.env.DOUYIN_API_BASE_URL = 'http://152.70.81.75:28080';
  const insecure = await f.request('/v1/tools/douyin/info?url=https%3A%2F%2Fv.douyin.com%2Fabc');
  assert.equal(insecure.status, 503);
  assert.match((await insecure.json()).error, /HTTPS/);
  assert.equal(calls, 0);
});

test('Douyin info sends the key only in the upstream header and returns bounded JSON', async t => {
  const f = setup(t);
  let requestUrl;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    requestUrl = new URL(input);
    assert.equal(new Headers(init.headers).get('x-api-key'), 'local-fixture-secret');
    assert.equal(requestUrl.searchParams.has('key'), false);
    assert.equal(requestUrl.searchParams.get('url'), '4.10 copied https://v.douyin.com/abc');
    assert.equal(init.redirect, 'manual');
    return Response.json({ meta: { title: 'A private test', author: 'Creator', duration: 12 }, candidate_urls: ['https://cdn.example.invalid/video.mp4'] });
  });

  const source = '4.10 copied https://v.douyin.com/abc';
  const response = await f.request('/v1/tools/douyin/info?url=' + encodeURIComponent(source));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { meta: { title: 'A private test', author: 'Creator', duration: 12 }, candidate_urls: ['https://cdn.example.invalid/video.mp4'] });
  assert.equal(requestUrl.origin, 'https://douyin.example.invalid');
});

test('Douyin download streams through HTTPS redirects without forwarding the API key', async t => {
  const f = setup(t);
  const calls = [];
  const bytes = new TextEncoder().encode('fixture mp4 bytes');
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    calls.push({ url, headers });
    if (url.origin === 'https://douyin.example.invalid') {
      assert.equal(headers.get('x-api-key'), 'local-fixture-secret');
      return new Response(null, { status: 302, headers: { Location: 'https://cdn.example.invalid/private-video' } });
    }
    assert.equal(url.origin, 'https://cdn.example.invalid');
    assert.equal(headers.has('x-api-key'), false);
    assert.equal(init.redirect, 'manual');
    return new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.byteLength), 'X-Douyin-Title': 'A video' } });
  });

  const response = await f.request('/v1/tools/douyin/download?url=' + encodeURIComponent('https://v.douyin.com/abc'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="douyin-video.mp4"');
  assert.equal(response.headers.get('x-douyin-title'), 'A video');
  assert.equal(response.headers.get('content-length'), String(bytes.byteLength));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(calls.length, 2);
});

test('Douyin download rejects insecure redirects and over-limit files', async t => {
  const f = setup(t);
  let mode = 'redirect';
  t.mock.method(globalThis, 'fetch', async () => mode === 'redirect'
    ? new Response(null, { status: 302, headers: { Location: 'http://cdn.example.invalid/video.mp4' } })
    : new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(500 * 1024 * 1024 + 1) } }));
  const insecure = await f.request('/v1/tools/douyin/download?url=https%3A%2F%2Fv.douyin.com%2Fabc');
  assert.equal(insecure.status, 502);
  await insecure.text();

  f.env.DOUYIN_API_BASE_URL = 'https://douyin.example.invalid';
  mode = 'oversized';
  const oversized = await f.request('/v1/tools/douyin/download?url=https%3A%2F%2Fv.douyin.com%2Fabc');
  assert.equal(oversized.status, 413);
  await oversized.text();
});
