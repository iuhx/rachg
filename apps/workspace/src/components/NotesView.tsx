import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Edit3, FileText, Plus, Search, Trash2, X } from 'lucide-react';
import type { NoteItem } from '../types';
import { MarkdownPreview } from './MarkdownPreview';

interface NotesViewProps {
  notes: NoteItem[];
  isLoading?: boolean;
  onNewNote: () => void;
  onUpdateNote: (note: NoteItem) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type EditorMode = 'write' | 'preview';

function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function saveStateLabel(state: SaveState): string {
  if (state === 'dirty') return 'Unsaved changes';
  if (state === 'saving') return 'Saving…';
  if (state === 'saved') return 'Saved';
  if (state === 'error') return 'Save failed';
  return 'All changes saved';
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  isLoading = false,
  onNewNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('write');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(notes[0]?.id || '');
      setIsEditing(false);
    }
  }, [notes, selectedNoteId]);

  const activeNote = notes.find((note) => note.id === selectedNoteId) || notes[0];
  const isDirty = Boolean(activeNote && isEditing && (
    editTitle.trim() !== activeNote.title || editContent !== activeNote.content
  ));

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter((note) =>
      `${note.title}\n${note.content}`.toLowerCase().includes(query)
    );
  }, [notes, searchQuery]);

  const clearAutosaveTimer = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  };

  const saveDraft = useCallback(async (exitAfterSave = false) => {
    if (!activeNote || !editTitle.trim()) {
      setSaveState('error');
      setErrorMessage('A note title is required.');
      return;
    }

    clearAutosaveTimer();
    setSaveState('saving');
    setErrorMessage(null);
    try {
      await onUpdateNote({
        ...activeNote,
        title: editTitle.trim(),
        content: editContent,
      });
      setSaveState('saved');
      if (exitAfterSave) setIsEditing(false);
    } catch (error) {
      setSaveState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save note.');
    }
  }, [activeNote, editContent, editTitle, onUpdateNote]);

  useEffect(() => {
    if (!isEditing || !activeNote || !isDirty) return;
    setSaveState('dirty');
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveDraft();
    }, 900);
    return clearAutosaveTimer;
  }, [activeNote, isDirty, isEditing, saveDraft]);

  useEffect(() => () => clearAutosaveTimer(), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === 's' && isEditing) {
        event.preventDefault();
        void saveDraft();
      }
      if (event.key === 'Escape' && isEditing) {
        event.preventDefault();
        if (isDirty) void saveDraft(true);
        else setIsEditing(false);
      }
      if (event.key === '/' && !isEditing && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isEditing, saveDraft]);

  const startEdit = () => {
    if (!activeNote) return;
    setEditTitle(activeNote.title);
    setEditContent(activeNote.content);
    setEditorMode('write');
    setSaveState('idle');
    setErrorMessage(null);
    setIsEditing(true);
  };

  const selectNote = (note: NoteItem) => {
    clearAutosaveTimer();
    setSelectedNoteId(note.id);
    setIsEditing(false);
    setSaveState('idle');
    setErrorMessage(null);
  };

  const removeNote = async () => {
    if (!activeNote || !window.confirm(`Delete “${activeNote.title}”?`)) return;
    clearAutosaveTimer();
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onDeleteNote(activeNote.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete note.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="workspace-view space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="type-page-heading text-neutral-900 dark:text-white">Notes</h2>
          <p className="type-secondary mt-1">Private Markdown notes, kept in your workspace.</p>
        </div>
        <button onClick={onNewNote} className="workspace-button workspace-button-primary cursor-pointer shadow-xs">
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>New Note</span>
        </button>
      </div>

      {errorMessage && (
        <div className="workspace-panel type-secondary px-4 py-3 text-red-600 dark:text-red-300" role="alert">{errorMessage}</div>
      )}

      {isLoading ? (
        <div className="workspace-card workspace-empty p-10 sm:p-16 type-secondary">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="workspace-card workspace-empty p-10 sm:p-16">
          <div className="workspace-empty-icon">
            <FileText className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="type-section-heading text-neutral-900 dark:text-white">No notes yet</h3>
          <p className="type-secondary mt-1 max-w-sm mx-auto leading-relaxed">Start with a small Markdown note. It will be saved privately to D1.</p>
          <button onClick={onNewNote} className="workspace-button workspace-button-secondary mt-6 cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Note</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="workspace-panel flex items-center gap-2 px-3 py-2">
            <Search className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search notes…"
              aria-label="Search notes"
              className="workspace-input workspace-input-plain type-body text-neutral-900 dark:text-white placeholder:text-neutral-400"
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery('')} aria-label="Clear note search" className="p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            ) : <span className="hidden sm:inline text-[10px] font-mono text-neutral-400">/</span>}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:min-h-[500px]">
            <div className="workspace-card xl:col-span-5 p-3 space-y-1">
              {filteredNotes.length === 0 ? (
                <div className="workspace-empty p-8 type-secondary">No matching notes.</div>
              ) : filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => selectNote(note)}
                  className={`w-full text-left p-3 rounded-xl transition-colors cursor-pointer ${
                    note.id === activeNote?.id
                      ? 'bg-neutral-100 dark:bg-white/10 border border-neutral-300/60 dark:border-white/15'
                      : 'hover:bg-neutral-50 dark:hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                <span className="type-body block font-medium text-neutral-900 dark:text-white truncate">{note.title}</span>
                  <span className="type-caption block line-clamp-1 mt-1">{note.excerpt || 'Empty note'}</span>
                  <span className="type-caption block mt-2">{formatRelativeTime(note.updatedTimestamp, clock)}</span>
                </button>
              ))}
            </div>

            <div className="workspace-card xl:col-span-7 p-5 sm:p-7">
              {filteredNotes.length === 0 ? (
                <div className="workspace-empty h-full min-h-[16rem] type-secondary">
                  No note matches “{searchQuery}”.
                </div>
              ) : activeNote && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-white/[0.06]">
                    <div className="type-mono flex items-center gap-2 text-neutral-400">
                      <span>{formatRelativeTime(activeNote.updatedTimestamp, clock)}</span>
                      {isEditing && <><span>·</span><span className={saveState === 'error' ? 'text-red-500' : saveState === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{saveStateLabel(saveState)}</span></>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <div className="flex items-center gap-0.5 workspace-panel p-0.5">
                            <button onClick={() => setEditorMode('write')} className={`workspace-button min-h-7 px-2 py-1 ${editorMode === 'write' ? 'workspace-button-primary' : 'workspace-button-secondary'}`}>Write</button>
                            <button onClick={() => setEditorMode('preview')} className={`workspace-button min-h-7 px-2 py-1 ${editorMode === 'preview' ? 'workspace-button-primary' : 'workspace-button-secondary'}`}>Preview</button>
                          </div>
                          <button onClick={() => void saveDraft()} disabled={saveState === 'saving' || !editTitle.trim()} className="workspace-button workspace-button-primary min-h-8 px-3 py-1 cursor-pointer disabled:opacity-50">
                            <Check className="w-3.5 h-3.5" /><span>{saveState === 'saving' ? 'Saving…' : 'Save'}</span>
                          </button>
                        </>
                      ) : (
                        <button onClick={startEdit} className="workspace-button workspace-button-secondary min-h-8 px-3 py-1 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /><span>Edit</span></button>
                      )}
                      <button onClick={removeNote} disabled={isDeleting} title="Delete note" aria-label="Delete note" className="workspace-button workspace-button-secondary min-h-8 px-2 text-red-500 hover:text-red-600 cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  <div className="pt-5">
                    {isEditing ? (
                      <div className="space-y-3">
                        <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="Note title" className="workspace-input workspace-input-heading bg-transparent text-neutral-900 dark:text-white border-x-0 border-t-0 border-b border-neutral-200 dark:border-white/10 rounded-none px-0 pb-2 focus-visible:border-neutral-500" />
                        {editorMode === 'write' ? (
                          <>
                            <textarea autoFocus value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={18} aria-label="Markdown content" className="workspace-input workspace-editor bg-neutral-50 dark:bg-black/20 text-neutral-800 dark:text-neutral-200" />
                            <p className="type-caption">Markdown · {editContent.length.toLocaleString()} characters · Ctrl/⌘ + S to save · Esc to save and close</p>
                          </>
                        ) : (
                          <article className="workspace-panel min-h-[26rem] p-5 type-body text-neutral-700 dark:text-neutral-300"><h3 className="type-modal-heading text-neutral-900 dark:text-white mb-5">{editTitle || 'Untitled note'}</h3><MarkdownPreview content={editContent} /></article>
                        )}
                      </div>
                    ) : (
                      <article className="type-body text-neutral-700 dark:text-neutral-300"><h3 className="type-modal-heading text-neutral-900 dark:text-white mb-5">{activeNote.title}</h3><MarkdownPreview content={activeNote.content} /></article>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
