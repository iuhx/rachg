import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import type { NoteItem } from '../types';
import { API_CONNECT_URL } from '../config/api';
import { fetchNotesForExport, importNote } from '../services/noteService';
import { downloadNoteFile, markdownArchive, noteBackup, parseNoteFiles, type ImportNote } from '../utils/noteTransfer';
import { MarkdownPreview } from './MarkdownPreview';

interface Props { mode: 'import' | 'export'; onClose: () => void; onImported: (note: NoteItem) => void }
type Item = ImportNote & { status: 'pending' | 'saved' | 'skipped' };

export function NoteTransferDialog({ mode, onClose, onImported }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false), stop = useRef(false), active = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const remaining = items.filter(item => item.status === 'pending').length;
  const completed = items.length - remaining;

  useEffect(() => {
    active.current = true;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { active.current = false; stop.current = true; previous?.focus?.(); };
  }, []);

  const choose = async (files: File[]) => {
    if (busyRef.current || !files.length) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice(''); setItems([]);
    try {
      const parsed = await parseNoteFiles(files);
      if (active.current) { setItems(parsed.map(item => ({ ...item, status: 'pending' }))); setSelected(0); }
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : 'Unable to read these files.'); }
    finally { busyRef.current = false; if (active.current) setBusy(false); }
  };

  const runImport = async () => {
    if (busyRef.current || !remaining) return;
    busyRef.current = true; stop.current = false; setBusy(true); setError(''); setNotice('');
    try {
      for (const item of items) {
        if (stop.current) break;
        if (item.status !== 'pending') continue;
        const result = await importNote({ id: item.id, title: item.title, content: item.content });
        onImported(result.note);
        if (active.current) setItems(current => current.map(candidate => candidate.id === item.id ? { ...candidate, status: result.imported ? 'saved' : 'skipped' } : candidate));
      }
      if (active.current) setNotice(stop.current ? 'Paused. You can continue with the remaining notes.' : 'Import finished. Your notes are available in Notes.');
    } catch (error) {
      if (active.current) setError(`${error instanceof Error ? error.message : 'Import interrupted.'} Completed notes are kept. Retry remaining notes safely.`);
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  };

  const runExport = async (format: 'json' | 'zip') => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const notes = await fetchNotesForExport();
      if (!notes.length) throw new Error('There are no saved notes to export.');
      const blob = format === 'json' ? new Blob([noteBackup(notes)], { type: 'application/json;charset=utf-8' }) : await markdownArchive(notes);
      if (!active.current) return;
      downloadNoteFile(blob, `rachg-notes-${new Date().toISOString().slice(0, 10)}.${format}`);
      setNotice(`Exported ${notes.length} saved note${notes.length === 1 ? '' : 's'}.`);
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : 'Unable to export notes.'); }
    finally { busyRef.current = false; if (active.current) setBusy(false); }
  };

  return <div className="workspace-modal-overlay fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onMouseDown={event => { if (event.target === event.currentTarget && !busyRef.current) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="note-transfer-title" className="workspace-modal w-full max-w-2xl bg-white dark:bg-[#18191d] p-5 sm:p-6 space-y-4" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busyRef.current) onClose(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary, [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="flex items-start justify-between gap-3"><h2 id="note-transfer-title" className="type-modal-heading">{mode === 'import' ? 'Import notes' : 'Export all notes'}</h2><button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label="Close note transfer" className="workspace-button workspace-button-secondary min-h-8 px-2"><X className="w-4 h-4" /></button></div>
      {mode === 'import' ? <>
        <p className="type-secondary">Choose Markdown, TXT or a JSON backup. Review locally, then import as new private notes. Exact title-and-content matches are skipped; existing notes are never overwritten.</p>
        <input ref={inputRef} type="file" multiple hidden accept=".md,.markdown,.txt,.json" aria-label="Choose notes to import" disabled={busy} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void choose(files); }} />
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="workspace-button workspace-button-secondary"><Upload className="w-3.5 h-3.5" />{items.length ? 'Choose different files' : 'Choose files'}</button>
        <p className="type-caption">Up to 1,000 notes / 20 MB per import; 1 MB per note. For exported ZIPs, extract and select notes.json to restore exact titles.</p>
        {busy && !items.length && <p className="type-secondary" role="status">Reading files…</p>}
        {items.length > 0 && <>
          <p className="type-secondary" role="status">{items.length} notes · {completed} processed · {items.filter(item => item.status === 'skipped').length} already present</p>
          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
            <div className="workspace-panel max-h-64 overflow-y-auto p-2 space-y-1">{items.map((item, index) => <button key={item.id} type="button" onClick={() => setSelected(index)} className={`block w-full text-left rounded-lg p-2 ${selected === index ? 'bg-neutral-100 dark:bg-white/10' : ''}`}><span className="type-body block truncate">{item.title}</span><span className="type-caption">{item.status === 'saved' ? 'Imported' : item.status === 'skipped' ? 'Already present' : `${item.content.length.toLocaleString()} characters`}</span></button>)}</div>
            <article tabIndex={0} aria-label="Import preview" className="workspace-panel max-h-64 overflow-auto p-3 type-body"><h3 className="type-section-heading mb-3 break-words">{items[selected]?.title}</h3><MarkdownPreview content={items[selected]?.content || ''} /></article>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !remaining} onClick={() => void runImport()} className="workspace-button workspace-button-primary">{busy ? 'Importing…' : completed ? `Import remaining (${remaining})` : `Import ${items.length} notes`}</button>{busy && <button type="button" onClick={() => { stop.current = true; setNotice('Stopping after the current note…'); }} className="workspace-button workspace-button-secondary">Stop after current note</button>}</div>
        </>}
      </> : <>
        <p className="type-secondary">Download all saved notes. Unsaved edits and public share links are not included. Files are downloaded to this device.</p>
        <div className="space-y-3">
          <button type="button" disabled={busy} onClick={() => void runExport('json')} className="workspace-panel w-full p-4 text-left"><span className="type-body flex items-center gap-2 font-medium"><Download className="w-4 h-4" />JSON backup</span><span className="type-secondary block mt-1">Keep exact titles and content. Import this file to restore notes.</span></button>
          <button type="button" disabled={busy} onClick={() => void runExport('zip')} className="workspace-panel w-full p-4 text-left"><span className="type-body flex items-center gap-2 font-medium"><Download className="w-4 h-4" />Markdown ZIP</span><span className="type-secondary block mt-1">Individual Markdown files plus notes.json for restoring exact titles.</span></button>
        </div>
        {busy && <p className="type-secondary" role="status">Preparing your download…</p>}
      </>}
      {error && <div role="alert" className="space-y-2"><p className="type-secondary text-red-600 dark:text-red-300">{error}</p><a href={API_CONNECT_URL} className="type-secondary underline">Reconnect workspace</a></div>}
      {notice && <p className="type-secondary" role="status">{notice}</p>}
    </div>
  </div>;
}
