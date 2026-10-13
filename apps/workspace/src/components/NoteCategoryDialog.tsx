import React, { useEffect, useRef, useState } from 'react';
import { Check, Edit3, Plus, Trash2, X } from 'lucide-react';
import type { NoteCategory } from '../types';
import { deleteNoteCategory, saveNoteCategory } from '../services/noteService';

interface Props {
  categories: NoteCategory[];
  counts: Record<string, number>;
  onChanged: (categories: NoteCategory[]) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

export function NoteCategoryDialog({ categories, counts, onChanged, onRefresh, onClose }: Props) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<NoteCategory | null>(null);
  const [deleting, setDeleting] = useState<NoteCategory | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const busyRef = useRef(false), pendingCreate = useRef({ id: crypto.randomUUID(), name: '' });
  const dialogRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; inputRef.current?.focus(); return () => previous?.focus?.(); }, []);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to update categories.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const save = () => run(async () => {
    if (!name.trim()) return;
    if (pendingCreate.current.name !== name) pendingCreate.current = { id: crypto.randomUUID(), name };
    const result = await saveNoteCategory(editing ? { ...editing, name } : pendingCreate.current);
    setName(''); setEditing(null); pendingCreate.current = { id: crypto.randomUUID(), name: '' };
    await onChanged(result);
  });
  return <div className="workspace-modal-overlay fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onMouseDown={event => { if (event.target === event.currentTarget && !busyRef.current) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="note-category-title" className="workspace-modal w-full max-w-lg bg-white dark:bg-[#18191d] p-5 sm:p-6 space-y-4" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busyRef.current) { if (deleting) setDeleting(null); else onClose(); } }
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []).filter(element => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (!first) event.preventDefault();
        else if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="flex items-center justify-between gap-3"><h2 id="note-category-title" className="type-modal-heading">Categories</h2><button disabled={busy} onClick={onClose} aria-label="Close categories" className="workspace-button workspace-button-secondary px-2"><X className="w-4 h-4" /></button></div>
      <p className="type-secondary">Give each note a home. Deleting a category moves its notes to Uncategorized and keeps their content and pins.</p>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void save(); }}>
        <input ref={inputRef} value={name} disabled={busy || Boolean(deleting)} maxLength={40} onChange={event => setName(event.target.value)} aria-label={editing ? 'Rename category' : 'New category name'} placeholder={editing ? 'Rename category' : 'New category name'} className="workspace-input min-w-0 flex-1" />
        <button disabled={busy || Boolean(deleting) || !name.trim() || (!editing && categories.length >= 50)} className="workspace-button workspace-button-primary">{editing ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{editing ? 'Save' : 'Add'}</button>
        {editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setName(''); }} className="workspace-button workspace-button-secondary">Cancel</button>}
      </form>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {!categories.length && <p className="type-secondary p-3">No categories yet. Try Work, Learning or Personal.</p>}
        {categories.map(category => <div key={category.id} className="workspace-panel flex items-center gap-2 px-3 py-2">
          <span className="type-body min-w-0 flex-1 truncate" title={category.name}>{category.name}</span><span className="type-caption">{counts[category.id] ?? 0}</span>
          <button disabled={busy || Boolean(deleting)} onClick={() => { setEditing(category); setName(category.name); inputRef.current?.focus(); }} aria-label={`Rename ${category.name}`} className="workspace-button workspace-button-secondary min-h-8 px-2"><Edit3 className="w-3.5 h-3.5" /></button>
          <button disabled={busy || Boolean(deleting)} onClick={() => setDeleting(category)} aria-label={`Delete ${category.name}`} className="workspace-button workspace-button-secondary min-h-8 px-2 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>)}
      </div>
      {deleting && <div role="alert" className="workspace-panel p-3 space-y-3"><p className="type-secondary">Delete “{deleting.name}”? Its notes will move to Uncategorized. No notes will be deleted.</p><div className="flex gap-2"><button disabled={busy} onClick={() => void run(async () => { const result = await deleteNoteCategory(deleting); setDeleting(null); if (editing?.id === deleting.id) { setEditing(null); setName(''); } await onChanged(result); })} className="workspace-button bg-red-600 text-white">Delete category</button><button disabled={busy} onClick={() => setDeleting(null)} className="workspace-button workspace-button-secondary">Cancel</button></div></div>}
      {error && <div role="alert" className="space-y-2"><p className="type-secondary text-red-600 dark:text-red-300">{error}</p><button disabled={busy} onClick={() => void run(async () => { await onRefresh(); setEditing(null); setDeleting(null); setName(''); })} className="workspace-button workspace-button-secondary">Refresh categories</button></div>}
      <p className="type-caption">{categories.length} / 50 categories · one level, one category per note</p>
    </div>
  </div>;
}
