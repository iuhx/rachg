import React, { useEffect, useState } from 'react';
import { Check, Edit3, FileText, Plus, Trash2 } from 'lucide-react';
import type { NoteItem } from '../types';
import { MarkdownPreview } from './MarkdownPreview';

interface NotesViewProps {
  notes: NoteItem[];
  onNewNote: () => void;
  onUpdateNote: (note: NoteItem) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  onNewNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(notes[0]?.id || '');
      setIsEditing(false);
    }
  }, [notes, selectedNoteId]);

  const activeNote = notes.find((note) => note.id === selectedNoteId) || notes[0];

  const startEdit = () => {
    if (!activeNote) return;
    setEditTitle(activeNote.title);
    setEditContent(activeNote.content);
    setErrorMessage(null);
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!activeNote || !editTitle.trim()) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onUpdateNote({
        ...activeNote,
        title: editTitle.trim(),
        content: editContent,
      });
      setIsEditing(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save note.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeNote = async () => {
    if (!activeNote || !window.confirm(`Delete “${activeNote.title}”?`)) return;
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
          <h2 className="view-heading font-serif text-neutral-900 dark:text-white font-normal tracking-tight">Notes</h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            Private Markdown notes, kept in your workspace.
          </p>
        </div>
        <button onClick={onNewNote} className="workspace-button workspace-button-primary cursor-pointer shadow-xs">
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>New Note</span>
        </button>
      </div>

      {errorMessage && (
        <div className="workspace-panel px-4 py-3 text-xs text-red-600 dark:text-red-300" role="alert">
          {errorMessage}
        </div>
      )}

      {notes.length === 0 ? (
        <div className="workspace-card p-10 sm:p-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4 text-neutral-400 dark:text-neutral-500">
            <FileText className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="text-sm font-medium text-neutral-900 dark:text-white">No notes yet</h3>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-sm mx-auto leading-relaxed">
            Start with a small Markdown note. It will be saved privately to D1.
          </p>
          <button onClick={onNewNote} className="workspace-button workspace-button-secondary mt-6 cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Note</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:min-h-[500px]">
          <div className="workspace-card md:col-span-5 p-3 space-y-1">
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => { setSelectedNoteId(note.id); setIsEditing(false); setErrorMessage(null); }}
                className={`w-full text-left p-3 rounded-xl transition-colors cursor-pointer ${
                  note.id === activeNote?.id
                    ? 'bg-neutral-100 dark:bg-white/10 border border-neutral-300/60 dark:border-white/15'
                    : 'hover:bg-neutral-50 dark:hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <span className="block text-xs font-medium text-neutral-900 dark:text-white truncate">{note.title}</span>
                <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-1">{note.excerpt || 'Empty note'}</span>
                <span className="block text-[10px] text-neutral-400 mt-2">{note.updatedAt}</span>
              </button>
            ))}
          </div>

          <div className="workspace-card md:col-span-7 p-5 sm:p-7">
            {activeNote && (
              <div>
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-neutral-100 dark:border-white/[0.06]">
                  <span className="text-[11px] font-mono text-neutral-400">Updated {activeNote.updatedAt}</span>
                  <div className="flex items-center gap-1.5">
                    {isEditing ? (
                      <button onClick={saveEdit} disabled={isSaving || !editTitle.trim()} className="workspace-button workspace-button-primary min-h-8 px-3 py-1 cursor-pointer disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSaving ? 'Saving…' : 'Save'}</span>
                      </button>
                    ) : (
                      <button onClick={startEdit} className="workspace-button workspace-button-secondary min-h-8 px-3 py-1 cursor-pointer">
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}
                    <button onClick={removeNote} disabled={isDeleting} title="Delete note" aria-label="Delete note" className="workspace-button workspace-button-secondary min-h-8 px-2 text-red-500 hover:text-red-600 cursor-pointer disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-5">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="Note title" className="w-full bg-transparent text-2xl font-serif text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-white/10 pb-2 focus:outline-none focus:border-neutral-500" />
                      <textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={18} aria-label="Markdown content" className="w-full bg-neutral-50 dark:bg-black/20 p-4 rounded-xl font-mono text-xs leading-relaxed text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-neutral-300/50 dark:focus:ring-white/15" />
                    </div>
                  ) : (
                    <article className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                      <h3 className="font-serif text-2xl font-normal text-neutral-900 dark:text-white mb-5">{activeNote.title}</h3>
                      <MarkdownPreview content={activeNote.content} />
                    </article>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
