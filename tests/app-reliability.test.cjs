const test = require('node:test');
const assert = require('node:assert/strict');
const { components, find, label, elements } = require('./component-fixture.cjs');
const { fixture } = require('./worker-fixture.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const button = (h, name) => find(h, n => n.type === 'button' && label(n) === name);
const field = (h, name) => find(h, n => n.props['aria-label'] === name);
const mail = id => ({ id, from: `${id}@example.invalid`, to: 'inbox@example.invalid', subject: id, text: 'received content', preview: 'preview', receivedAt: 1 });
const note = id => ({ id, title: id, content: `original ${id}`, excerpt: '', updatedAt: 'now', updatedTimestamp: 1 });

function composer(onSend = async () => {}) {
  const f = components(), { MailView } = f.load('apps/workspace/src/components/MailView.tsx');
  const props = { messages: [mail('A')], sentMessages: [], selectedMessage: mail('A'), selectedSentMessage: null,
    isLoading: false, isMessageLoading: false, isSentLoading: false, isSentMessageLoading: false,
    onSelect() {}, onSelectSent() {}, onRefresh() {}, onRefreshSent() {}, onDelete: async () => {}, onSend };
  const h = f.mount(MailView, props);
  button(h, 'Compose').props.onClick(); h.render();
  for (const [name, value] of [['Recipient', 'friend@example.invalid'], ['Subject', 'Draft'], ['Message', 'Keep this message']]) {
    field(h, name).props.onChange({ target: { value } }); h.render();
  }
  return { ...f, h, props };
}

test('mail blocks duplicate submissions and locks fields until acceptance', async () => {
  let calls = 0, release;
  const f = composer(() => { calls++; return new Promise(resolve => release = resolve); });
  const submit = find(f.h, n => n.type === 'form').props.onSubmit;
  const a = submit({ preventDefault() {} }), b = submit({ preventDefault() {} }); f.h.render();
  assert.equal(calls, 1);
  assert.equal(find(f.h, n => n.type === 'fieldset').props.disabled, true);
  release(); await Promise.all([a, b]); f.h.render();
  button(f.h, 'Compose').props.onClick(); f.h.render();
  assert.equal(field(f.h, 'Message').props.value, ''); f.h.unmount();
});

test('closing/reopening and hiding Mail preserve drafts and warn before page exit', () => {
  const f = composer();
  button(f.h, 'Close').props.onClick(); f.h.render();
  button(f.h, 'Compose').props.onClick(); f.h.render();
  assert.equal(field(f.h, 'Message').props.value, 'Keep this message');
  f.props.isActive = false; f.h.render();
  assert.equal(elements(f.h.tree).some(n => n.type === 'form'), false);
  let warned = false;
  for (const handler of f.events.get('beforeunload')) handler({ preventDefault() { warned = true; } });
  assert.ok(warned);
  f.props.isActive = true; f.h.render();
  assert.equal(field(f.h, 'Recipient').props.value, 'friend@example.invalid'); f.h.unmount();
});

test('failed sends retain drafts and are never automatically retried', async () => {
  let calls = 0;
  const f = composer(async () => { calls++; throw new Error('Delivery unconfirmed'); });
  await find(f.h, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); f.h.render();
  assert.equal(calls, 1); assert.match(label(f.h.tree), /Delivery unconfirmed/);
  assert.equal(field(f.h, 'Message').props.value, 'Keep this message'); f.h.unmount();
});

test('reply does not overwrite an existing draft; discard requires confirmation', () => {
  const f = composer();
  button(f.h, 'Close').props.onClick(); f.h.render();
  button(f.h, 'Reply').props.onClick(); f.h.render();
  assert.equal(field(f.h, 'Subject').props.value, 'Draft');
  assert.match(label(f.h.tree), /Finish or discard/);
  button(f.h, 'Discard draft').props.onClick(); f.h.render();
  const dialog = find(f.h, n => n.type?.name === 'ConfirmDialog' && n.props.title === 'Discard this draft?');
  assert.equal(dialog.props.isOpen, true);
  dialog.props.onCancel(); f.h.render(); assert.equal(field(f.h, 'Message').props.value, 'Keep this message');
  button(f.h, 'Discard draft').props.onClick(); f.h.render();
  find(f.h, n => n.type?.name === 'ConfirmDialog' && n.props.title === 'Discard this draft?').props.onConfirm(); f.h.render();
  button(f.h, 'Compose').props.onClick(); f.h.render(); assert.equal(field(f.h, 'Message').props.value, ''); f.h.unmount();
});

async function workspace(configure = () => {}) {
  const f = components();
  f.services.accessService.getAccessIdentity = async () => ({ email: 'admin@example.invalid' });
  f.services.fileService.fetchActiveFiles = f.services.noteService.fetchNotes = async () => [];
  f.services.mailService.fetchMail = async () => [mail('A'), mail('B')];
  f.services.mailService.fetchSentMail = async () => [];
  f.services.mailService.fetchMailMessage = async id => mail(id);
  f.services.mailService.deleteMailMessage = async () => {};
  configure(f.services);
  const { WorkspaceApp } = f.load('apps/workspace/src/components/WorkspaceApp.tsx');
  const h = f.mount(WorkspaceApp, {}); await flush(); h.render(); await flush(); h.render();
  const navigate = tab => { find(h, n => n.type?.name === 'Sidebar').props.onTabChange(tab); h.render(); };
  navigate('mail');
  return { ...f, h, navigate, mailProps: () => find(h, n => n.type?.name === 'MailView').props };
}

test('a late initial notes response cannot hide a newly created note', async () => {
  let release;
  const f = await workspace(services => {
    services.noteService.fetchNotes = () => new Promise(resolve => release = resolve);
    services.noteService.createNote = async () => note('new');
  });
  try {
    await find(f.h, n => n.type?.name === 'NewItemModal').props.onCreateNote({ title: 'new' }); f.h.render();
    release([note('old')]); await flush(); f.h.render();
    const notes = find(f.h, n => n.type?.name === 'NotesView').props.notes;
    assert.deepEqual(notes.map(n => n.id), ['new', 'old']);
    assert.equal(find(f.h, n => n.type?.name === 'CommandPalette').props.notes[0].id, 'new');
  } finally { f.h.unmount(); }
});

test('failed note loading stays distinct from an empty notebook and retry restores saved notes', async () => {
  const f = await workspace(services => {
    services.noteService.fetchNotes = async () => { throw new services.fileService.AuthenticationRequiredError(); };
  });
  try {
    const props = () => find(f.h, n => n.type?.name === 'NotesView').props;
    assert.match(props().loadError, /Reconnect/);
    const { NotesView } = f.load('apps/workspace/src/components/NotesView.tsx');
    const view = f.mount(NotesView, props());
    assert.match(label(view.tree), /Unable to load notes/);
    assert.doesNotMatch(label(view.tree), /No notes yet|Create First Note/);
    assert.equal(find(view, n => n.type === 'a' && label(n) === 'Reconnect workspace').props.href, 'https://api.rachg.com/auth/return');
    view.unmount();
    f.services.noteService.fetchNotes = async () => [note('historical')];
    props().onRetry(); f.h.render(); await flush(); f.h.render();
    assert.equal(props().loadError, '');
    assert.deepEqual(props().notes.map(n => n.id), ['historical']);
    f.navigate('home');
    assert.equal(find(f.h, n => n.type?.name === 'DashboardView').props.notesLoadError, '');
  } finally { f.h.unmount(); }
});

test('API reconnect requires administrator authentication and always returns to the workspace', async () => {
  const f = fixture();
  try {
    const url = 'https://fixture.invalid/auth/return?redirect_url=https://untrusted.invalid';
    assert.equal((await f.worker.fetch(new Request(url), f.env, f.ctx)).status, 401);
    const response = await f.request('/auth/return?redirect_url=https://untrusted.invalid');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://rachg.com/');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(f.queries.length, 0);
  } finally { await f.close(); }
});

test('note reads expose login redirects as authentication failures, not an empty list', async t => {
  const f = components();
  const service = f.load('apps/workspace/src/services/noteService.ts');
  const { AuthenticationRequiredError } = f.load('apps/workspace/src/services/fileService.ts');
  const original = global.fetch; t.after(() => { global.fetch = original; });
  global.fetch = async (_url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'include');
    return new Response(null, { status: 302, headers: { Location: 'https://login.example.invalid' } });
  };
  await assert.rejects(service.fetchNotes(), AuthenticationRequiredError);
  global.fetch = async () => new Response('<html>Sign in</html>');
  await assert.rejects(service.fetchNotes(), /Reconnect/);
  global.fetch = async () => Response.json({ success: true, notes: [note('historical')], nextCursor: null });
  assert.deepEqual((await service.fetchNotes()).map(n => n.id), ['historical']);
});

test('initial notes merging keeps newer local content and excludes deleted records', async () => {
  let release;
  const f = await workspace(services => {
    services.noteService.fetchNotes = () => new Promise(resolve => release = resolve);
    services.noteService.createNote = async title => note(title);
    services.noteService.updateNote = async value => ({ ...value, updatedTimestamp: 2 });
    services.noteService.deleteNote = async () => {};
  });
  try {
    const create = () => find(f.h, n => n.type?.name === 'NewItemModal').props.onCreateNote;
    const notes = () => find(f.h, n => n.type?.name === 'NotesView').props;
    await create()({ title: 'kept' }); f.h.render();
    await create()({ title: 'deleted' }); f.h.render();
    await notes().onUpdateNote({ ...note('kept'), content: 'latest saved content' }); f.h.render();
    await notes().onDeleteNote('deleted'); f.h.render();
    release([note('kept'), note('deleted'), note('old')]); await flush(); f.h.render();
    assert.deepEqual(notes().notes.map(n => n.id), ['kept', 'old']);
    assert.equal(notes().notes[0].content, 'latest saved content');
  } finally { f.h.unmount(); }
});

test('accepted mail completes even while sent-list refresh is still pending', async () => {
  const f = await workspace(); let release, accepted = false, sends = 0;
  f.services.mailService.sendMail = async () => { sends++; return { success: true, id: 'sent', resendId: 'provider' }; };
  f.services.mailService.fetchSentMail = () => new Promise(resolve => release = resolve);
  const sending = f.mailProps().onSend({ to: 'friend@example.invalid', subject: 'Subject', text: 'Message' }).then(() => { accepted = true; });
  try {
    await flush(); f.h.render();
    assert.equal(sends, 1);
    assert.equal(accepted, true, 'provider acceptance must not depend on a second read request');
    assert.equal(f.mailProps().isSentLoading, true);
  } finally { release?.([]); await sending; await flush(); f.h.unmount(); }
});

for (const folder of ['inbox', 'sent']) {
  const service = folder === 'inbox' ? 'fetchMailMessage' : 'fetchSentMailMessage';
  const action = folder === 'inbox' ? 'onSelect' : 'onSelectSent';
  const selection = folder === 'inbox' ? 'selectedMessage' : 'selectedSentMessage';
  const loading = folder === 'inbox' ? 'isMessageLoading' : 'isSentMessageLoading';
  test(`failed ${folder} detail never becomes a readable or replyable placeholder`, async () => {
    const f = await workspace();
    f.services.mailService[service] = async () => { throw new Error('Detail temporarily unavailable'); };
    try {
      await f.mailProps()[action](mail('A')); f.h.render();
      assert.equal(f.mailProps()[selection], null);
      assert.equal(f.mailProps()[loading], false);
      assert.match(label(f.h.tree), /Detail temporarily unavailable/);
      f.services.mailService[service] = async id => ({ ...mail(id), text: 'full body', replyTo: 'reply@example.invalid' });
      await f.mailProps()[action](mail('A')); f.h.render();
      assert.equal(f.mailProps()[selection].text, 'full body');
      assert.equal(f.mailProps()[selection].replyTo, 'reply@example.invalid');
    } finally { f.h.unmount(); }
  });
  test(`a stale ${folder} detail failure cannot clear a newer successful selection`, async () => {
    const f = await workspace(); let reject;
    f.services.mailService[service] = id => id === 'A' ? new Promise((_, fail) => reject = fail) : Promise.resolve(mail(id));
    try {
      const reading = f.mailProps()[action](mail('A'));
      await f.mailProps()[action](mail('B')); f.h.render();
      reject(new Error('old request failed')); await reading; f.h.render();
      assert.equal(f.mailProps()[selection].id, 'B');
      assert.equal(f.mailProps()[loading], false);
      assert.doesNotMatch(label(f.h.tree), /old request failed/);
    } finally { f.h.unmount(); }
  });
}

test('older inbox refresh responses cannot replace a newer list', async () => {
  const f = await workspace(); const releases = [];
  f.services.mailService.fetchMail = () => new Promise(resolve => releases.push(resolve));
  const a = f.mailProps().onRefresh(), b = f.mailProps().onRefresh();
  releases[1]([mail('new')]); await b; f.h.render();
  releases[0]([mail('stale')]); await a; f.h.render();
  assert.deepEqual(f.mailProps().messages.map(item => item.id), ['new']); f.h.unmount();
});

test('a refresh started before deletion cannot resurrect the deleted mail', async () => {
  const f = await workspace(); let release;
  f.services.mailService.fetchMail = () => new Promise(resolve => release = resolve);
  const refreshing = f.mailProps().onRefresh();
  await f.mailProps().onDelete('A'); f.h.render();
  release([mail('A'), mail('B')]); await refreshing; f.h.render();
  assert.deepEqual(f.mailProps().messages.map(item => item.id), ['B']);
  assert.equal(f.mailProps().isLoading, false); f.h.unmount();
});

test('deleting A while B is loading does not cancel B or restore A', async () => {
  const f = await workspace(); let deleted, detail;
  await f.mailProps().onSelect(mail('A')); f.h.render();
  f.services.mailService.deleteMailMessage = () => new Promise(resolve => deleted = resolve);
  const deleting = f.mailProps().onDelete('A');
  f.services.mailService.fetchMailMessage = () => new Promise(resolve => detail = resolve);
  const reading = f.mailProps().onSelect(mail('B')); f.h.render();
  deleted(); await deleting; f.h.render(); assert.equal(f.mailProps().isMessageLoading, true);
  detail({ ...mail('B'), text: 'fresh B' }); await reading; f.h.render();
  assert.equal(f.mailProps().selectedMessage.text, 'fresh B'); f.h.unmount();
});

test('a detail response cannot restore a selection removed by refresh', async () => {
  const f = await workspace(); let release;
  f.services.mailService.fetchMailMessage = () => new Promise(resolve => release = resolve);
  const reading = f.mailProps().onSelect(mail('A')); f.h.render();
  f.services.mailService.fetchMail = async () => [];
  await f.mailProps().onRefresh(); f.h.render();
  release(mail('A')); await reading; f.h.render();
  assert.equal(f.mailProps().selectedMessage, null);
  assert.equal(f.mailProps().isMessageLoading, false);
  f.navigate('files'); assert.equal(f.mailProps().isActive, false); f.h.unmount();
});

function notes(onUpdate = async () => {}, onDelete = async () => {}) {
  const f = components(), { NotesView } = f.load('apps/workspace/src/components/NotesView.tsx');
  const props = { notes: [note('A'), note('B')], onNewNote() {}, onUpdateNote: onUpdate, onDeleteNote: onDelete };
  return { ...f, props, h: f.mount(NotesView, props) };
}
function editNote(f) {
  button(f.h, 'Edit').props.onClick(); f.h.render();
  field(f.h, 'Markdown content').props.onChange({ target: { value: 'draft A' } }); f.h.render();
}

test('selecting a note waits for an existing save without requiring a second click', async () => {
  let release, calls = 0; const f = notes(() => { calls++; return new Promise(resolve => release = resolve); }); editNote(f);
  button(f.h, 'Save').props.onClick(); f.h.render();
  const switching = find(f.h, n => n.type === 'button' && label(n).startsWith('B')).props.onClick();
  release(); await switching; f.h.render(); assert.equal(calls, 1);
  assert.equal(elements(f.h.tree).some(n => n.type === 'textarea'), false);
  assert.equal(find(f.h, n => n.type === 'h3').props.children, 'B'); f.h.unmount();
});

test('note deletion waits for saving and uses the confirmed target exactly once', async () => {
  let release, deleted = []; const f = notes(() => new Promise(resolve => release = resolve), async id => { deleted.push(id); }); editNote(f);
  button(f.h, 'Save').props.onClick(); f.h.render();
  field(f.h, 'Delete note').props.onClick(); f.h.render();
  const confirm = find(f.h, n => n.type?.name === 'ConfirmDialog').props.onConfirm;
  confirm(); confirm(); assert.deepEqual(deleted, []);
  release(); await flush(); f.h.render(); assert.deepEqual(deleted, ['A']); f.h.unmount();
});

test('changing the selected note cannot change an already confirmed deletion target', async () => {
  let deleted; const f = notes(undefined, async id => { deleted = id; });
  field(f.h, 'Delete note').props.onClick(); f.h.render();
  f.props.notes = [note('B')]; f.h.render();
  const dialog = find(f.h, n => n.type?.name === 'ConfirmDialog');
  assert.match(dialog.props.description, /“A”/);
  dialog.props.onConfirm(); await flush(); assert.equal(deleted, 'A'); f.h.unmount();
});

test('creation validates empty input and prevents duplicate submissions before re-render', async () => {
  let calls = 0, closed = false, release;
  const f = components(), { NewItemModal } = f.load('apps/workspace/src/components/NewItemModal.tsx');
  const h = f.mount(NewItemModal, { isOpen: true, type: 'note', onClose() { closed = true; }, onCreateNote: () => { calls++; return new Promise(resolve => release = resolve); }, onCreateTransfer: async () => {} });
  await find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); h.render(); assert.equal(closed, false); assert.equal(calls, 0);
  find(h, n => n.type === 'input').props.onChange({ target: { value: 'New note' } }); h.render();
  const submit = find(h, n => n.type === 'form').props.onSubmit;
  const a = submit({ preventDefault() {} }), b = submit({ preventDefault() {} }); assert.equal(calls, 1);
  release(); await Promise.all([a, b]); assert.equal(closed, true); h.unmount();
});

test('Files retains failed uploads for retry with their original expiry', async () => {
  const calls = []; const f = components(), { FilesView } = f.load('apps/workspace/src/components/FilesView.tsx');
  const h = f.mount(FilesView, { transfers: [], onUploadFile: async (file, expiry) => { calls.push({ file, expiry }); if (calls.length === 1) throw new Error('Storage temporarily unavailable'); }, onDeleteTransfer: async () => {}, onGenerateQr() {} });
  button(h, '7 days').props.onClick(); h.render();
  const file = new File(['retained'], 'retry.txt');
  const choose = find(h, n => n.type === 'input' && n.props.type === 'file').props.onChange;
  choose({ target: { files: [file], value: '' } }); choose({ target: { files: [file], value: '' } });
  await flush(); h.render(); assert.equal(calls.length, 1);
  button(h, '1 hour').props.onClick(); h.render();
  button(h, 'Retry retry.txt').props.onClick(); await flush(); h.render();
  assert.equal(calls.length, 2); assert.equal(calls[1].file, file); assert.equal(calls[1].expiry, '7 days');
  assert.equal(elements(h.tree).some(n => n.props.role === 'alert'), false); h.unmount();
});

test('concurrent workspace uploads keep the loading flag until all settle', async () => {
  const f = await workspace(); f.navigate('files'); const releases = [];
  f.services.fileService.uploadFileService = () => new Promise(resolve => releases.push(resolve));
  const files = () => find(f.h, n => n.type?.name === 'FilesView').props;
  const a = files().onUploadFile(new File(['a'], 'a'), 'permanent'), b = files().onUploadFile(new File(['b'], 'b'), 'permanent');
  releases[0]({ file: { id: 'A' }, isLive: true }); await a; f.h.render(); assert.equal(files().isUploading, true);
  releases[1]({ file: { id: 'B' }, isLive: true }); await b; f.h.render(); assert.equal(files().isUploading, false); f.h.unmount();
});

test('signed-out lists do not display an endless loading indicator', async () => {
  const f = components(), { WorkspaceApp } = f.load('apps/workspace/src/components/WorkspaceApp.tsx');
  const h = f.mount(WorkspaceApp, {}); await flush(); h.render();
  find(h, n => n.type?.name === 'Sidebar').props.onTabChange('files'); h.render();
  assert.equal(find(h, n => n.type?.name === 'FilesView').props.isLoading, false);
  assert.equal(find(h, n => n.type?.name === 'NotesView').props.isLoading, false);
  assert.match(label(h.tree), /Sign in using the account menu/); h.unmount();
});

test('health check rejects login HTML and only marks a valid ready response reachable', async t => {
  const f = components(), { SettingsView } = f.load('apps/workspace/src/components/SettingsView.tsx');
  const h = f.mount(SettingsView, { isDarkMode: false, onToggleDarkMode() {}, onResetWorkspace() {} });
  assert.match(label(h.tree), /Not checked/);
  let response = new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } });
  t.mock.method(globalThis, 'fetch', async () => response);
  await button(h, 'Ping Edge').props.onClick(); h.render(); assert.match(label(h.tree), /Check failed/); assert.doesNotMatch(label(h.tree), /API reachable/);
  response = Response.json({ service: 'rachg-file-service', status: 'healthy', schema: 'ready' });
  await button(h, 'Ping Edge').props.onClick(); h.render(); assert.match(label(h.tree), /API reachable/); h.unmount();
});

test('file expiry parsing never treats 21 or 101 hours as one hour', async () => {
  const f = fixture();
  try {
    const { getFileExpiry } = f.load('workers/file-service/src/expiry.ts');
    for (const [input, hours] of [['21 hours', 21], ['101 hours', 101], ['3 days', 72], ['2d', 48], ['48h', 48], ['0', 1], ['999', 168], ['invalid', 48]]) {
      assert.equal(getFileExpiry(input, 1000), 1000 + hours * 3600_000);
    }
  } finally { await f.close(); }
});
