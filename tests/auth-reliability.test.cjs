const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { fixture } = require('./worker-fixture.cjs');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { ACCESS_TEAM_DOMAIN: 'https://access.example.invalid', ACCESS_AUDIENCE: 'workspace', ACCESS_ADMIN_EMAIL: 'admin@example.invalid' };
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256' }] };
function request(overrides = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({alg:'RS256',kid:'test-key'})}.${encode({iss:env.ACCESS_TEAM_DOMAIN,aud:['workspace'],email:env.ACCESS_ADMIN_EMAIL,exp:Math.floor(Date.now()/1000)+300,...overrides})}`;
  return new Request('https://api.example.invalid/v1/notes/export', { headers: { 'Cf-Access-Jwt-Assertion': `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}` } });
}

test('unavailable Access keys fail closed as retryable 503 and do not poison the cache', async t => {
  const f = fixture(); t.after(() => f.close());
  const auth = f.load('workers/file-service/src/auth.ts'); let calls = 0;
  t.mock.method(global, 'fetch', async (_url, options) => {
    calls++; assert.equal(options.redirect, 'manual'); assert.ok(options.signal);
    return calls === 1 ? new Response('temporarily unavailable', {status:503}) : Response.json(jwks);
  });
  await assert.rejects(auth.resolveAuth(request(), env), error => error.status === 503 && /temporarily unavailable/.test(error.message));
  assert.equal((await auth.resolveAuth(request(), env)).authType, 'cf_access');
  assert.equal((await auth.resolveAuth(request(), env)).authType, 'cf_access');
  assert.equal(calls, 2, 'Successful public keys are cached; a failed fetch is not');
});

test('stalled Access key body is aborted within five seconds without accepting a token', async t => {
  const f = fixture(); t.after(() => f.close());
  const auth = f.load('workers/file-service/src/auth.ts');
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(AbortSignal, 'timeout', ms => {
    assert.equal(ms, 5000); const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out','TimeoutError')), ms);
    return controller.signal;
  });
  t.mock.method(global, 'fetch', async (_url,{signal}) => ({ok:true,json:() => new Promise((_,reject) => signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}));
  const rejected = assert.rejects(auth.resolveAuth(request(), env), error => error.status === 503);
  await new Promise(setImmediate); t.mock.timers.tick(5000); await rejected;
});

test('invalid identity, expiry and signature still cannot authenticate', async t => {
  const f = fixture(); t.after(() => f.close());
  const auth = f.load('workers/file-service/src/auth.ts');
  t.mock.method(global, 'fetch', async () => Response.json(jwks));
  for (const claims of [{email:'someone@example.invalid'},{aud:['wrong']},{exp:1},{iss:'https://wrong.invalid'}]) {
    assert.equal((await auth.resolveAuth(request(claims),env)).authType,'anonymous');
  }
  const invalid = request();
  const parts = invalid.headers.get('Cf-Access-Jwt-Assertion').split('.');
  parts[2] = 'A'.repeat(parts[2].length);
  invalid.headers.set('Cf-Access-Jwt-Assertion',parts.join('.'));
  assert.equal((await auth.resolveAuth(invalid,env)).authType,'anonymous');
});
