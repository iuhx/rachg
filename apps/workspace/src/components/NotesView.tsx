import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Edit3, Eye, FileText, Folder, PenLine, Pin, Plus, Search, Settings2, Share2, Trash2, Upload, X } from 'lucide-react';
import type { NoteItem, NoteCategory } from '../types';
import { API_CONNECT_URL } from '../config/api';
import { MarkdownPreview } from './MarkdownPreview';
import { ConfirmDialog } from './ConfirmDialog';
import { NoteShareDialog } from './NoteShareDialog';
import { NoteTransferDialog } from './NoteTransferDialog';
import { NoteCategoryDialog } from './NoteCategoryDialog';
import { fetchNoteCategories, fetchNotes, organizeNote } from '../services/noteService';
import { filterOrganizedNotes } from '../utils/noteOrganization';
import { downloadNoteFile, markdownFilename } from '../utils/noteTransfer';
import { rememberDraft, recoverDraft, discardSavedDraft, discardDeletedDraft } from './noteDrafts';

interface NotesViewProps {
  notes: NoteItem[];
  isLoading?: boolean;
  isActive?: boolean;
  loadError?: string;
  onRetry?: () => void;
  canImport?: boolean;
  onImportedNote?: (note: NoteItem) => void;
  onNewNote: (categoryId?: string | null) => void;
  onOrganizationNotes?: (notes: NoteItem[]) => void;
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
  isActive = true,
  loadError = '',
  onRetry,
  canImport = true,
  onImportedNote = () => {},
  onNewNote,
  onOrganizationNotes = () => {},
  onUpdateNote,
  onDeleteNote,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('write');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<NoteCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchAll, setSearchAll] = useState(false);
  const [manageCategories, setManageCategories] = useState(false);
  const [organizationError, setOrganizationError] = useState('');
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const organizationBusyRef = useRef(false), categoryLoad = useRef(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isDeleting, setIsDeleting] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<NoteItem | null>(null);
  const [noteToShare, setNoteToShare] = useState<NoteItem | null>(null);
  const [transferMode, setTransferMode] = useState<'import' | 'export' | null>(null);
  const deletingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const editVersion = useRef(0);
  const [recovered, setRecovered] = useState(false);

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

  useEffect(() => {
    if (!activeNote) return;
    const draft = recoverDraft(activeNote.id);
    if (!draft) return;
    setEditTitle(draft.title);
    setEditContent(draft.content);
    setIsEditing(true);
    setRecovered(true);
    setSaveState('dirty');
    setErrorMessage('Recovered a draft from this tab. Review it and choose Save.');
  }, [activeNote?.id]);

  const changeDraft = (title: string, content: string) => {
    setEditTitle(title);
    setEditContent(content);
    editVersion.current++;
    if (activeNote && !rememberDraft({ ...activeNote, title, content })) {
      setErrorMessage('Draft backup is unavailable in this browser. Keep this page open until saving succeeds.');
    }
  };

  const filteredNotes = useMemo(() => filterOrganizedNotes(notes, categoryFilter, searchQuery, searchAll), [notes, categoryFilter, searchQuery, searchAll]);
  const counts = useMemo(() => {
    const result: Record<string, number> = Object.create(null);
    for (const note of notes) { const key = note.categoryId ?? ''; result[key] = (result[key] ?? 0) + 1; }
    return result;
  }, [notes]);
  useEffect(() => {
    if (!isLoading && !loadError && categoryFilter === '' && !counts['']) setCategoryFilter('all');
  }, [isLoading, loadError, categoryFilter, counts['']]);
  useEffect(() => {
    if (isEditing || !filteredNotes.length || filteredNotes.some(note => note.id === selectedNoteId)) return;
    setSelectedNoteId(filteredNotes[0].id);
  }, [filteredNotes, selectedNoteId, isEditing]);

  useEffect(() => {
    if (!canImport || isLoading || loadError || !isActive) return;
    const version = ++categoryLoad.current;
    void fetchNoteCategories().then(result => { if (version === categoryLoad.current) { setCategories(result); setOrganizationError(''); } })
      .catch(error => { if (version === categoryLoad.current) setOrganizationError(error instanceof Error ? error.message : 'Unable to load categories.'); });
    return () => { categoryLoad.current++; };
  }, [canImport, isLoading, loadError, isActive]);

  const refreshOrganization = async (knownCategories?: NoteCategory[]) => {
    categoryLoad.current++;
    const [result, loaded] = await Promise.all([knownCategories ? Promise.resolve(knownCategories) : fetchNoteCategories(), fetchNotes()]);
    setCategories(result);
    onOrganizationNotes(loaded);
    if (categoryFilter !== 'all' && categoryFilter !== '' && !result.some(category => category.id === categoryFilter)) setCategoryFilter('');
    setOrganizationError('');
  };
  const changeOrganization = async (targetCategory: string | null, pinned: boolean) => {
    if (!activeNote || organizationBusyRef.current) return;
    organizationBusyRef.current = true; setOrganizationBusy(true); setOrganizationError('');
    try { onOrganizationNotes([await organizeNote(activeNote, targetCategory, pinned)]); }
    catch (error) { setOrganizationError(error instanceof Error ? error.message : 'Unable to organize this note.'); }
    finally { organizationBusyRef.current = false; setOrganizationBusy(false); }
  };
  const noteCategoryName = (note: NoteItem) => categories.find(category => category.id === note.categoryId)?.name || note.categoryName || 'Uncategorized';

  const clearAutosaveTimer = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  };

  const saveDraft = useCallback(async (exitAfterSave = false) => {
    if (deletingRef.current) return false;
    if (!activeNote || !editTitle.trim()) {
      setSaveState('error');
      setErrorMessage('A note title is required.');
      return false;
    }
    if (savingRef.current) {
      const unchanged = await savingRef.current;
      if (exitAfterSave && unchanged) setIsEditing(false);
      return unchanged;
    }

    clearAutosaveTimer();
    setSaveState('saving');
    setErrorMessage(null);
    const version = editVersion.current;
    const snapshot = {
      ...activeNote,
      title: editTitle.trim(),
      content: editContent,
    };
    const pending = (async () => {
      try {
        await onUpdateNote(snapshot);
        discardSavedDraft(snapshot);
        const unchanged = editVersion.current === version;
        setSaveState(unchanged ? 'saved' : 'dirty');
        setRecovered(false);
        if (exitAfterSave && unchanged) setIsEditing(false);
        return unchanged;
      } catch (error) {
        setSaveState('error');
        setErrorMessage(error instanceof Error ? error.message : 'Unable to save note.');
        return false;
      } finally { savingRef.current = null; }
    })();
    savingRef.current = pending;
    return pending;
  }, [activeNote, editContent, editTitle, onUpdateNote]);

  useEffect(() => {
    if (!isEditing || !activeNote || !isDirty || recovered || saveState === 'saving' || saveState === 'error') return;
    setSaveState('dirty');
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveDraft();
    }, 900);
    return clearAutosaveTimer;
  }, [activeNote, isDirty, isEditing, saveDraft, saveState, recovered]);

  useEffect(() => () => clearAutosaveTimer(), []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty || savingRef.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement?.closest?.('[role="dialog"], [role="alertdialog"]')) return;
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
      if (event.key === '/' && !isEditing && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isEditing, saveDraft, isActive]);

  const startEdit = () => {
    if (!activeNote) return;
    setEditTitle(activeNote.title);
    setEditContent(activeNote.content);
    setEditorMode('write');
    setSaveState('idle');
    setErrorMessage(null);
    setRecovered(false);
    setIsEditing(true);
  };

  const selectNote = async (note: NoteItem) => {
    if (savingRef.current || isDirty) {
      if (!await saveDraft()) return;
    }
    clearAutosaveTimer();
    setSelectedNoteId(note.id);
    setIsEditing(false);
    setSaveState('idle');
    setErrorMessage(null);
    setRecovered(false);
  };

  const changeCategoryFilter = async (value: string) => {
    if ((savingRef.current || isDirty) && !await saveDraft(true)) return;
    if (isEditing) setIsEditing(false);
    setCategoryFilter(value);
  };
  const newNote = async () => {
    if ((savingRef.current || isDirty) && !await saveDraft(true)) return;
    setSearchQuery('');
    onNewNote(categoryFilter === 'all' ? null : categoryFilter || null);
  };

  const removeNote = async () => {
    if (!noteToDelete || deletingRef.current) return;
    const targetId = noteToDelete.id;
    deletingRef.current = true;
    clearAutosaveTimer();
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      if (savingRef.current) await savingRef.current;
      await onDeleteNote(targetId);
      discardDeletedDraft(targetId);
      setNoteToDelete(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete note.');
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  const exportCurrentNote = () => {
    if (!activeNote || isDirty || saveState === 'saving' || recovered) return;
    try { downloadNoteFile(new Blob([activeNote.content], { type: 'text/markdown;charset=utf-8' }), markdownFilename(activeNote.title)); }
    catch { setErrorMessage('Unable to download this note. Please try again.'); }
  };

  return (
    <div className="workspace-view space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="type-page-heading text-neutral-900 dark:text-white">Notes</h2>
          <p className="type-secondary mt-1">Markdown notes, private until you choose to share.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button onClick={() => setTransferMode('import')} disabled={!canImport || isLoading || Boolean(loadError)} className="workspace-button workspace-button-secondary"><Upload className="w-3.5 h-3.5" />Import</button>
        <button onClick={() => setTransferMode('export')} disabled={isLoading || Boolean(loadError)} className="workspace-button workspace-button-secondary"><Download className="w-3.5 h-3.5" />Export all</button>
        <button onClick={() => void newNote()} className="workspace-button workspace-button-primary cursor-pointer shadow-xs">
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>New Note</span>
        </button>
        </div>
      </div>

      {errorMessage && (
        <div className="workspace-panel type-secondary px-4 py-3 text-red-600 dark:text-red-300" role="alert">{errorMessage}</div>
      )}

      {loadError && <div className="workspace-panel p-4 space-y-3" role="alert">
        <div><h3 className="type-section-heading text-neutral-900 dark:text-white">Unable to load notes</h3><p className="type-secondary mt-1">{loadError}</p></div>
        <div className="flex flex-wrap gap-2">
          <a href={API_CONNECT_URL} className="workspace-button workspace-button-primary">Reconnect workspace</a>
          {onRetry && <button type="button" disabled={isLoading} onClick={onRetry} className="workspace-button workspace-button-secondary">Retry</button>}
        </div>
      </div>}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:flex sm:gap-3">
        <label className="workspace-field-inline type-label min-w-0 flex-nowrap sm:max-w-xs">
          <Folder className="w-4 h-4 shrink-0 text-neutral-400" />
          <span className="sr-only sm:not-sr-only">Category</span>
          <select value={categoryFilter} onChange={event => void changeCategoryFilter(event.target.value)} disabled={isLoading || organizationBusy} aria-label="Filter notes by category" className="workspace-select min-w-0 flex-1 sm:flex-none">
            <option value="all">All notes ({notes.length})</option>
            {Boolean(counts['']) && <option value="">Uncategorized ({counts['']})</option>}
            {categories.map(category => <option key={category.id} value={category.id}>{category.name} ({counts[category.id] ?? 0})</option>)}
          </select>
        </label>
        <button type="button" aria-label="Manage categories" title="Manage categories" disabled={!canImport || isLoading || Boolean(loadError) || organizationBusy} onClick={() => setManageCategories(true)} className="workspace-button workspace-button-secondary h-9 w-9 min-h-9 shrink-0 p-0 sm:h-9 sm:w-auto sm:px-3"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Manage categories</span></button>
        <span className="type-caption col-span-full sm:ml-auto">{notes.filter(note => note.pinned).length} pinned · {categories.length} categories</span>
      </div>
      {organizationError && <div role="alert" className="workspace-panel px-4 py-3 space-y-2"><p className="type-secondary text-red-600 dark:text-red-300">{organizationError}</p><button disabled={organizationBusy} onClick={() => void refreshOrganization().catch(error => setOrganizationError(error instanceof Error ? error.message : 'Unable to refresh organization.'))} className="workspace-button workspace-button-secondary">Refresh organization</button></div>}

      {isLoading ? (
        <div className="workspace-card workspace-empty p-10 sm:p-16 type-secondary">Loading notes…</div>
      ) : notes.length === 0 && loadError ? null
        : notes.length === 0 ? (
        <div className="workspace-card workspace-empty p-10 sm:p-16">
          <div className="workspace-empty-icon">
            <FileText className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="type-section-heading text-neutral-900 dark:text-white">No notes yet</h3>
          <p className="type-secondary mt-1 max-w-sm mx-auto leading-relaxed">Start with a small Markdown note. It will be saved privately to D1.</p>
          <button onClick={() => void newNote()} className="workspace-button workspace-button-secondary mt-6 cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Note</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="workspace-panel flex flex-wrap items-center gap-2 px-3 py-2">
            <Search className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search notes…"
              aria-label="Search notes"
              className="workspace-input workspace-input-plain flex-1 min-w-0 type-body text-neutral-900 dark:text-white placeholder:text-neutral-400"
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery('')} aria-label="Clear note search" className="p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            ) : <span className="hidden sm:inline text-[10px] font-mono text-neutral-400">/</span>}
            {categoryFilter !== 'all' && <select aria-label="Search scope" value={searchAll ? 'all' : 'category'} onChange={event => setSearchAll(event.target.value === 'all')} className="workspace-select"><option value="category">This category</option><option value="all">All notes</option></select>}
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
                <span className="type-body flex items-center gap-2 font-medium text-neutral-900 dark:text-white"><span className="truncate">{note.title}</span>{note.pinned && <Pin aria-label="Pinned" className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" />}</span>
                  <span className="type-caption block line-clamp-1 mt-1">{note.excerpt || 'Empty note'}</span>
                  <span className="type-caption block mt-2 truncate">{noteCategoryName(note)} · {formatRelativeTime(note.updatedTimestamp, clock)}</span>
                </button>
              ))}
            </div>

            <div className="workspace-card xl:col-span-7 p-5 sm:p-7">
              {filteredNotes.length === 0 && !isEditing ? (
                <div className="workspace-empty h-full min-h-[16rem] type-secondary">
                  {searchQuery ? `No note matches “${searchQuery}”.` : 'No notes in this category yet.'}
                </div>
              ) : activeNote && (
                <div>
                  {isEditing && !filteredNotes.some(note => note.id === activeNote.id) && <p role="status" className="type-caption pb-3">Your open draft is outside the current filter. You can keep editing here.</p>}
                  <div className="flex flex-col items-start gap-2 pb-4 border-b border-neutral-100 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
                    <div className="type-mono flex items-center gap-2 text-neutral-400">
                      <span>{formatRelativeTime(activeNote.updatedTimestamp, clock)}</span>
                      {isEditing && <><span>·</span><span className={saveState === 'error' ? 'text-red-500' : saveState === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{saveStateLabel(saveState)}</span></>}
                    </div>
                    <div role="group" aria-label="Note actions" className="flex w-full flex-nowrap items-center justify-start gap-1 sm:w-auto sm:gap-1.5">
                      {isEditing ? (
                        <>
                          <div className="workspace-segment" role="group" aria-label="Note editor mode">
                            <button type="button" aria-label="Write" title="Write" aria-pressed={editorMode === 'write'} onClick={() => setEditorMode('write')} className={`workspace-segment-item h-8 w-8 justify-center p-0 sm:h-auto sm:w-auto sm:px-2 sm:py-1 ${editorMode === 'write' ? 'workspace-segment-item-active' : ''}`}><PenLine className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">Write</span></button>
                            <button type="button" aria-label="Preview" title="Preview" aria-pressed={editorMode === 'preview'} onClick={() => setEditorMode('preview')} className={`workspace-segment-item h-8 w-8 justify-center p-0 sm:h-auto sm:w-auto sm:px-2 sm:py-1 ${editorMode === 'preview' ? 'workspace-segment-item-active' : ''}`}><Eye className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">Preview</span></button>
                          </div>
                          <button type="button" aria-label={saveState === 'saving' ? 'Saving note' : 'Save note'} title={saveState === 'saving' ? 'Saving note' : 'Save note'} onClick={() => void saveDraft()} disabled={saveState === 'saving' || !editTitle.trim()} className="workspace-button workspace-button-primary h-11 min-h-11 w-auto min-w-0 flex-1 basis-0 p-0 cursor-pointer disabled:opacity-50 sm:h-8 sm:min-h-8 sm:flex-none sm:basis-auto sm:px-3 sm:py-1">
                            <Check className="h-4 w-4" /><span className="hidden sm:inline">{saveState === 'saving' ? 'Saving…' : 'Save'}</span>
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={startEdit} title="Edit note" aria-label="Edit note" className="workspace-button workspace-button-secondary h-11 min-h-11 w-auto min-w-0 flex-1 basis-0 p-0 cursor-pointer sm:h-8 sm:min-h-8 sm:flex-none sm:basis-auto sm:px-3 sm:py-1"><Edit3 className="h-4 w-4" /><span className="hidden sm:inline">Edit</span></button>
                      )}
                      <button type="button" onClick={exportCurrentNote} disabled={isDeleting || isDirty || saveState === 'saving' || recovered} title="Download note as Markdown" aria-label="Download note as Markdown" className="workspace-button workspace-button-secondary h-11 min-h-11 w-auto min-w-0 flex-1 basis-0 p-0 cursor-pointer disabled:opacity-50 sm:h-8 sm:min-h-8 sm:flex-none sm:basis-auto sm:px-3 sm:py-1"><Download className="h-4 w-4" /><span className="hidden sm:inline">Download</span></button>
                      <button type="button" onClick={() => setNoteToShare(activeNote)} disabled={isDeleting || isDirty || saveState === 'saving' || recovered} title={isDirty || recovered ? 'Save your changes before sharing' : 'Share a read-only snapshot'} aria-label="Share note" className="workspace-button workspace-button-secondary h-11 min-h-11 w-auto min-w-0 flex-1 basis-0 p-0 cursor-pointer disabled:opacity-50 sm:h-8 sm:min-h-8 sm:flex-none sm:basis-auto sm:px-3 sm:py-1"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Share</span></button>
                      <button type="button" onClick={() => setNoteToDelete(activeNote)} disabled={isDeleting} title="Delete note" aria-label="Delete note" className="workspace-button workspace-button-secondary h-11 min-h-11 w-auto min-w-0 flex-1 basis-0 p-0 text-red-500 hover:text-red-600 cursor-pointer disabled:opacity-50 sm:h-8 sm:min-h-8 sm:flex-none sm:basis-auto sm:px-3 sm:py-1"><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Delete</span></button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-4">
                    <Folder className="w-3.5 h-3.5 text-neutral-400" />
                    <select aria-label="Note category" value={activeNote.categoryId ?? ''} disabled={organizationBusy || isDeleting || !canImport} onChange={event => void changeOrganization(event.target.value || null, Boolean(activeNote.pinned))} className="workspace-select">
                      <option value="">Uncategorized</option>
                      {activeNote.categoryId && !categories.some(category => category.id === activeNote.categoryId) && <option value={activeNote.categoryId}>{activeNote.categoryName || 'Current category'}</option>}
                      {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                    <button aria-pressed={Boolean(activeNote.pinned)} disabled={organizationBusy || isDeleting || !canImport} onClick={() => void changeOrganization(activeNote.categoryId ?? null, !activeNote.pinned)} className="workspace-button workspace-button-secondary min-h-8 px-2"><Pin className={`w-3.5 h-3.5 ${activeNote.pinned ? 'text-amber-600 dark:text-amber-400' : ''}`} />{activeNote.pinned ? 'Unpin' : 'Pin note'}</button>
                    {organizationBusy && <span role="status" className="type-caption">Saving…</span>}
                  </div>

                  <div className="pt-5">
                    {isEditing ? (
                      <div className="space-y-3">
                        <input value={editTitle} onChange={(event) => changeDraft(event.target.value, editContent)} aria-label="Note title" className="workspace-input workspace-input-heading bg-transparent text-neutral-900 dark:text-white border-x-0 border-t-0 border-b border-neutral-200 dark:border-white/10 rounded-none px-0 pb-2 focus-visible:border-neutral-500" />
                        {editorMode === 'write' ? (
                          <>
                            <textarea autoFocus value={editContent} onChange={(event) => changeDraft(editTitle, event.target.value)} rows={18} aria-label="Markdown content" className="workspace-input workspace-editor bg-neutral-50 dark:bg-black/20 text-neutral-800 dark:text-neutral-200" />
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

      {isActive && manageCategories && <NoteCategoryDialog categories={categories} counts={counts} onClose={() => setManageCategories(false)} onRefresh={() => refreshOrganization()} onChanged={result => refreshOrganization(result)} />}
      {isActive && transferMode && <NoteTransferDialog mode={transferMode} onClose={() => { setTransferMode(null); if (transferMode === 'import') void refreshOrganization().catch(error => setOrganizationError(error instanceof Error ? error.message : 'Unable to refresh categories.')); }} onImported={onImportedNote} />}
      {isActive && noteToShare && <NoteShareDialog key={noteToShare.id} note={noteToShare} onClose={() => setNoteToShare(null)} />}
      <ConfirmDialog
        isOpen={isActive && noteToDelete !== null}
        title="Delete note?"
        description={noteToDelete ? `“${noteToDelete.title}” will be permanently removed and its share link revoked. Previously saved copies cannot be recalled.` : 'This note will be permanently removed and its share link revoked.'}
        confirmLabel="Delete note"
        isConfirming={isDeleting}
        onConfirm={() => void removeNote()}
        onCancel={() => { if (!isDeleting) setNoteToDelete(null); }}
      />
    </div>
  );
};
