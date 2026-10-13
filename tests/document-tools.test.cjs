const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { components, find, label } = require('./component-fixture.cjs');
const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'apps/workspace/package.json'));
const { unzipSync, zipSync, strToU8, strFromU8 } = req('fflate');
const esbuild = createRequire(fs.realpathSync(path.join(root, 'workers/file-service/node_modules/wrangler/package.json')))('esbuild');
let engine;
test.before(async () => {
  const result = await esbuild.build({ absWorkingDir: root, stdin: { contents: "export {importDocument} from './apps/workspace/src/utils/documentImport'; export {markdownToDocx} from './apps/workspace/src/utils/documentExport'; export {htmlDocument} from './apps/workspace/src/utils/documentFormats';", resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'cjs', alias: { 'decode-named-character-reference': path.join(root, 'apps/workspace/src/utils/decodeNamedEntity.ts') } });
  fs.mkdirSync(path.join(root,'.wrangler/document-converter'),{recursive:true}); fs.writeFileSync(path.join(root,'.wrangler/document-converter/engine.cjs'),result.outputFiles[0].text); const module = { exports: {} }; new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports); engine = module.exports;
});
const sample = '# 文档转换测试\n\nA **bold** and *italic* paragraph with [Guide](https://example.com/guide).\n\n## Next steps\n\n- First item\n- Second item\n  - Nested item\n\n3. Third\n4. Fourth\n\n```js\n  const x = "<tag>";\n  next();\n```\n\n| Name | Value |\n| --- | --- |\n| 中文 | 42 |\n';

test('Markdown exports a real Word document and imports headings, lists, links, code and tables locally', async t => {
  let network = 0; t.mock.method(global, 'fetch', () => { network++; throw Error('Unexpected network'); });
  const blob = await engine.markdownToDocx(sample), data = new Uint8Array(await blob.arrayBuffer());
  const parts = unzipSync(data), xml = strFromU8(parts['word/document.xml']);
  assert.match(xml, /w:pStyle w:val="Heading1"/); assert.match(xml, /<w:tbl>/); assert.match(xml, /<w:numPr>/);
  assert.match(xml, /const x =/); assert.match(xml, /中文/);
  const imported = await engine.importDocument(new File([blob], 'sample.docx'));
  assert.match(imported.markdown, /^# 文档转换测试/); assert.match(imported.markdown, /\*\*bold\*\*/); assert.match(imported.markdown, /\*italic\*/);
  assert.match(imported.markdown, /https:\/\/example.com\/guide/); assert.match(imported.markdown, /- First item/); assert.match(imported.markdown, /\n {2,}- Nested item/);
  assert.match(imported.markdown, /const x = "<tag>";/); assert.match(imported.markdown, /next\(\);/); assert.match(imported.markdown, /\| 中文\s+\| 42/);
  assert.equal(network, 0);
  const dir = path.join(root, '.wrangler/document-converter'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sample.docx'), data); fs.writeFileSync(path.join(dir, 'sample.md'), sample); fs.writeFileSync(path.join(dir, 'roundtrip.md'), imported.markdown);
});

test('HTML and TXT inputs are safe and preserve literal text without fetching images', async t => {
  let network = 0; t.mock.method(global, 'fetch', () => { network++; throw Error('Unexpected network'); });
  const html = '<h1>Title</h1><script>bad()</script><p onclick="bad()">Text <b>bold</b></p><img src="https://tracker.invalid/pixel" alt="Image"><a href="javascript:bad()">unsafe</a>';
  const imported = await engine.importDocument(new File([html], 'page.html'));
  assert.match(imported.markdown, /^# Title/); assert.match(imported.markdown, /\*\*bold\*\*/); assert.doesNotMatch(imported.markdown, /bad\(\)|javascript:/);
  const exported = engine.htmlDocument(imported.markdown); assert.doesNotMatch(exported, /<img|<script|onclick|javascript:/); assert.match(exported, /<h1>Title/);
  const txt = await engine.importDocument(new File(['# Literal heading\n\n- Literal list'], 'plain.txt'));
  const { markdownToText } = components().load('apps/workspace/src/utils/markdownText.ts');
  assert.equal(markdownToText(txt.markdown), '# Literal heading\n\n- Literal list');
  const utf16 = new Uint8Array([255,254,65,0,66,0]); assert.equal((await engine.importDocument(new File([utf16], 'utf16.txt'))).markdown, 'AB');
  assert.equal(network, 0);
});

test('corrupt, unsupported and oversized document packages fail without a partial result', async () => {
  await assert.rejects(engine.importDocument(new File(['not Word'], 'bad.docx')));
  await assert.rejects(engine.importDocument(new File(['legacy'], 'old.doc')), /Save older/);
  await assert.rejects(engine.importDocument(new File([new Uint8Array(10*1024*1024+1)], 'large.txt')), /10 MiB/);
  await assert.rejects(engine.importDocument(new File([new Uint8Array([0,1,2,3])], 'binary.txt')), /binary/);
  const bomb = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<document/>'), 'word/media/padding.bin': new Uint8Array(21*1024*1024) });
  await assert.rejects(engine.importDocument(new File([bomb], 'oversized.docx')), /too large when unpacked/);
  await assert.rejects(engine.markdownToDocx('字'.repeat(70000)), /200 KB/);
  await assert.rejects(engine.markdownToDocx('```\n' + 'line\n'.repeat(15001) + '```'), /too complex/);
});

const button = (h, name) => find(h, n => n.type === 'button' && label(n) === name);
const field = (h, name) => find(h, n => n.props['aria-label'] === name);
const flush = () => new Promise(setImmediate);
function ui(readDocument) {
  const f = components(); f.services.documentConversionService.readDocument = readDocument;
  const { TextConverter } = f.load('apps/workspace/src/components/TextConverter.tsx');
  const saved = [], h = f.mount(TextConverter, { canSave: true, isActive: true, onSaveNote: async note => saved.push(note), onOpenNotes() {}, onToQr() {} });
  button(h, 'Document file').props.onClick(); h.render();
  const choose = name => field(h, 'Choose document to convert').props.onChange({ target: { files: [new File(['sample'], name)], value: '' } });
  return { ...f, h, saved, choose };
}

test('imported documents can be edited, converted both ways and saved only after note review', async () => {
  const f = ui(async () => ({ name: 'sample.docx', markdown: '# Imported\n\n**Text**', warning: '' }));
  try {
    f.choose('sample.docx'); await flush(); f.h.render();
    assert.equal(field(f.h, 'Markdown preview').props.value, '# Imported\n\n**Text**'); assert.equal(f.saved.length, 0);
    field(f.h, 'Imported Markdown').props.onChange({ target: { value: '# Edited\n\n**Result**' } }); f.h.render();
    field(f.h, 'Conversion output').props.onChange({ target: { value: 'plain' } }); f.h.render();
    assert.equal(field(f.h, 'Plain text preview').props.value, 'Edited\n\nResult');
    field(f.h, 'Conversion output').props.onChange({ target: { value: 'document' } }); f.h.render();
    button(f.h, 'Save to Notes').props.onClick(); f.h.render();
    const modal = find(f.h, n => n.type?.name === 'NewItemModal');
    assert.equal(modal.props.initialNote.content, '# Edited\n\n**Result**');
    await modal.props.onCreateNote(modal.props.initialNote); modal.props.onClose(); f.h.render(); assert.equal(f.saved.length, 1);
    button(f.h, 'Markdown').props.onClick(); f.h.render(); button(f.h, 'Document file').props.onClick(); f.h.render();
    assert.equal(field(f.h, 'Imported Markdown').props.value, '# Edited\n\n**Result**');
  } finally { f.h.unmount(); }
});

test('failed and cancelled imports keep the previous document and ignore late completion', async () => {
  let mode = 'ok', release;
  const f = ui(async (_file, signal) => {
    if (mode === 'fail') throw Error('Invalid document');
    if (mode === 'late') return new Promise(resolve => { release = resolve; });
    return { name: 'kept.docx', markdown: '# Keep me', warning: '' };
  });
  try {
    f.choose('kept.docx'); await flush(); f.h.render();
    mode = 'fail'; f.choose('bad.docx'); await flush(); f.h.render();
    assert.match(label(f.h.tree), /Invalid document/); assert.equal(field(f.h, 'Imported Markdown').props.value, '# Keep me');
    mode = 'late'; f.choose('late.docx'); f.h.render(); button(f.h, 'Cancel').props.onClick();
    release({ name: 'late.docx', markdown: '# Too late', warning: '' }); await flush(); f.h.render();
    assert.equal(field(f.h, 'Imported Markdown').props.value, '# Keep me');
  } finally { f.h.unmount(); }
});
