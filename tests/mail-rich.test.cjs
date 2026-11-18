const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./worker-fixture.cjs');
const { components, find, label } = require('./component-fixture.cjs');

const boundary = 'bnd_mail_test';
const rawEmail = [
  'MIME-Version: 1.0',
  'From: newsletter@example.invalid',
  'To: me@rachg.com',
  'Subject: Rich formatting test',
  'Content-Type: multipart/related; boundary=' + boundary,
  '',
  '--' + boundary,
  'Content-Type: text/html; charset=utf-8',
  '',
  '<h1>Hello World</h1><p>Image: <img src="cid:img-test-123"></p>',
  '',
  '--' + boundary,
  'Content-Type: image/png',
  'Content-ID: <img-test-123>',
  'Content-Disposition: inline; filename="pixel.png"',
  'Content-Transfer-Encoding: base64',
  '',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  '--' + boundary,
  'Content-Type: text/plain',
  'Content-Disposition: attachment; filename="notes.txt"',
  'Content-Transfer-Encoding: base64',
  '',
  'SGVsbG8gYXR0YWNobWVudA==',
  '--' + boundary + '--',
  ''
].join('\r\n');

test('GET /v1/mail/:id parses HTML, inlines CID images and extracts regular attachments', async () => {
  const f = fixture();
  try {
    const ingest = f.load('workers/mail-ingest/src/index.ts').default;
    const rawBuffer = Buffer.from(rawEmail);
    await ingest.email({
      from: 'newsletter@example.invalid',
      to: 'me@rachg.com',
      rawSize: rawBuffer.byteLength,
      raw: new Response(rawBuffer).body
    }, f.env, f.ctx);

    const row = f.sqlite.prepare('SELECT id FROM mail').get();
    assert.ok(row && row.id, 'Mail record should be saved');

    const res = await f.request(`/v1/mail/${row.id}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.success);
    assert.equal(body.message.subject, 'Rich formatting test');
    assert.ok(body.message.html.includes('data:image/png;base64,'), 'CID image should be inlined as data URL');
    assert.ok(Array.isArray(body.message.attachments), 'Attachments array should exist');
    assert.equal(body.message.attachments.length, 2, 'All attachments including inline should be returned');
    assert.equal(body.message.attachments[0].disposition, 'inline');
    assert.equal(body.message.attachments[1].disposition, 'attachment');
    assert.equal(body.message.attachments[1].filename, 'notes.txt');
    assert.ok(body.message.attachments[1].dataUrl.startsWith('data:text/plain;base64,'), 'Attachment dataUrl should exist');
  } finally {
    await f.close();
  }
});

test('MailView switches between rich and plain text and renders attachments with downloads', () => {
  const f = components(), { MailView } = f.load('apps/workspace/src/components/MailView.tsx');
  const sample = {
    id: 'm1',
    from: 'newsletter@example.invalid',
    to: 'me@rachg.com',
    subject: 'Rich formatting test',
    receivedAt: 1791849600000,
    preview: 'Hello World',
    text: 'Hello World Image: [image]',
    html: '<h1>Hello World</h1><p>Rich styled text</p>',
    attachments: [{
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      disposition: 'attachment',
      dataUrl: 'data:application/pdf;base64,AAAA'
    }]
  };
  const props = {
    messages: [sample], sentMessages: [], selectedMessage: sample, selectedSentMessage: null,
    isLoading: false, isMessageLoading: false, isSentLoading: false, isSentMessageLoading: false,
    onSelect() {}, onSelectSent() {}, onRefresh() {}, onRefreshSent() {}, onDelete: async () => {}, onSend: async () => {}
  };
  const h = f.mount(MailView, props);
  assert.ok(label(h.tree).includes('Rich'));
  assert.ok(label(h.tree).includes('Plain'));
  assert.ok(label(h.tree).includes('Attachments (1)'));
  assert.ok(label(h.tree).includes('document.pdf'));

  // Switch to plain mode
  const plainBtn = find(h, n => n.type === 'button' && label(n) === 'Plain');
  plainBtn.props.onClick(); h.render();
  assert.ok(label(h.tree).includes('Hello World Image: [image]'));
  h.unmount();
});
