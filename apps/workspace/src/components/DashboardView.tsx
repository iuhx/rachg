import React, { useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, Copy, FileText, FolderDot, Loader2, Paperclip, Plus, Upload } from 'lucide-react';
import type { Project, FileItem, NoteItem, NavTab, ScratchpadItem } from '../types';

interface DashboardViewProps {
  projects: Project[];
  transfers: FileItem[];
  notes: NoteItem[];
  scratchpad: ScratchpadItem | null;
  isScratchpadLoading?: boolean;
  isScratchpadSaving?: boolean;
  onSaveScratchpad: (content: string, image?: File | null) => Promise<void>;
  onClearScratchpad: () => Promise<void>;
  onNavigate: (tab: NavTab) => void;
  onUploadFile: (file: File) => void;
  isUploading?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects, transfers, notes, scratchpad, isScratchpadLoading = false, isScratchpadSaving = false,
  onSaveScratchpad, onClearScratchpad, onNavigate, onUploadFile, isUploading = false,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scratchContent, setScratchContent] = useState('');
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => setScratchContent(scratchpad?.content || ''), [scratchpad?.content]);
  const saveScratch = async () => { await onSaveScratchpad(scratchContent, pendingImage); setPendingImage(null); };
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));
    if (image) { event.preventDefault(); setPendingImage(image); }
  };
  const handleDrop = (event: React.DragEvent) => { event.preventDefault(); setIsDragging(false); const image = event.dataTransfer.files?.[0]; if (image?.type.startsWith('image/')) setPendingImage(image); };
  const handleCopy = (url: string, id: string) => { navigator.clipboard.writeText(url); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };
  return (
    <div className="workspace-view space-y-8 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2"><div><h1 className="type-display text-neutral-900 dark:text-white">Welcome back.</h1><p className="type-secondary mt-2">A quiet space for notes, files, and the work in between.</p></div><p className="type-label text-neutral-500 dark:text-neutral-400">{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</p></header>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="workspace-card p-5 sm:p-6" aria-labelledby="recent-notes-heading"><div className="flex items-center justify-between mb-4"><button onClick={() => onNavigate('notes')} className="type-section-heading flex items-center gap-1.5 text-neutral-900 dark:text-white cursor-pointer"><span id="recent-notes-heading">Recent Notes</span><ChevronRight className="w-3.5 h-3.5 text-neutral-400" /></button><button onClick={() => onNavigate('notes')} aria-label="Open notes" className="workspace-button workspace-button-secondary min-h-8 px-2.5 py-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button></div>{notes.length === 0 ? <div className="workspace-empty py-10"><FileText className="w-5 h-5 text-neutral-300 dark:text-neutral-600 mb-3" /><p className="type-secondary">No notes yet.</p></div> : <div className="space-y-1">{notes.slice(0, 4).map((note) => <button key={note.id} onClick={() => onNavigate('notes')} className="w-full text-left p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-white/[0.03] cursor-pointer"><span className="type-body block font-medium text-neutral-900 dark:text-white truncate">{note.title}</span><span className="type-caption block line-clamp-1 mt-1">{note.excerpt || 'Empty note'}</span></button>)}</div>}</section>
        <section className="workspace-card p-5 sm:p-6" aria-labelledby="recent-files-heading"><div className="flex items-center justify-between mb-4"><button onClick={() => onNavigate('files')} className="type-section-heading flex items-center gap-1.5 text-neutral-900 dark:text-white cursor-pointer"><span id="recent-files-heading">Recent Files</span><ChevronRight className="w-3.5 h-3.5 text-neutral-400" /></button><Paperclip className="w-4 h-4 text-neutral-400" /></div>{transfers.length === 0 ? <div className="workspace-empty py-8"><FileText className="w-5 h-5 text-neutral-300 dark:text-neutral-600 mb-3" /><p className="type-secondary">No recent files.</p><label className="workspace-button workspace-button-secondary mt-4 cursor-pointer"><input ref={fileInputRef} type="file" className="hidden" disabled={isUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadFile(file); }} />{isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}<span>{isUploading ? 'Adding…' : 'Add a file'}</span></label></div> : <div className="space-y-1">{transfers.slice(0, 4).map((file) => <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg"><span className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center"><FileText className="w-4 h-4 text-neutral-400" /></span><span className="min-w-0 flex-1"><span className="type-body block text-neutral-800 dark:text-neutral-200 truncate">{file.name}</span><span className="type-caption block mt-0.5">{file.size} · Expires in {file.expiresIn}</span></span><button onClick={() => handleCopy(file.shareUrl || '', file.id)} aria-label={`Copy link for ${file.name}`} className="workspace-button workspace-button-secondary min-h-8 px-2 cursor-pointer">{copiedId === file.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}</button></div>)}</div>}</section>
      </div>
      <section className="workspace-card p-3 sm:p-4" aria-labelledby="scratchpad-heading"><div className="flex items-center justify-between mb-2"><div className="type-section-heading flex items-center gap-2 text-neutral-900 dark:text-white"><Paperclip className="w-3.5 h-3.5 text-neutral-400" /><span id="scratchpad-heading">Scratchpad</span></div><span className="type-caption">Temporary space</span></div><textarea value={scratchContent} onChange={(event) => setScratchContent(event.target.value)} onPaste={handlePaste} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} placeholder="Paste a thought, link, or image…" className={`workspace-input workspace-editor min-h-[3.75rem] ${isDragging ? 'border-neutral-500 bg-neutral-100 dark:bg-white/10' : ''}`} />{pendingImage && <div className="workspace-panel type-secondary mt-2 px-3 py-2 flex items-center justify-between"><span>Image ready: {pendingImage.name}</span><button onClick={() => setPendingImage(null)} className="type-label text-red-500 cursor-pointer">Remove</button></div>}{scratchpad?.imageUrl && <img src={scratchpad.imageUrl} alt="Scratchpad attachment" className="max-h-28 max-w-full rounded-lg object-contain mt-2" />}{!isScratchpadLoading && <div className="flex justify-end gap-2 mt-1.5"><button onClick={() => void onClearScratchpad()} disabled={isScratchpadSaving} className="workspace-button workspace-button-secondary min-h-8 px-2.5 py-1 cursor-pointer">Clear</button><button onClick={() => void saveScratch()} disabled={isScratchpadSaving} className="workspace-button workspace-button-primary min-h-8 px-2.5 py-1 cursor-pointer">{isScratchpadSaving ? 'Saving…' : 'Save'}</button></div>}{isScratchpadLoading && <p className="type-caption mt-1.5">Loading scratchpad…</p>}</section>
      {projects.length > 0 && <button onClick={() => onNavigate('projects')} className="type-secondary inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"><FolderDot className="w-3.5 h-3.5" /><span>Personal project space · {projects.length}</span><ArrowUpRight className="w-3.5 h-3.5" /></button>}
    </div>
  );
};
