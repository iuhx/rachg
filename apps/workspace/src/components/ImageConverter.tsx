import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { convertImage, packImages } from '../services/imageConversionService';
import { IMAGE_FORMATS, IMAGE_LIMITS, outputNames, type ImageFormat, type ImageResult } from '../utils/imageFormats';
import { downloadBlob } from '../utils/qr';

interface Item {
  id: string; file: File; state: 'ready' | 'converting' | 'done' | 'error'; error?: string;
  output?: ImageResult & { name: string; previewUrl: string };
}
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const release = (item: Item) => { if (item.output) URL.revokeObjectURL(item.output.previewUrl); };

export const ImageConverter: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(85);
  const [busy, setBusy] = useState<'convert' | 'zip' | null>(null);
  const operation = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const update = (next: Item[] | ((current: Item[]) => Item[])) => {
    const value = typeof next === 'function' ? next(itemsRef.current) : next;
    itemsRef.current = value;
    if (mounted.current) setItems(value);
  };
  useEffect(() => {
    mounted.current = true;
    const unload = (event: BeforeUnloadEvent) => { if (operation.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { mounted.current = false; operation.current?.abort(); itemsRef.current.forEach(release); window.removeEventListener('beforeunload', unload); };
  }, []);

  const add = (files: File[]) => {
    if (operation.current) return;
    const accepted: Item[] = [], rejected: string[] = [];
    let total = itemsRef.current.reduce((sum, item) => sum + item.file.size, 0);
    for (const file of files) {
      if (!/\.(png|jpe?g|webp|bmp|avif|heic|heif)$/i.test(file.name) && !/^image\/(png|jpeg|webp|bmp|x-ms-bmp|avif|heic|heif)(?:$|;)/i.test(file.type)) { rejected.push(`${file.name}: unsupported format`); continue; }
      if (!file.size || file.size > IMAGE_LIMITS.fileBytes) { rejected.push(`${file.name}: use a non-empty file up to 25 MiB`); continue; }
      if (itemsRef.current.length + accepted.length >= IMAGE_LIMITS.files || total + file.size > IMAGE_LIMITS.batchBytes) { rejected.push('Batch limit reached: 20 images / 100 MiB'); break; }
      total += file.size;
      accepted.push({ id: crypto.randomUUID(), file, state: 'ready' });
    }
    update(current => [...current, ...accepted]);
    setNotice(rejected.length ? rejected.slice(0, 3).join(' · ') : '');
  };
  const convert = async () => {
    if (operation.current || !itemsRef.current.length) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy('convert'); setNotice('');
    const snapshot = itemsRef.current.map(item => ({ id: item.id, file: item.file, state: 'ready' as const }));
    itemsRef.current.forEach(release); update(snapshot);
    const names = outputNames(snapshot.map(item => item.file), format);
    let bytes = 0, completed = 0;
    try {
      for (let index = 0; index < snapshot.length; index++) {
        if (controller.signal.aborted) break;
        const item = snapshot[index];
        update(current => current.map(row => row.id === item.id ? { ...row, state: 'converting' } : row));
        try {
          const result = await convertImage(item.file, { format, quality }, controller.signal);
          if (controller.signal.aborted || !mounted.current) break;
          if (bytes + result.blob.size > IMAGE_LIMITS.outputBytes) throw new Error('Converted files exceed 100 MiB. Download completed images, then convert the remaining files in a smaller batch.');
          bytes += result.blob.size; completed++;
          const output = { ...result, name: names[index], previewUrl: URL.createObjectURL(result.preview) };
          update(current => current.map(row => row.id === item.id ? { ...row, state: 'done', output } : row));
        } catch (error) {
          if (controller.signal.aborted) break;
          update(current => current.map(row => row.id === item.id ? { ...row, state: 'error', error: error instanceof Error ? error.message : 'Unable to convert this image.' } : row));
        }
      }
      if (mounted.current) setNotice(controller.signal.aborted ? `Cancelled. ${completed} completed image(s) remain available to download.` : `${completed} of ${snapshot.length} image(s) converted. Originals are unchanged.`);
    } finally {
      if (mounted.current) { update(current => current.map(item => item.state === 'converting' ? { ...item, state: 'ready' } : item)); setBusy(null); }
      if (operation.current === controller) operation.current = null;
    }
  };
  const downloadAll = async () => {
    if (operation.current) return;
    const files = itemsRef.current.flatMap(item => item.output ? [{ name: item.output.name, blob: item.output.blob }] : []);
    if (!files.length) return;
    const controller = new AbortController(); operation.current = controller; setBusy('zip'); setNotice('');
    try {
      const zip = await packImages(files, controller.signal);
      if (!controller.signal.aborted && mounted.current) downloadBlob(zip, 'converted-images.zip');
    } catch (error) { if (mounted.current) setNotice(controller.signal.aborted ? 'ZIP download cancelled. Individual images are still available.' : error instanceof Error ? error.message : 'Unable to prepare the ZIP download.'); }
    finally { if (mounted.current) setBusy(null); if (operation.current === controller) operation.current = null; }
  };
  const completed = items.filter(item => item.output).length;
  return <section className="space-y-5" aria-label="Image converter">
    <div className="workspace-card p-5 sm:p-6 space-y-5">
      <div><h3 className="type-section-heading">A new format. The same image.</h3><p className="type-secondary mt-1">Batch conversion on your device. No uploads or sign-in needed.</p></div>
      <div className={`workspace-panel border-dashed p-6 flex flex-col items-center text-center gap-2 ${busy ? 'opacity-60' : ''} ${dragging ? 'border-neutral-500 bg-neutral-100 dark:bg-white/10' : ''}`}
        onDragOver={event => { event.preventDefault(); if (!operation.current) setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)); }}
        onPaste={event => { if (event.clipboardData.files.length) { event.preventDefault(); add(Array.from(event.clipboardData.files)); } }}>
        <ImageIcon className="w-6 h-6 text-neutral-400" /><span className="type-body font-medium">Drop images here or choose files</span>
        <span className="type-caption">PNG, JPEG, WebP, BMP, AVIF · Apple HEIC / HEIF</span>
        <input ref={fileInput} type="file" multiple disabled={Boolean(busy)} accept=".png,.jpg,.jpeg,.webp,.bmp,.avif,.heic,.heif,image/png,image/jpeg,image/webp,image/bmp,image/avif,image/heic,image/heif" aria-label="Choose images to convert" className="hidden" onChange={event => { add(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <button type="button" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()} className="workspace-button workspace-button-secondary mt-2 mb-1">Choose images</button>
        <span className="type-caption">Up to 20 images · 25 MiB each · 100 MiB per batch · 24 megapixels per image</span>
      </div>
      <fieldset disabled={Boolean(busy)} className="flex flex-wrap items-end gap-5">
        <label className="type-label space-y-2">Convert to<select aria-label="Output image format" className="workspace-input block mt-2 min-w-36" value={format} onChange={event => setFormat(event.target.value as ImageFormat)}>{IMAGE_FORMATS.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
        <label className={`type-label flex-1 min-w-40 max-w-xs ${format === 'png' || format === 'bmp' ? 'opacity-50' : ''}`}>Quality · {quality}%<input type="range" min="1" max="100" step="1" aria-label="Image quality" value={quality} disabled={format === 'png' || format === 'bmp'} onChange={event => setQuality(Number(event.target.value))} className="block w-full mt-4 mb-3 accent-neutral-700 dark:accent-neutral-300" /></label>
      </fieldset>
      <p className="type-caption">JPEG and BMP use a white background for transparency. PNG, WebP and AVIF can keep transparency. Only the first image/frame is converted; animation, EXIF/GPS and HDR metadata are not preserved. HEIC/HEIF is supported as input.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={Boolean(busy) || !items.length} onClick={() => void convert()} className="workspace-button workspace-button-primary">{busy === 'convert' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}{busy === 'convert' ? 'Converting…' : 'Convert all'}</button>
        <button disabled={Boolean(busy) || !completed} onClick={() => void downloadAll()} className="workspace-button workspace-button-secondary"><Download className="w-4 h-4" />{busy === 'zip' ? 'Preparing ZIP…' : 'Download ZIP'}</button>
        {busy && <button onClick={() => operation.current?.abort()} className="workspace-button workspace-button-secondary">Cancel</button>}
        {!busy && items.length > 0 && <button onClick={() => { itemsRef.current.forEach(release); update([]); setNotice(''); }} className="workspace-button workspace-button-secondary">Clear all</button>}
        <span role="status" className="type-caption">{completed} / {items.length} ready to download</span>
      </div>
      {notice && <p role="status" className="workspace-panel p-3 type-secondary break-words">{notice}</p>}
    </div>
    {items.length > 0 && <div className="workspace-card p-4 sm:p-5 divide-y divide-neutral-100 dark:divide-white/5">
      {items.map(item => <article key={item.id} className="py-4 first:pt-0 last:pb-0 flex flex-wrap items-center gap-3">
        <div className="w-14 h-14 shrink-0 workspace-panel flex items-center justify-center overflow-hidden bg-white">{item.output ? <img src={item.output.previewUrl} alt={`Converted preview of ${item.file.name}`} width={56} height={56} className="w-full h-full object-contain" /> : <ImageIcon className="w-5 h-5 text-neutral-400" />}</div>
        <div className="min-w-0 flex-1 basis-40"><p className="type-body font-medium break-words">{item.file.name}</p><p className="type-caption mt-1">{formatBytes(item.file.size)} · {item.state === 'converting' ? 'Converting…' : item.state === 'error' ? 'Failed' : item.state === 'done' ? 'Converted' : 'Ready'}</p>
          {item.output && <p className="type-caption mt-1 break-words">{item.output.name} · {item.output.width} × {item.output.height} · {formatBytes(item.output.blob.size)}</p>}
          {item.error && <p role="alert" className="type-secondary text-red-600 dark:text-red-300 mt-1 break-words">{item.error}</p>}
        </div>
        <div className="flex gap-2">{item.output && <button onClick={() => downloadBlob(item.output!.blob, item.output!.name)} aria-label={`Download ${item.output.name}`} className="workspace-button workspace-button-secondary"><Download className="w-4 h-4" />Download</button>}
          <button disabled={Boolean(busy)} aria-label={`Remove ${item.file.name}`} onClick={() => { release(item); update(current => current.filter(row => row.id !== item.id)); setNotice(''); }} className="workspace-button workspace-button-secondary"><Trash2 className="w-4 h-4" /></button>
        </div>
      </article>)}
    </div>}
    <p className="type-caption">Change settings and choose Convert all to regenerate results. Keep this tab open until downloads finish. HEIC and AVIF codecs load only when needed. <a href="/image-codec-licenses.txt" target="_blank" rel="noreferrer" className="underline underline-offset-2">Open-source notices</a></p>
  </section>;
};
