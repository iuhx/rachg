const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { components, find, label, elements } = require('./component-fixture.cjs');
const { fixture } = require('./worker-fixture.cjs');
const req = createRequire(path.resolve(__dirname, '../apps/workspace/package.json'));
const decodeQr = req('jsqr');
const fileItem = id => ({ id, name: `${id}.txt`, size: '10 B', sizeBytes: 10, updatedAt: 'now', status: 'active', shareUrl: `https://files.example.invalid/f/${id}`, expiresIn: 'Permanent' });
const button = (h, text) => find(h, n => n.type === 'button' && label(n) === text);
const input = (h, name) => find(h, n => n.props['aria-label'] === name);
const editQr = (h, value) => { find(h, n => n.props.id === 'qr-input').props.onChange({ target: { value } }); h.render(); };
function setup(overrides = {}) {
  const f = components();
  const { ToolsView } = f.load('apps/workspace/src/components/ToolsView.tsx');
  const props = { files: [], fileRequest: null, canUpload: true, onUploadFile: async () => fileItem('uploaded'), ...overrides };
  return { ...f, props, h: f.mount(ToolsView, props) };
}

test('locally generated QR pixels decode to exact Unicode text and URLs', () => {
  const f = components();
  const { createQr, qrPixels } = f.load('apps/workspace/src/utils/qr.ts');
  for (const text of ['你好，世界 🌍\n第二段', 'https://example.com/a?x=1&y=%E4%B8%AD', '  preserve whitespace  ', '字'.repeat(700)]) {
    const qr = createQr(text); assert.equal(qr.kind, 'ready');
    const { pixels, width } = qrPixels(qr.matrix);
    assert.equal(decodeQr(pixels, width, width).data, text);
  }
  assert.equal(createQr('字'.repeat(734)).kind, 'too-long');
  assert.equal(createQr(' '.repeat(10)).kind, 'empty');
  assert.equal(createQr('\ud800').kind, 'error');
});

test('Douyin downloader inspects copied share text and offers the authenticated streaming endpoint', async () => {
  const f = components();
  f.services.apiRead = { AuthenticationRequiredError: class AuthenticationRequiredError extends Error {} };
  f.services.douyinService = {
    fetchDouyinInfo: async link => ({ meta: { title: 'Test video', author: 'Creator', duration: 12, resolution: '1080p', likes: 42 }, candidate_urls: ['https://cdn.example.invalid/video.mp4'] , receivedLink: link }),
    douyinDownloadUrl: link => 'https://api.example.invalid/v1/tools/douyin/download?url=' + encodeURIComponent(link),
  };
  const { DouyinDownloader } = f.load('apps/workspace/src/components/DouyinDownloader.tsx');
  const h = f.mount(DouyinDownloader, { canDownload: true, isActive: true, webdavAvailable: true, onUploadFile: async () => fileItem('saved') });
  const source = '4.10 copied https://v.douyin.com/abc';
  find(h, n => n.props.id === 'douyin-link').props.onChange({ target: { value: source } }); h.render();
  await find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); h.render();
  assert.match(label(h.tree), /Test video/); assert.match(label(h.tree), /Creator/); assert.match(label(h.tree), /1080p/);
  const download = find(h, n => n.type === 'a' && n.props['aria-label'] === 'Download Douyin video');
  assert.equal(download.props.href, 'https://api.example.invalid/v1/tools/douyin/download?url=' + encodeURIComponent(source));
  h.unmount();
});

test('Douyin save defaults to WebDAV and permanently uploads the fetched File into Files', async () => {
  const f = components();
  f.services.apiRead = { AuthenticationRequiredError: class AuthenticationRequiredError extends Error {} };
  const uploaded = [];
  const savedFile = new File(['video'], 'A safe title.mp4', { type: 'video/mp4' });
  f.services.douyinService = {
    fetchDouyinInfo: async () => ({ meta: { title: 'A safe title' }, candidate_urls: [] }),
    douyinDownloadUrl: () => 'https://api.example.invalid/download',
    fetchDouyinFile: async (link, title) => { assert.equal(link, 'https://v.douyin.com/abc'); assert.equal(title, 'A safe title'); return savedFile; },
  };
  const { DouyinDownloader } = f.load('apps/workspace/src/components/DouyinDownloader.tsx');
  const h = f.mount(DouyinDownloader, {
    canDownload: true, isActive: true, webdavAvailable: true,
    onUploadFile: async (...args) => { uploaded.push(args); return fileItem('saved'); },
  });
  find(h, n => n.props.id === 'douyin-link').props.onChange({ target: { value: 'https://v.douyin.com/abc' } }); h.render();
  await find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); h.render();
  const destination = find(h, n => n.type?.name === 'StoragePicker');
  assert.equal(destination.props.value, 'webdav');
  find(h, n => n.type === 'button' && label(n) === 'Save permanently to Files').props.onClick();
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0][0], savedFile);
  assert.equal(uploaded[0][1], 'permanent');
  assert.equal(uploaded[0][2], 'webdav');
  destination.props.onChange('r2'); h.render();
  assert.equal(find(h, n => n.type?.name === 'StoragePicker').props.value, 'r2');
  find(h, n => n.type === 'button' && label(n) === 'Save permanently to Files').props.onClick();
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(uploaded.length, 2);
  assert.equal(uploaded[1][2], 'r2');
  h.unmount();
});

test('Douyin File save uses Access credentials, safe names and enforces the Files size limit', async t => {
  const f = components();
  f.services.apiRead = { AuthenticationRequiredError: class AuthenticationRequiredError extends Error {} };
  const service = f.load('apps/workspace/src/services/douyinService.ts');
  let requestUrl, requestInit;
  let tooLarge = false;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (tooLarge) return new Response(null, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '99000001' } });
    requestUrl = new URL(url); requestInit = init;
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '3' } });
  });
  const file = await service.fetchDouyinFile('https://v.douyin.com/abc', 'clip/unsafe');
  assert.equal(file.name, 'clip_unsafe.mp4');
  assert.equal(file.size, 3);
  assert.equal(requestUrl.pathname, '/v1/tools/douyin/download');
  assert.equal(requestUrl.searchParams.get('url'), 'https://v.douyin.com/abc');
  assert.equal(requestInit.credentials, 'include');
  assert.equal(requestInit.redirect, 'manual');
  tooLarge = true;
  await assert.rejects(service.fetchDouyinFile('https://v.douyin.com/large', 'large'), /99 MB/);
});

test('file uploads stream the original File with simple CORS metadata and reject files over 99 MB', async t => {
  const api = components().load('apps/workspace/src/services/fileService.ts');
  let requests = 0;
  const file = new File(['hello'], '测试 & example.md', { type: 'text/markdown' });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests++;
    const query = new URL(url).searchParams;
    assert.equal(query.get('size'), '5'); assert.equal(query.get('filename'), file.name);
    assert.equal(query.get('storageBackend'), 'webdav'); assert.equal(query.get('expiry'), 'permanent');
    assert.equal(query.get('mime'), 'text/markdown'); assert.equal(init.body, file);
    assert.equal(init.headers['Content-Type'], 'text/plain'); assert.equal(init.credentials, 'include');
    return Response.json({ success: true, file: fileItem('streamed') });
  });
  await api.uploadFileService(file, 'permanent', 'webdav');
  await assert.rejects(api.uploadFileService({ size: 99_000_001 }), /99 MB/);
  assert.equal(requests, 1);
});

test('Markdown plain text preserves paragraphs, lists, code whitespace and reference URLs', () => {
  const f = components(); const { markdownToText } = f.load('apps/workspace/src/utils/markdownText.ts');
  const md = '# Title\n\nFirst **bold** &amp; *italic*.\n\n- item\n  - nested\n- [x] done\n\n3. third\n4. fourth\n\n```js\n  const x = "<tag>";\n\n\n  next();\n```\n\n[Guide][ref] and ![Image](https://example.com/a.png)\n\n[ref]: https://example.com/guide\n';
  const result = markdownToText(md);
  assert.match(result, /^Title\n\nFirst bold & italic\./);
  assert.match(result, /- item\n\s+- nested/);
  assert.match(result, /- \[x\] done/);
  assert.match(result, /3\. third\n4\. fourth/);
  assert.ok(result.includes('  const x = "<tag>";\n\n\n  next();'));
  assert.match(result, /Guide \(https:\/\/example.com\/guide\)/);
  assert.match(result, /Image \(https:\/\/example.com\/a.png\)/);
  assert.equal(markdownToText('`a < b && c > d`'), 'a < b && c > d');
  assert.equal(markdownToText('Hello <b>world</b>.'), 'Hello <b>world</b>.');
  assert.equal(markdownToText('See[^a].\n\n[^a]: [Source](https://example.com)'), 'See[^a].\n\n[^a]: Source (https://example.com)');
  assert.equal(markdownToText('| A | B |\n| - | - |\n| one | two |'), 'A | B\none | two');
  assert.throws(() => markdownToText('字'.repeat(3_333_334)), /10 MB/);
  // A small reference document must not expand into a multi-megabyte response.
  assert.throws(() => markdownToText('[x][ref] '.repeat(11000) + '\n\n[ref]: https://example.com/' + 'a'.repeat(1000)), /Converted text exceeds/);
});

test('local text and Markdown-to-QR conversion never upload, including overflow and cancellation', async () => {
  let uploads = 0;
  const f = setup({ onUploadFile: async () => { uploads++; return fileItem('unexpected'); } });
  editQr(f.h, 'short text'); assert.equal(uploads, 0);
  const long = '字'.repeat(1000); editQr(f.h, long);
  assert.match(label(f.h.tree), /Nothing is uploaded until you confirm/); assert.equal(uploads, 0);
  button(f.h, 'Review text share').props.onClick(); f.h.render();
  assert.ok(elements(f.h.tree).some(n => n.props.role === 'dialog'));
  button(f.h, 'Cancel').props.onClick(); f.h.render(); assert.equal(uploads, 0);
  button(f.h, 'Text converter').props.onClick(); f.h.render();
  const { TextConverter } = f.load('apps/workspace/src/components/TextConverter.tsx');
  const converter = f.mount(TextConverter, find(f.h, n => typeof n.props.onToQr === 'function').props);
  input(converter, 'Markdown input').props.onChange({ target: { value: '# Hello\n\n[Link](https://example.com)' } }); converter.render();
  button(converter, 'Turn into QR').props.onClick(); f.h.render();
  assert.equal(input(f.h, 'QR content').props.value, 'Hello\n\nLink (https://example.com)');
  assert.equal(uploads, 0); converter.unmount(); f.h.unmount();
});

test('confirmed long text uploads once, uses a text page and shares the Files record', async () => {
  let calls = 0, uploaded, release;
  const f = setup({ onUploadFile: (file, expiry) => { calls++; uploaded = { file, expiry }; return new Promise(resolve => release = resolve); } });
  editQr(f.h, 'hello '.repeat(500));
  button(f.h, 'Review text share').props.onClick(); f.h.render();
  const confirm = button(f.h, 'Upload text & create page').props.onClick;
  confirm(); confirm(); f.h.render(); assert.equal(calls, 1);
  assert.equal(await uploaded.file.text(), 'hello '.repeat(500)); assert.equal(uploaded.expiry, '48 hours');
  const saved = fileItem('long-text'); f.props.files = [saved]; release(saved);
  await new Promise(resolve => setImmediate(resolve)); f.h.render();
  assert.equal(input(f.h, 'QR content').props.value, 'https://files.example.invalid/t/long-text');
  assert.equal(elements(f.h.tree).some(n => n.props.role === 'dialog'), false);
  assert.match(label(f.h.tree), /TXT file is also in Files/); f.h.unmount();
});

test('existing file QR requests do not upload and deleted files stop producing QR codes', () => {
  let uploads = 0; const f = setup({ files: [fileItem('existing')], fileRequest: { fileId: 'existing', sequence: 1 }, onUploadFile: async () => { uploads++; } });
  assert.equal(input(f.h, 'QR content').props.value, 'https://files.example.invalid/f/existing');
  assert.equal(uploads, 0);
  f.props.files = []; f.h.render();
  assert.match(label(f.h.tree), /no longer available/);
  assert.equal(button(f.h, 'Copy QR').props.disabled, true); f.h.unmount();
});

test('pasted images wait for explicit upload and failed uploads preserve the chosen file', async () => {
  let calls = 0; const f = setup({ onUploadFile: async () => { calls++; throw new Error('Offline: retry later'); } });
  const image = new File(['image'], 'pasted.png', { type: 'image/png' });
  find(f.h, n => Boolean(n.props.onPaste)).props.onPaste({ clipboardData: { files: [image] }, preventDefault() {} }); f.h.render();
  assert.equal(calls, 0); assert.match(label(f.h.tree), /pasted.png/);
  button(f.h, 'Upload & generate QR').props.onClick();
  await new Promise(resolve => setImmediate(resolve)); f.h.render();
  assert.equal(calls, 1); assert.match(label(f.h.tree), /Offline: retry later/);
  assert.match(label(f.h.tree), /pasted.png/); assert.equal(button(f.h, 'Upload & generate QR').props.disabled, false); f.h.unmount();
});

test('a file request arriving during upload stays selected when the older upload completes', async () => {
  let release; const f = setup({ files: [fileItem('new-selection')], onUploadFile: () => new Promise(resolve => release = resolve) });
  button(f.h, 'Upload a file').props.onClick(); f.h.render();
  input(f.h, 'Choose QR file').props.onChange({ target: { files: [new File(['test'], 'old.txt')], value: '' } }); f.h.render();
  button(f.h, 'Upload & generate QR').props.onClick();
  f.props.fileRequest = { fileId: 'new-selection', sequence: 1 }; f.h.render();
  release(fileItem('old')); await new Promise(resolve => setImmediate(resolve)); f.h.render();
  assert.equal(input(f.h, 'QR content').props.value, 'https://files.example.invalid/f/new-selection'); f.h.unmount();
});

test('file page exposes a one-click QR action with the exact existing file', () => {
  const f = components(), { FilesView } = f.load('apps/workspace/src/components/FilesView.tsx');
  let selected; const file = fileItem('reuse');
  const h = f.mount(FilesView, { transfers: [file], onUploadFile() {}, onDeleteTransfer: async () => {}, onGenerateQr(value) { selected = value; } });
  input(h, 'Generate QR for reuse.txt').props.onClick(); assert.equal(selected, file); h.unmount();
});

test('workspace uploads appear in Files and survive a delayed initial file listing', async () => {
  const f = components();
  let finishListing, calls = 0;
  f.services.accessService.getAccessIdentity = async () => ({ email: 'local@example.invalid' });
  f.services.fileService.fetchActiveFiles = () => new Promise(resolve => finishListing = resolve);
  f.services.fileService.uploadFileService = async () => { calls++; return { file: fileItem('from-tools'), isLive: true }; };
  f.services.noteService.fetchNotes = async () => [];
  f.services.mailService.fetchMail = f.services.mailService.fetchSentMail = async () => [];
  const { WorkspaceApp } = f.load('apps/workspace/src/components/WorkspaceApp.tsx');
  const h = f.mount(WorkspaceApp, {});
  await new Promise(resolve => setImmediate(resolve)); h.render();
  find(h, n => n.type?.name === 'Sidebar').props.onTabChange('tools'); h.render();
  // The lazy component receives the same upload callback as the Files page.
  const tools = find(h, n => typeof n.props.onUploadFile === 'function' && 'fileRequest' in n.props);
  const uploaded = await tools.props.onUploadFile(new File(['test'], 'from-tools.txt'), 'permanent');
  assert.equal(uploaded.id, 'from-tools'); assert.equal(calls, 1);
  finishListing([fileItem('older')]); await new Promise(resolve => setImmediate(resolve)); h.render();
  find(h, n => n.type?.name === 'Sidebar').props.onTabChange('files'); h.render();
  const files = find(h, n => n.type?.name === 'FilesView');
  assert.deepEqual(files.props.transfers.map(file => file.id), ['from-tools', 'older']);
  files.props.onGenerateQr(uploaded); h.render();
  const nextTools = find(h, n => typeof n.props.onUploadFile === 'function' && 'fileRequest' in n.props);
  assert.equal(nextTools.props.fileRequest.fileId, 'from-tools'); assert.equal(calls, 1); h.unmount();
});

test('oversized files and multiple drops are rejected without uploading', () => {
  let calls = 0; const f = setup({ onUploadFile: async () => { calls++; } });
  button(f.h, 'Upload a file').props.onClick(); f.h.render();
  input(f.h, 'Choose QR file').props.onChange({ target: { files: [{ name: 'huge.bin', size: 99_000_001 }], value: '' } }); f.h.render();
  assert.match(label(f.h.tree), /up to 99 MB/); assert.equal(calls, 0);
  input(f.h, 'Paste an image or drop a file').props.onDrop({ preventDefault() {}, dataTransfer: { files: [new File(['a'], 'a'), new File(['b'], 'b')] } }); f.h.render();
  assert.match(label(f.h.tree), /one file for each QR/); assert.equal(calls, 0); f.h.unmount();
});

test('text-share route escapes active content and keeps authentication, expiry and revocation', async () => {
  const f = fixture();
  try {
    const text = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n& hello';
    const form = new FormData(); form.set('file', new File([text], 'share.txt', { type: 'text/plain' })); form.set('expiry', 'permanent');
    const { file } = await (await f.request('/v1/files/upload', { method: 'POST', body: form })).json();
    const response = await f.request(`/t/${file.id}`); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await response.text(); assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!html.includes('<img'));
    const anonymous = await f.worker.fetch(new Request(`https://fixture.invalid/t/${file.id}`), f.env, f.ctx); assert.equal(anonymous.status, 401);
    f.sqlite.prepare('UPDATE files SET expires_at=1 WHERE id=?').run(file.id);
    assert.equal((await f.request(`/t/${file.id}`)).status, 410);
    await f.request(`/v1/files/${file.id}`, { method: 'DELETE' });
    assert.equal((await f.request(`/t/${file.id}`)).status, 404);
    assert.equal(f.objects.size, 0);
  } finally { await f.close(); }
});
