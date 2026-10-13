import React, { useEffect, useRef, useState } from 'react';
import { Copy, Link, X } from 'lucide-react';
import type { NoteItem } from '../types';
import { createNoteShare, getNoteShare, isPublicNoteSharingReady, revokeNoteShare, type NoteShare } from '../services/noteService';
import { MarkdownPreview } from './MarkdownPreview';

interface NoteShareDialogProps { note: NoteItem; onClose: () => void }

export function NoteShareDialog({ note, onClose }: NoteShareDialogProps) {
  const [share, setShare] = useState<NoteShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [expired, setExpired] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const tooLarge = new TextEncoder().encode(note.content).byteLength > 200_000;

  useEffect(() => {
    let cancelled = false;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    void Promise.all([getNoteShare(note.id), isPublicNoteSharingReady()]).then(([data, publicReady]) => {
      if (cancelled) return;
      setShare(data.share);
      setReady(data.enabled === true && publicReady);
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load sharing status.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; previousFocus?.focus?.(); };
  }, [note.id]);

  useEffect(() => {
    if (!share) { setExpired(false); return; }
    const remaining = share.expiresTimestamp - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    setExpired(false);
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [share]);

  const create = async () => {
    if (busyRef.current || !ready || loading || tooLarge) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { setShare(await createNoteShare(note)); setNotice('Read-only link created. It expires in 7 days.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to create a share link.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const revoke = async () => {
    if (busyRef.current || !share) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await revokeNoteShare(note.id, share.token);
      setShare(null); setRevoking(false); setNotice('This link has been revoked.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to revoke this link.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const copy = async () => {
    if (!share || expired || !ready) return;
    try { await navigator.clipboard.writeText(share.url); setNotice('Link copied.'); setError(''); }
    catch { setError('Clipboard access is unavailable. Select and copy the link below.'); }
  };

  return <div className="workspace-modal-overlay fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onMouseDown={event => { if (event.target === event.currentTarget && !busyRef.current) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="note-share-title" aria-describedby="note-share-description" className="workspace-modal w-full max-w-2xl bg-white dark:bg-[#18191d] p-5 sm:p-6 space-y-4" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busyRef.current) onClose(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex="0"]') || [])
          .filter(element => element.getClientRects().length > 0);
        if (!focusable?.length) { event.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="note-share-title" className="type-modal-heading text-neutral-900 dark:text-white">Share note</h2>
          <p id="note-share-description" className="type-secondary mt-2">Anyone with the link can read and copy this snapshot. The link expires after 7 days. Later edits stay private.</p></div>
        <button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label="Close note sharing" className="workspace-button workspace-button-secondary min-h-8 px-2"><X className="w-4 h-4" /></button>
      </div>
      {loading ? <p className="type-secondary" role="status">Checking sharing status…</p> : <>
        {!ready && <p className="type-secondary text-amber-700 dark:text-amber-300" role="status">Public sharing is not available yet. The share service may need setup or may be temporarily unreachable. Close and reopen to retry.</p>}
        {share && !expired ? <>
          <label className="type-label block">Share link<input readOnly value={share.url} aria-label="Note share link" onFocus={event => event.target.select()} className="workspace-input mt-2 w-full font-mono text-xs" /></label>
          <p className="type-caption">Expires {new Date(share.expiresTimestamp).toLocaleString()} · Read only</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} disabled={busy || !ready} className="workspace-button workspace-button-primary"><Copy className="w-3.5 h-3.5" />Copy link</button>
            <button type="button" onClick={() => setRevoking(true)} disabled={busy || revoking} className="workspace-button workspace-button-secondary text-red-600 dark:text-red-400">Revoke link</button>
          </div>
          {revoking && <div className="workspace-panel p-3 space-y-3">
            <p className="type-secondary">Stop access through this link? Copies and screenshots cannot be recalled.</p>
            <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void revoke()} className="workspace-button workspace-button-primary">{busy ? 'Revoking…' : 'Confirm revoke'}</button><button type="button" disabled={busy} onClick={() => setRevoking(false)} className="workspace-button workspace-button-secondary">Keep link</button></div>
          </div>}
        </> : <>
          {expired && <p className="type-secondary">The previous link has expired. Create a new link to share the version below.</p>}
          {tooLarge && <p className="type-secondary text-amber-700 dark:text-amber-300">Shared notes support up to 200 KB. Shorten this note before sharing.</p>}
          <button type="button" onClick={() => void create()} disabled={loading || busy || !ready || tooLarge} className="workspace-button workspace-button-primary"><Link className="w-3.5 h-3.5" />{busy ? 'Creating…' : 'Create 7-day link'}</button>
        </>}
        <details className="workspace-panel p-3" open={!share || expired}>
          <summary className="type-label cursor-pointer">{share && !expired ? 'View shared snapshot' : 'Review what will be shared'}</summary>
          <article className="mt-4 max-h-64 overflow-auto type-body"><h3 className="type-section-heading mb-3 break-words">{share && !expired ? share.title : note.title}</h3><MarkdownPreview content={share && !expired ? share.content : note.content} /></article>
        </details>
        <p className="type-caption">Revoke the link or delete the original note to stop access. Anyone who received it may already have saved a copy.</p>
      </>}
      {error && <p className="type-secondary text-red-600 dark:text-red-300" role="alert">{error}</p>}
      {notice && <p className="type-secondary" role="status">{notice}</p>}
    </div>
  </div>;
}
