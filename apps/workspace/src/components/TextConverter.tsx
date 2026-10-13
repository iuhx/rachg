import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Copy, Download, FileText, Save, Upload } from 'lucide-react';
import { markdownToText, MARKDOWN_TEXT_BYTES } from '../utils/markdownText';
import { downloadBlob, byteLength, TOOL_TEXT_BYTES } from '../utils/qr';
import { DOCUMENT_ACCEPT, DOCUMENT_FILE_BYTES, documentName, htmlDocument, markdownDocumentHtml, type ImportedDocument } from '../utils/documentFormats';
import { checkTextSize } from '../utils/richText';
import { readDocument, createWordDocument, createPlainText } from '../services/documentConversionService';
import { MarkdownPreview } from './MarkdownPreview';
import { NewItemModal } from './NewItemModal';
import { RichTextInput } from './RichTextInput';
import type { NoteItem } from '../types';

interface Props {
  canSave: boolean; isActive: boolean;
  onSaveNote: (note: Partial<NoteItem>) => Promise<void>;
  onOpenNotes: () => void;
  onToQr: (text: string) => void;
}
type Source = 'markdown' | 'rich' | 'file';
type Target = 'plain' | 'markdown' | 'document';
export const TextConverter: React.FC<Props> = ({ canSave, isActive, onSaveNote, onOpenNotes, onToQr }) => {
  const [source, setSource] = useState<Source>('markdown');
  const [target, setTarget] = useState<Target>('plain');
  const [markdown, setMarkdown] = useState('');
  const [rich, setRich] = useState({ markdown: '', error: '' });
  const [imported, setImported] = useState<ImportedDocument | null>(null);
  const [busy, setBusy] = useState<'import' | 'export' | ''>('');
  const [notice, setNotice] = useState(''), [operationError, setOperationError] = useState('');
  const [draft, setDraft] = useState<{ title: string; content: string; snapshot: string; key: string } | null>(null);
  const [savedSources, setSavedSources] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null), operation = useRef<AbortController | null>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; operation.current?.abort(); }; }, []);
  useEffect(() => { if (!isActive) operation.current?.abort(); }, [isActive]);
  const content = source === 'markdown' ? markdown : source === 'rich' ? rich.markdown : imported?.markdown || '';
  const contentBytes = useMemo(() => byteLength(content), [content]);
  const largePlain = target === 'plain' && contentBytes > TOOL_TEXT_BYTES && contentBytes <= MARKDOWN_TEXT_BYTES;
  const [converted, setConverted] = useState({ content: '', plain: '', error: '' });
  useEffect(() => {
    if (!largePlain || !isActive) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void createPlainText(content, controller.signal).then(plain => {
        if (!controller.signal.aborted) setConverted({ content, plain, error: '' });
      }, error => { if (!controller.signal.aborted) setConverted({ content, plain: '', error: error instanceof Error ? error.message : 'Unable to convert this document.' }); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [content, largePlain, isActive]);
  const converting = largePlain && converted.content !== content;
  const immediate = useMemo(() => {
    try {
      checkTextSize(content, target === 'plain' ? MARKDOWN_TEXT_BYTES : target === 'markdown' ? DOCUMENT_FILE_BYTES : TOOL_TEXT_BYTES);
      return { plain: target === 'markdown' || largePlain ? '' : markdownToText(content), html: target === 'document' ? markdownDocumentHtml(content) : '', error: '' };
    }
    catch (error) { return { plain: '', html: '', error: error instanceof Error ? error.message : 'Unable to convert this document.' }; }
  }, [content, target, largePlain]);
  const result = largePlain ? { plain: converting ? '' : converted.plain, html: '', error: converting ? '' : converted.error } : immediate;
  const output = target === 'plain' ? result.plain : content;
  const error = (source === 'rich' ? rich.error : '') || result.error;
  const key = `${source}:${target}`, snapshot = `${target}\n${output}`;
  const saved = Boolean(output && snapshot === savedSources[key]);
  const unavailable = !output.trim() || Boolean(error) || Boolean(busy) || converting;
  const outputBytes = useMemo(() => byteLength(output), [output]);
  const noteTooLarge = outputBytes > 1_000_000;
  const qrTooLarge = byteLength(target === 'document' ? result.plain : output) > TOOL_TEXT_BYTES;
  const name = source === 'file' && imported ? imported.name : 'converted';
  const changeSource = (next: Source) => { if (busy || next === source) return; setSource(next); setTarget(next === 'markdown' ? 'plain' : 'markdown'); setNotice(''); setOperationError(''); };
  const run = async (kind: 'import' | 'export', task: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(kind); setNotice(''); setOperationError('');
    try { await task(controller.signal); }
    catch (error) { if (active.current) {
      if (controller.signal.aborted) setNotice('Conversion cancelled. Your existing input is kept.');
      else setOperationError(error instanceof Error ? error.message : 'Unable to convert this document.');
    } }
    finally { if (operation.current === controller) operation.current = null; if (active.current) setBusy(''); }
  };
  const choose = (files: File[]) => {
    if (operation.current) return;
    if (files.length !== 1) { setOperationError('Choose one document at a time. Your existing input is kept.'); return; }
    const file = files[0];
    if (!file.size || file.size > DOCUMENT_FILE_BYTES) { setOperationError('Choose a non-empty document up to 30 MB.'); return; }
    void run('import', async signal => {
      const converted = await readDocument(file, signal);
      if (signal.aborted || !active.current) return;
      setImported(converted); setSource('file'); setTarget('markdown'); setNotice('Document imported locally. You can edit the Markdown below.');
    });
  };
  const copy = async () => {
    try {
      if (target === 'document' && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([result.html], { type: 'text/html' }), 'text/plain': new Blob([result.plain], { type: 'text/plain' }) })]);
        setNotice('Formatted text copied. Paste it into a document editor.');
      } else { await navigator.clipboard.writeText(target === 'document' ? result.plain : output); setNotice(target === 'document' ? 'Copied as plain text. Download Word to keep formatting.' : 'Copied to clipboard.'); }
    } catch { setOperationError('Clipboard access was denied. Select the result to copy it, or download it.'); }
  };
  const word = () => { if (unavailable) return; void run('export', async signal => {
    const blob = await createWordDocument(content, signal);
    if (!signal.aborted && active.current) { downloadBlob(blob, documentName(name, 'docx')); setNotice('Word document downloaded.'); }
  }); };
  const openSave = () => {
    if (unavailable || !canSave || saved || noteTooLarge) return;
    const title = output.split('\n').find(line => line.trim())?.replace(/^\s{0,3}#{1,6}\s+/, '').trim().slice(0, 180).replace(/[\uD800-\uDBFF]$/, '') || 'Converted note';
    setDraft({ title, content: output, snapshot, key });
  };
  return <section className="workspace-card p-5 sm:p-6 space-y-5" aria-label="Text converter">
    <div><h3 className="type-section-heading">Text & document converter</h3><p className="type-secondary mt-1">Paste text or open a document. Convert, download or save it in Notes.</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="workspace-segment" role="group" aria-label="Input source">
        {([['markdown', 'Markdown'], ['rich', 'Rich text'], ['file', 'Document file']] as const).map(([value, label]) => <button key={value} type="button" disabled={Boolean(busy)} aria-pressed={source === value} onClick={() => changeSource(value)} className={`workspace-segment-item ${source === value ? 'workspace-segment-item-active' : ''}`}>{label}</button>)}
      </div>
      <label className="workspace-field-inline type-label">Convert to<select aria-label="Conversion output" value={target} disabled={Boolean(busy)} className="workspace-select" onChange={event => { setTarget(event.target.value as Target); setNotice(''); setOperationError(''); }}><option value="markdown">Markdown</option><option value="plain">Plain text</option><option value="document">Word / HTML</option></select></label>
    </div>
    <input ref={fileInput} type="file" accept={DOCUMENT_ACCEPT} aria-label="Choose document to convert" hidden disabled={Boolean(busy)} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) choose(files); }} />
    {source === 'file' && imported && <div className="workspace-panel flex flex-wrap items-center justify-between gap-3 p-3" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(Array.from(event.dataTransfer.files)); }}>
      <span className="type-secondary min-w-0 break-all">{imported.name}</span>
      <button type="button" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()} className="workspace-button workspace-button-secondary"><Upload className="w-4 h-4" />Choose document</button>
    </div>}
    <div className="grid md:grid-cols-2 gap-5 min-w-0">
      <div className="min-w-0">
        <label hidden={source !== 'markdown'} className="document-converter-field type-label"><span className="block">Markdown</span><textarea aria-label="Markdown input" value={markdown} disabled={Boolean(busy)} onChange={event => { setMarkdown(event.target.value); setNotice(''); setOperationError(''); }} placeholder={'# Hello\n\n- A useful idea\n- [A link](https://example.com)'} className="workspace-input workspace-input-mono document-converter-surface block resize-y" /></label>
        <fieldset hidden={source !== 'rich'} disabled={Boolean(busy)}><RichTextInput disabled={Boolean(busy)} onResult={(value, failure) => { setRich({ markdown: value, error: failure }); setNotice(''); setOperationError(''); }} /></fieldset>
        <div hidden={source !== 'file'} className="document-converter-field">
          <span className="type-label block">{imported ? 'Imported Markdown · editable' : 'Document'}</span>
          {imported ? <textarea aria-label="Imported Markdown" value={imported.markdown} disabled={Boolean(busy)} onChange={event => { setImported({ ...imported, markdown: event.target.value }); setNotice(''); setOperationError(''); }} className="workspace-input workspace-input-mono document-converter-surface block resize-y" /> :
          <div role="group" aria-label="Document upload" className="workspace-panel document-converter-surface border-dashed p-5 text-center flex flex-col items-center justify-center gap-3" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(Array.from(event.dataTransfer.files)); }}>
            <FileText className="w-6 h-6 mx-auto text-neutral-400" /><p className="type-body">Drop a document here</p><p className="type-caption">DOCX, Markdown, TXT or HTML · Up to 30 MB</p>
            <button type="button" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()} className="workspace-button workspace-button-secondary"><Upload className="w-4 h-4" />Choose document</button>
          </div>}
        </div>
      </div>
      <div className="document-converter-field">
        <span className="type-label block">{target === 'plain' ? 'Plain text' : target === 'markdown' ? 'Markdown' : 'Formatted preview'}</span>
        {target === 'document' ? <div aria-label="Document preview" className="workspace-panel document-converter-surface p-4 type-body overflow-auto">{content && !error ? <MarkdownPreview content={content} /> : <p className="type-secondary">Your formatted document appears here…</p>}</div>
          : <textarea aria-label={target === 'plain' ? 'Plain text preview' : 'Markdown preview'} value={error ? '' : output} readOnly placeholder="Your converted text appears here…" className={`workspace-input document-converter-surface block resize-y ${target === 'markdown' ? 'workspace-input-mono' : ''}`} />}
      </div>
    </div>
    {source === 'file' && imported?.warning && <p className="type-caption">{imported.warning}</p>}
    {(error || operationError) && <p role="alert" className="type-secondary text-red-600 dark:text-red-300">{error || operationError}</p>}
    {busy && <p role="status" className="type-secondary">{busy === 'import' ? 'Reading document locally…' : 'Preparing Word document…'} <button type="button" onClick={() => operation.current?.abort()} className="underline underline-offset-2">Cancel</button></p>}
    {converting && <p role="status" className="type-secondary">Converting locally… You can continue editing.</p>}
    <div className="flex flex-wrap justify-between items-center gap-3">
      <p className="type-caption">{output.length.toLocaleString()} characters · Local conversion · {target === 'plain' ? 'Markdown → TXT: up to 10 MB' : target === 'markdown' ? 'Markdown: up to 30 MB' : 'Word / HTML: up to 200 KB'}</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={unavailable} onClick={() => void copy()} className="workspace-button workspace-button-secondary"><Copy className="w-4 h-4" />{target === 'document' ? 'Copy formatted' : target === 'plain' ? 'Copy text' : 'Copy Markdown'}</button>
        {target === 'document' ? <><button disabled={unavailable} onClick={word} className="workspace-button workspace-button-secondary"><Download className="w-4 h-4" />Download Word</button><button disabled={unavailable} onClick={() => { try { downloadBlob(new Blob([htmlDocument(content)], { type: 'text/html;charset=utf-8' }), documentName(name, 'html')); } catch (error) { setOperationError(error instanceof Error ? error.message : 'Unable to export HTML.'); } }} className="workspace-button workspace-button-secondary">Download HTML</button></>
          : <button disabled={unavailable} onClick={() => downloadBlob(new Blob([output], { type: target === 'plain' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8' }), documentName(name, target === 'plain' ? 'txt' : 'md'))} className="workspace-button workspace-button-secondary"><Download className="w-4 h-4" />Download {target === 'plain' ? 'TXT' : 'MD'}</button>}
        <button disabled={unavailable || qrTooLarge} onClick={() => { if (!qrTooLarge) onToQr(target === 'document' ? result.plain : output); }} className="workspace-button workspace-button-secondary">Turn into QR<ArrowRight className="w-4 h-4" /></button>
        <button disabled={unavailable || !canSave || saved || noteTooLarge} onClick={openSave} className="workspace-button workspace-button-primary"><Save className="w-4 h-4" />{saved ? 'Saved to Notes' : 'Save to Notes'}</button>
      </div>
    </div>
    {(noteTooLarge || qrTooLarge) && !error && <p className="type-caption">{noteTooLarge ? 'Notes support up to 1 MB per note. ' : ''}{qrTooLarge ? 'QR text sharing supports up to 200 KB. ' : ''}You can copy or download the full result.</p>}
    <p className="type-caption">Headings, lists, links and simple tables are kept. Embedded images and complex page layouts are simplified. Word / HTML results save to Notes as Markdown.</p>
    {!canSave && <p className="type-caption">Sign in to save a note. Conversion, copying and downloads stay available.</p>}
    {(notice || saved) && <p role="status" className="type-secondary">{notice || 'The converted result is saved in Notes.'} {saved && <button className="underline underline-offset-2" onClick={onOpenNotes}>Open Notes</button>}</p>}
    {draft && <NewItemModal isOpen isActive={isActive} type="note" initialNote={draft} onClose={() => setDraft(null)}
      onCreateNote={async note => { await onSaveNote(note); setSavedSources(current => ({ ...current, [draft.key]: draft.snapshot })); setNotice(''); }}
      onCreateTransfer={async () => { throw new Error('Choose Save to Notes for converted text.'); }} />}
  </section>;
};
