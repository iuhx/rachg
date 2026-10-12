import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Download, FileText, QrCode, Upload } from 'lucide-react';
import type { FileItem } from '../types';
import { byteLength, createQr, downloadBlob, FILE_BYTES, LOCAL_QR_BYTES, qrPng, textShareUrl, TOOL_TEXT_BYTES, usableFile, type QrMatrix } from '../utils/qr';
import { markdownToText } from '../utils/markdownText';

export interface FileQrRequest { fileId: string; sequence: number }
interface ToolsViewProps {
  files: FileItem[];
  fileRequest: FileQrRequest | null;
  onUploadFile: (file: File, expiry: string) => Promise<FileItem>;
  canUpload: boolean;
  isActive?: boolean;
  isFilesLoading?: boolean;
}
const expiries = ['1 hour', '24 hours', '48 hours', '7 days', 'permanent'];

function QrPreview({ matrix }: { matrix: QrMatrix }) {
  const path = useMemo(() => {
    let result = '';
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
      if (matrix.data[y * matrix.size + x]) result += `M${x + 4},${y + 4}h1v1h-1z`;
    }
    return result;
  }, [matrix]);
  return <svg role="img" aria-label="QR code for the current content" viewBox={`0 0 ${matrix.size + 8} ${matrix.size + 8}`} shapeRendering="crispEdges" className="w-full max-w-72 aspect-square bg-white rounded-lg">
    <rect width="100%" height="100%" fill="white" /><path d={path} fill="black" />
  </svg>;
}

export const ToolsView: React.FC<ToolsViewProps> = ({ files, fileRequest, onUploadFile, canUpload, isActive = true, isFilesLoading = false }) => {
  const [tool, setTool] = useState<'qr' | 'markdown'>('qr');
  const [source, setSource] = useState<'text' | 'upload' | 'existing'>('text');
  const [text, setText] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [pageLink, setPageLink] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState('48 hours');
  const [filter, setFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadBusy = useRef(false);
  const selectionVersion = useRef(0);
  const [confirmation, setConfirmation] = useState<{ text: string; expiry: string } | null>(null);
  const cancelShare = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [now, setNow] = useState(Date.now);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!fileRequest) return;
    selectionVersion.current++;
    setConfirmation(null);
    setTool('qr'); setSource('existing'); setSelectedId(fileRequest.fileId); setPageLink(false); setNotice(null);
  }, [fileRequest]);
  useEffect(() => {
    if (!isActive) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [isActive]);
  useEffect(() => {
    if (!confirmation || !isActive) return;
    cancelShare.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !uploadBusy.current) setConfirmation(null);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [confirmation, isActive]);

  const activeFiles = files.filter(file => usableFile(file, now));
  const selectedFile = activeFiles.find(file => file.id === selectedId);
  const value = source === 'text' ? text : selectedFile ? (pageLink ? textShareUrl(selectedFile) : selectedFile.shareUrl || '') : '';
  const qr = useMemo(() => createQr(value), [value]);
  const plain = useMemo(() => {
    try { return { text: markdownToText(markdown), error: '' }; }
    catch (error) { return { text: '', error: error instanceof Error ? error.message : 'Unable to convert this Markdown.' }; }
  }, [markdown]);
  const isLink = source !== 'text' || /^https?:\/\/\S+$/i.test(text);
  const textSize = text.length > TOOL_TEXT_BYTES ? TOOL_TEXT_BYTES + 1 : byteLength(text);
  const reportError = (error: unknown) => setNotice({ error: true, text: error instanceof Error ? error.message : 'Unable to complete this action.' });

  const copyText = async (content: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Select the text to copy it.');
      await navigator.clipboard.writeText(content);
      setNotice({ error: false, text: 'Copied to clipboard.' });
    } catch { reportError(new Error('Clipboard access was denied. Select and copy the text, or download the result.')); }
  };
  const copyQr = async () => {
    if (qr.kind !== 'ready') return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Copying images is unavailable in this browser. Download the PNG instead.');
      // Supply the promise inside the click gesture for browsers with strict activation rules.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': qrPng(qr.matrix) })]);
      setNotice({ error: false, text: 'QR image copied.' });
    } catch (error) { reportError(error); }
  };
  const saveQr = async () => {
    if (qr.kind !== 'ready') return;
    try { downloadBlob(await qrPng(qr.matrix), 'rachg-qr.png'); }
    catch (error) { reportError(error); }
  };

  const chooseFile = (file: File) => {
    if (uploadBusy.current) return;
    if (file.size > FILE_BYTES) { reportError(new Error('Choose a file up to 10 MiB. Nothing was uploaded.')); return; }
    setPendingFile(file); setSelectedId(''); setPageLink(false); setSource('upload'); setNotice(null);
  };
  const upload = async (file: File, retention: string, asPage = false) => {
    if (uploadBusy.current || !canUpload) return;
    uploadBusy.current = true; setUploading(true); setNotice(null);
    const version = selectionVersion.current;
    try {
      const saved = await onUploadFile(file, retention);
      if (selectionVersion.current !== version) return;
      setSelectedId(saved.id); setPageLink(asPage); setSource('existing'); setPendingFile(null); setConfirmation(null);
      setNotice({ error: false, text: asPage ? 'Text share page created. The TXT file is also in Files.' : 'File saved. It is also available in Files.' });
    } catch (error) { reportError(error); }
    finally { uploadBusy.current = false; setUploading(false); }
  };
  const shareText = () => {
    if (!confirmation) return;
    const file = new File([confirmation.text], `text-share-${Date.now()}.txt`, { type: 'text/plain;charset=utf-8' });
    void upload(file, confirmation.expiry, true);
  };
  const changeSource = (next: typeof source) => {
    setSource(next); setNotice(null);
    if (next === 'upload') { setSelectedId(''); setPageLink(false); }
  };

  return <div className="workspace-view space-y-6 pb-16">
    <header><h2 className="type-page-heading text-neutral-900 dark:text-white">Tools</h2><p className="type-secondary mt-1">Everyday conversions, connected to your files.</p></header>
    <div className="workspace-segment w-fit" role="group" aria-label="Choose a tool">
      <button className={`workspace-segment-item ${tool === 'qr' ? 'workspace-segment-item-active' : ''}`} aria-pressed={tool === 'qr'} onClick={() => { setTool('qr'); setNotice(null); }}><QrCode className="w-4 h-4" />Universal QR</button>
      <button className={`workspace-segment-item ${tool === 'markdown' ? 'workspace-segment-item-active' : ''}`} aria-pressed={tool === 'markdown'} onClick={() => { setTool('markdown'); setNotice(null); }}><FileText className="w-4 h-4" />Markdown to text</button>
    </div>
    {notice && <p role={notice.error ? 'alert' : 'status'} className={`workspace-panel p-3 type-secondary ${notice.error ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}

    <section hidden={tool !== 'qr'} aria-label="Universal QR">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="workspace-card p-5 sm:p-6 space-y-5" onPaste={event => {
          const file = event.clipboardData.files[0];
          if (file) { event.preventDefault(); chooseFile(file); }
        }}>
          <div><h3 className="type-section-heading text-neutral-900 dark:text-white">What would you like to share?</h3><p className="type-secondary mt-1">Text and links become QR codes on this device.</p></div>
          <fieldset disabled={uploading} className="space-y-5">
            <div className="workspace-segment flex-wrap" role="group" aria-label="QR source">
              {([['text', 'Text or link'], ['upload', 'Upload a file'], ['existing', 'Workspace files']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={source === id} onClick={() => changeSource(id)} className={`workspace-segment-item ${source === id ? 'workspace-segment-item-active' : ''}`}>{label}</button>)}
            </div>
            {source === 'text' && <div className="space-y-3">
              <label className="type-label block" htmlFor="qr-input">Text or URL</label>
              <textarea id="qr-input" value={text} onChange={event => { setText(event.target.value); setNotice(null); }} placeholder="Paste a link, Wi-Fi details, or a short message…" className="workspace-input tool-qr-input resize-y" />
              <p className="type-caption">{textSize > TOOL_TEXT_BYTES ? 'Over 200,000' : textSize.toLocaleString()} bytes · Generated locally · No upload</p>
              {qr.kind === 'error' && <p role="alert" className="type-secondary text-red-600 dark:text-red-300">{qr.message}</p>}
              {qr.kind === 'too-long' && <div className="workspace-panel p-4 space-y-3">
                <p className="type-body">This text is too long for a reliable QR code.</p>
                <p className="type-secondary">You can create a text share page and encode its link instead. Nothing is uploaded until you confirm.</p>
                <label className="type-label flex items-center gap-3">Keep for<select aria-label="Text share expiration" className="workspace-input w-auto" value={expiry} onChange={e => setExpiry(e.target.value)}>{expiries.map(item => <option key={item} value={item}>{item === 'permanent' ? 'Permanent' : item}</option>)}</select></label>
                <button className="workspace-button workspace-button-primary" disabled={!canUpload || textSize > TOOL_TEXT_BYTES} onClick={() => setConfirmation({ text, expiry })}>Review text share</button>
                {textSize > TOOL_TEXT_BYTES && <p className="type-secondary text-red-600">Text share pages support up to 200 KB.</p>}
                {!canUpload && <p className="type-secondary">Sign in to the workspace to create a share page.</p>}
              </div>}
            </div>}
            {source === 'upload' && <div className="space-y-4">
              <div tabIndex={0} aria-label="Paste an image or drop a file" onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => {
                event.preventDefault(); setDragging(false);
                if (event.dataTransfer.files.length > 1) { reportError(new Error('Choose one file for each QR code. Nothing was uploaded.')); return; }
                const file = event.dataTransfer.files[0]; if (file) chooseFile(file);
              }} className={`workspace-panel border-dashed p-6 text-center space-y-3 ${dragging ? 'border-neutral-500 bg-neutral-100 dark:bg-white/10' : ''}`}>
                <Upload className="w-6 h-6 mx-auto text-neutral-400" />
                <p className="type-body">Drop a file or paste an image here</p><p className="type-caption">Up to 10 MiB · Saved only when you click upload</p>
                <input type="file" aria-label="Choose QR file" className="block w-full text-xs" onChange={event => { const file = event.target.files?.[0]; if (file) chooseFile(file); event.target.value = ''; }} />
              </div>
              {pendingFile && <p className="type-body break-all">{pendingFile.name} · {(pendingFile.size / 1024).toFixed(1)} KB</p>}
              <label className="type-label flex items-center gap-3">Keep for<select aria-label="QR file expiration" className="workspace-input w-auto" value={expiry} onChange={e => setExpiry(e.target.value)}>{expiries.map(item => <option key={item} value={item}>{item === 'permanent' ? 'Permanent' : item}</option>)}</select></label>
              <button className="workspace-button workspace-button-primary" disabled={!pendingFile || !canUpload} onClick={() => { if (pendingFile) void upload(pendingFile, expiry); }}><Upload className="w-4 h-4" />{uploading ? 'Uploading…' : 'Upload & generate QR'}</button>
              <p className="type-caption">{canUpload ? 'Uploads appear in Files and use the same storage quota.' : 'Sign in to upload. Local text QR codes remain available.'}</p>
            </div>}
            {source === 'existing' && <div className="space-y-3">
              <label className="type-label block" htmlFor="qr-file-search">Find a workspace file</label>
              <input id="qr-file-search" type="search" value={filter} onChange={e => setFilter(e.target.value)} className="workspace-input" placeholder="Filter recent files…" />
              <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100 dark:divide-white/5">
                {activeFiles.filter(file => file.name.toLowerCase().includes(filter.toLowerCase())).map(file => <button type="button" key={file.id} aria-pressed={selectedId === file.id} onClick={() => { setSelectedId(file.id); setPageLink(false); setNotice(null); }} className="w-full flex items-center gap-3 text-left py-3 px-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5">
                  {selectedId === file.id ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <FileText className="w-4 h-4 shrink-0 text-neutral-400" />}<span className="min-w-0"><span className="type-body block truncate">{file.name}</span><span className="type-caption">{file.size} · {file.expiresIn}</span></span>
                </button>)}
              </div>
              {isFilesLoading ? <p className="type-secondary">Loading workspace files…</p> : activeFiles.length === 0 ? <p className="type-secondary">No available files. Upload one to get started.</p> : <p className="type-caption">Uses the existing file link. No second upload.</p>}
              {selectedId && !selectedFile && <p role="alert" className="type-secondary text-red-600">This file is no longer available. Select another file.</p>}
            </div>}
          </fieldset>
        </div>
        <aside className="workspace-card p-5 sm:p-6 space-y-4" aria-label="QR result">
          <h3 className="type-section-heading text-neutral-900 dark:text-white">Your QR code</h3>
          <div className="bg-neutral-50 dark:bg-white/5 rounded-xl min-h-64 flex items-center justify-center p-3">
            {qr.kind === 'ready' ? <QrPreview matrix={qr.matrix} /> : <div className="text-center p-4"><QrCode className="w-9 h-9 mx-auto mb-3 text-neutral-300" /><p className="type-secondary">{qr.kind === 'too-long' ? 'Review a text share to continue.' : qr.kind === 'error' ? qr.message : 'Add text or choose a file to begin.'}</p></div>}
          </div>
          {selectedFile && source !== 'text' && <p className="type-caption break-words">{selectedFile.name} · {selectedFile.expiresIn}<br />{pageLink ? 'Text share page' : 'File download'} · Sign-in required</p>}
          {value && qr.kind === 'ready' && <label className="type-caption block">{isLink ? 'Link' : 'Encoded text'}<textarea aria-label="QR content" readOnly value={value} className="workspace-input mt-1 text-xs resize-y" rows={2} /></label>}
          <div className="flex flex-wrap gap-2">
            <button disabled={qr.kind !== 'ready'} onClick={() => void copyQr()} className="workspace-button workspace-button-secondary"><Copy className="w-3.5 h-3.5" />Copy QR</button>
            <button disabled={qr.kind !== 'ready'} onClick={() => void saveQr()} className="workspace-button workspace-button-secondary"><Download className="w-3.5 h-3.5" />PNG</button>
            <button disabled={!value} onClick={() => void copyText(value)} className="workspace-button workspace-button-secondary"><Copy className="w-3.5 h-3.5" />{isLink ? 'Copy link' : 'Copy text'}</button>
          </div>
          <p className="type-caption">Text stays on this device. File and text-page links keep the workspace’s existing access protection and expiry.</p>
        </aside>
      </div>
    </section>

    <section hidden={tool !== 'markdown'} className="workspace-card p-5 sm:p-6 space-y-5" aria-label="Markdown to plain text">
      <div><h3 className="type-section-heading text-neutral-900 dark:text-white">Keep the words, lose the formatting.</h3><p className="type-secondary mt-1">Paragraphs, lists, code and link addresses stay intact. Converted locally; HTML is shown as literal text.</p></div>
      <div className="grid md:grid-cols-2 gap-5">
        <label className="type-label space-y-2">Markdown<textarea aria-label="Markdown input" value={markdown} onChange={e => { setMarkdown(e.target.value); setNotice(null); }} placeholder={'# Hello\n\n- A useful idea\n- [A link](https://example.com)'} className="workspace-input workspace-input-mono tool-markdown-input block resize-y" /></label>
        <label className="type-label space-y-2">Plain text<textarea aria-label="Plain text preview" value={plain.text} readOnly placeholder="Your plain text appears here…" className="workspace-input tool-markdown-input block resize-y" /></label>
      </div>
      {plain.error && <p role="alert" className="type-secondary text-red-600 dark:text-red-300">{plain.error}</p>}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p className="type-caption">{plain.text.length.toLocaleString()} characters · Local only · Up to 200 KB</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={!plain.text} onClick={() => void copyText(plain.text)} className="workspace-button workspace-button-secondary"><Copy className="w-4 h-4" />Copy text</button>
          <button disabled={!plain.text} onClick={() => downloadBlob(new Blob([plain.text], { type: 'text/plain;charset=utf-8' }), 'plain-text.txt')} className="workspace-button workspace-button-secondary"><Download className="w-4 h-4" />Download TXT</button>
          <button disabled={!plain.text} onClick={() => { setText(plain.text); setSource('text'); setTool('qr'); setNotice(null); }} className="workspace-button workspace-button-primary">Turn into QR<ArrowRight className="w-4 h-4" /></button>
        </div>
      </div>
    </section>

    {confirmation && isActive && <div className="workspace-modal-overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-xs p-4 flex items-center justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="text-share-title" aria-describedby="text-share-description" className="workspace-modal bg-white dark:bg-[#18191d] w-full max-w-lg p-6 space-y-4" onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <h2 id="text-share-title" className="type-modal-heading">Create a text share page?</h2>
        <p id="text-share-description" className="type-secondary">This uploads the text below as a TXT file to your R2 workspace. It will appear in Files. Opening the page requires sign-in. {confirmation.expiry === 'permanent' ? 'It stays until you delete it.' : `It expires after ${confirmation.expiry}.`}</p>
        <pre className="workspace-panel p-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{confirmation.text}</pre>
        <p className="type-caption">{byteLength(confirmation.text).toLocaleString()} bytes · QR local limit: {LOCAL_QR_BYTES.toLocaleString()} bytes</p>
        {notice?.error && <p role="alert" className="type-secondary text-red-600">{notice.text}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button ref={cancelShare} disabled={uploading} className="workspace-button workspace-button-secondary" onClick={() => setConfirmation(null)}>Cancel</button><button disabled={uploading || !canUpload} className="workspace-button workspace-button-primary" onClick={shareText}>{uploading ? 'Uploading…' : 'Upload text & create page'}</button></div>
      </div>
    </div>}
  </div>;
};
