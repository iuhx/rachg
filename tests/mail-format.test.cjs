const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label } = require('./component-fixture.cjs');
const original = { id: 'original', from: 'sender@example.invalid', replyTo: 'reply@example.invalid', to: 'me@example.invalid', subject: 'Project update', text: 'Old message\nAn older quoted thread', preview: 'Old message', receivedAt: 1791849600000, messageId: '<parent@example.invalid>', references: '<root@example.invalid>' };
const quote = { from: original.from, subject: original.subject, receivedAt: original.receivedAt, text: original.text };
const button = (h, text) => find(h, n => n.type === 'button' && label(n) === text);
const field = (h, name) => find(h, n => n.props['aria-label'] === name);
function setup(onSend) {
  const f = components(), { MailView } = f.load('apps/workspace/src/components/MailView.tsx');
  const props = { messages: [original], sentMessages: [], selectedMessage: original, selectedSentMessage: null,
    isLoading: false, isMessageLoading: false, isSentLoading: false, isSentMessageLoading: false,
    onSelect() {}, onSelectSent() {}, onRefresh() {}, onRefreshSent() {}, onDelete: async () => {}, onSend };
  const h = f.mount(MailView, props); button(h, 'Reply').props.onClick(); h.render();
  return { ...f, h, props };
}
const submit = h => find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });

test('a reply starts empty and sends only new text by default while preserving threading', async () => {
  let sent;
  const f = setup(async payload => { sent = payload; });
  assert.equal(field(f.h, 'Message').props.value, '');
  assert.equal(find(f.h, n => n.props.type === 'checkbox').props.checked, false);
  field(f.h, 'Message').props.onChange({ target: { value: 'Thanks, I agree.\nNext steps tomorrow.' } }); f.h.render();
  await submit(f.h);
  assert.equal(sent.to, original.replyTo);
  assert.equal(sent.subject, 'Re: Project update');
  assert.equal(sent.text, 'Thanks, I agree.\nNext steps tomorrow.');
  assert.equal(sent.quote, undefined);
  assert.equal(sent.inReplyTo, original.messageId);
  assert.equal(sent.references, '<root@example.invalid> <parent@example.invalid>'); f.h.unmount();
});

test('explicit quotation stays separate and uses the original reply target snapshot', async () => {
  let sent; const f = setup(async payload => { sent = payload; });
  f.props.selectedMessage = { ...original, id: 'other', from: 'other@example.invalid', text: 'Unrelated private message' }; f.h.render();
  field(f.h, 'Message').props.onChange({ target: { value: 'My new reply' } });
  find(f.h, n => n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); f.h.render();
  await submit(f.h);
  assert.equal(sent.text, 'My new reply'); assert.deepEqual(sent.quote, quote); f.h.unmount();
});

test('selecting an original quote cannot send an empty new reply', async () => {
  let calls = 0; const f = setup(async () => { calls++; });
  find(f.h, n => n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); f.h.render();
  await submit(f.h); f.h.render();
  assert.equal(calls, 0); assert.match(label(f.h.tree), /recipient, subject and message are required/); f.h.unmount();
});

test('reply subjects and reference chains remain within API limits', () => {
  const f = components(), { replySubject, replyHeaders } = f.load('apps/workspace/src/utils/mailReply.ts');
  assert.equal(replySubject('Re: Existing'), 'Re: Existing');
  assert.equal(replySubject('x'.repeat(300)).length, 200);
  assert.ok(!/[\uD800-\uDBFF]$/.test(replySubject('x'.repeat(195) + '🌍')));
  const refs = Array.from({ length: 300 }, (_, n) => `<message-${n}@example.invalid>`).join(' ');
  const headers = replyHeaders({ ...original, references: `${original.messageId} ${refs}` });
  assert.ok(headers.references.length <= 4000); assert.ok(headers.references.endsWith(original.messageId));
  assert.equal(headers.references.split(original.messageId).length - 1, 1);
  assert.equal(replyHeaders({ ...original, messageId: '<bad>\r\nInjected: yes' }).inReplyTo, undefined);
});

async function withFixture(fn) { const f = fixture(); try { await fn(f); } finally { await f.close(); } }
const send = (f, payload) => f.request('/v1/mail/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'recipient@example.invalid', subject: 'Reply', text: 'New reply', ...payload }) });

test('provider receives clean HTML and plain text, with untrusted markup escaped', async t => withFixture(async f => {
  f.env.RESEND_API_KEY = 'local-fixture-only'; let delivered;
  t.mock.method(globalThis, 'fetch', async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); delivered = JSON.parse(options.body); return Response.json({ id: 'local-format-test' }); });
  const text = 'Hello <img src=x onerror=alert(1)>\n\nNew paragraph & details';
  assert.equal((await send(f, { text, inReplyTo: original.messageId, references: original.references, html: '<script>ignored</script>' })).status, 200);
  assert.equal(delivered.text, text);
  assert.ok(delivered.html.includes('Hello &lt;img src=x onerror=alert(1)&gt;<br><br>New paragraph &amp; details'));
  assert.ok(!delivered.html.includes('<script>')); assert.ok(!delivered.html.includes('<blockquote'));
  assert.equal(delivered.headers['In-Reply-To'], original.messageId);
  assert.equal(delivered.headers.References, original.references);
  assert.equal(f.sqlite.prepare('SELECT text FROM sent_mail').get().text, text);
}));

test('opt-in original is clearly separated in both HTML and saved plain-text fallback', async t => withFixture(async f => {
  f.env.RESEND_API_KEY = 'local-fixture-only'; let delivered;
  t.mock.method(globalThis, 'fetch', async (_, options) => { delivered = JSON.parse(options.body); return Response.json({ id: 'local-quote-test' }); });
  assert.equal((await send(f, { text: 'Only this is new', quote: { ...quote, subject: '<old subject>', text: '<script>old</script>\r\nSecond old line' } })).status, 200);
  assert.ok(delivered.text.startsWith('Only this is new\n\n----- Original message -----'));
  assert.ok(delivered.text.includes('> <script>old</script>\n> Second old line'));
  assert.ok(delivered.html.indexOf('Only this is new') < delivered.html.indexOf('<blockquote'));
  assert.match(delivered.html, /<blockquote type="cite"/);
  assert.ok(delivered.html.includes('&lt;old subject&gt;')); assert.ok(delivered.html.includes('&lt;script&gt;old&lt;/script&gt;'));
  assert.equal(f.sqlite.prepare('SELECT text FROM sent_mail').get().text, delivered.text);
  assert.equal(f.sqlite.prepare('SELECT preview FROM sent_mail').get().preview, 'Only this is new');
}));

test('malformed and oversized quotes are rejected before storage or provider calls', async t => withFixture(async f => {
  f.env.RESEND_API_KEY = 'local-fixture-only'; let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Must not send'); });
  for (const invalid of [null, [], { ...quote, receivedAt: 'yesterday' }, { ...quote, receivedAt: 9e15 }, { ...quote, from: 'a\nForged:' }, { ...quote, text: 'x'.repeat(200001) }]) {
    assert.equal((await send(f, { quote: invalid })).status, 400);
  }
  assert.equal((await send(f, { text: 'x'.repeat(999999), quote })).status, 400);
  assert.equal(calls, 0); assert.equal(f.queries.length, 0);
}));
