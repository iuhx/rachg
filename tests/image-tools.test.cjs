const test = require('node:test');
const assert = require('node:assert/strict');
const { components, find, label, elements } = require('./component-fixture.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const button = (h, text) => find(h, n => n.type === 'button' && label(n) === text);
const field = (h, name) => find(h, n => n.props['aria-label'] === name);
const png = name => new File(['sample'], name, { type: 'image/png' });
const result = () => ({ blob: new Blob(['result'], { type: 'image/png' }), preview: new Blob(['preview'], { type: 'image/png' }), width: 3, height: 2 });
function setup() {
  const f = components(), { ImageConverter } = f.load('apps/workspace/src/components/ImageConverter.tsx');
  const h = f.mount(ImageConverter, {});
  const add = files => { field(h, 'Choose images to convert').props.onChange({ target: { files, value: '' } }); h.render(); };
  return { ...f, h, add };
}

test('BMP bytes use correct BGR order, bottom-up rows, padding and white alpha compositing', () => {
  const f = components(), { encodeBmp, inspectImage } = f.load('apps/workspace/src/utils/imageFormats.ts');
  const buffer = encodeBmp({ width: 1, height: 2, data: new Uint8ClampedArray([255,0,0,255, 0,0,255,0]) });
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  assert.equal(inspectImage(bytes), 'bmp');
  assert.equal(view.getUint32(2, true), 62); assert.equal(view.getUint16(28, true), 24);
  assert.deepEqual([...bytes.subarray(54)], [255,255,255,0, 0,0,255,0]);
});

test('image signatures reject disguised active documents and oversized header dimensions', () => {
  const f = components(), { inspectImage, checkDimensions } = f.load('apps/workspace/src/utils/imageFormats.ts');
  assert.throws(() => inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), /supported image/);
  const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(16, 6000); view.setUint32(20, 5000);
  assert.throws(() => inspectImage(bytes), /24 megapixels/);
  view.setUint32(16, 4000); view.setUint32(20, 3000); assert.equal(inspectImage(bytes), 'png');
  assert.throws(() => checkDimensions(0, 10), /Invalid/);
  const heic = new Uint8Array(24); new DataView(heic.buffer).setUint32(0, 24); heic.set(new TextEncoder().encode('ftypheic'), 4);
  assert.equal(inspectImage(heic), 'heic'); heic.set(new TextEncoder().encode('avif'), 16); assert.equal(inspectImage(heic), 'avif');
});

test('download names cannot escape the ZIP directory or collide across input formats', () => {
  const { outputNames } = components().load('apps/workspace/src/utils/imageFormats.ts');
  const names = outputNames([{ name:'photo.png' }, { name:'photo.jpg' }, { name:'PHOTO.webp' }, { name:'../photo-2.heic' }, { name:'../../.png' }], 'jpeg');
  assert.deepEqual(names, ['photo.jpg','photo-2.jpg','PHOTO-3.jpg','photo-2-2.jpg','image.jpg']);
});

test('adding images is local and waits for explicit conversion; one failure does not stop the batch', async () => {
  const f = setup(); let calls = 0; const settings = [];
  f.services.imageConversionService.convertImage = async (_, options) => { calls++; settings.push(options); if (calls === 1) throw new Error('Damaged image'); return result(); };
  try {
    f.add([png('bad.png'), png('good.png')]); assert.equal(calls, 0);
    field(f.h, 'Output image format').props.onChange({ target: { value:'jpeg' } }); f.h.render();
    const convert = button(f.h, 'Convert all').props.onClick;
    convert(); convert(); await flush(); f.h.render();
    assert.equal(calls, 2); assert.equal(settings[1].format, 'jpeg');
    assert.match(label(f.h.tree), /Damaged image/); assert.match(label(f.h.tree), /1 of 2 image/);
    assert.equal(field(f.h, 'Download good.jpg').props.disabled, undefined);
  } finally { f.h.unmount(); }
});

test('cancellation keeps completed files and prevents the remainder from starting', async () => {
  const f = setup(); let calls = 0;
  f.services.imageConversionService.convertImage = async (_, options, signal) => {
    if (++calls === 1) return result();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled','AbortError')), { once:true }));
  };
  try {
    f.add([png('one.png'), png('two.png'), png('three.png')]);
    button(f.h, 'Convert all').props.onClick(); await flush(); f.h.render();
    assert.equal(calls, 2); button(f.h, 'Cancel').props.onClick(); await flush(); f.h.render();
    assert.equal(calls, 2); assert.match(label(f.h.tree), /Cancelled. 1 completed/);
    assert.equal(button(f.h, 'Download ZIP').props.disabled, false);
  } finally { f.h.unmount(); }
});

test('file count and byte caps reject extra inputs before starting a worker', () => {
  const f = setup();
  try {
    f.add([{ name:'too-big.png', type:'image/png', size:26*1024*1024 }, png('ok.png')]);
    assert.match(label(f.h.tree), /25 MiB/); assert.equal(elements(f.h.tree).filter(n => n.type === 'article').length, 1);
    f.add(Array.from({ length:25 }, (_, i) => png(`image-${i}.png`)));
    assert.equal(elements(f.h.tree).filter(n => n.type === 'article').length, 20); assert.match(label(f.h.tree), /Batch limit reached/);
  } finally { f.h.unmount(); }
});

test('clearing and unmounting release preview URLs and abort active work', async t => {
  const f = setup(); const revoked = []; let signal;
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  f.services.imageConversionService.convertImage = async () => result();
  f.add([png('one.png')]); button(f.h, 'Convert all').props.onClick(); await flush(); f.h.render();
  button(f.h, 'Clear all').props.onClick(); f.h.render(); assert.equal(revoked.length, 1);
  f.services.imageConversionService.convertImage = (_, options, activeSignal) => { signal = activeSignal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled','AbortError')))); };
  f.add([png('two.png')]); button(f.h, 'Convert all').props.onClick(); f.h.unmount(); await flush();
  assert.equal(signal.aborted, true);
});
