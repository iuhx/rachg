import React, { useState } from 'react';
import { FileText, Plus, Edit3, Check, BookOpen } from 'lucide-react';
import type { NoteItem } from '../types';

interface NotesViewProps {
  notes: NoteItem[];
  onNewNote: () => void;
  onUpdateNote: (n: NoteItem) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  onNewNote,
  onUpdateNote,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notes[0]?.id || '');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const activeNote = notes.find((n) => n.id === selectedNoteId) || notes[0];

  const startEdit = () => {
    if (!activeNote) return;
    setEditContent(activeNote.content);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!activeNote) return;
    onUpdateNote({
      ...activeNote,
      content: editContent,
      excerpt: editContent.slice(0, 80) + '...',
      updatedAt: 'Just now',
      updatedTimestamp: Date.now(),
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-8 pb-20 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-neutral-900 dark:text-white font-normal tracking-tight">
            Notes
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            Personal thoughts, architecture notes, and reading reflections.
          </p>
        </div>
        <button
          onClick={onNewNote}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2]" />
          <span>New Note</span>
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="bg-white dark:bg-[#16171b] rounded-2xl p-16 border border-neutral-200/70 dark:border-white/[0.07] text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4 text-neutral-400 dark:text-neutral-500">
            <FileText className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
            No notes yet
          </h3>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 max-w-sm mx-auto leading-relaxed">
            A focused Markdown writing environment connected to your personal storage.
          </p>
          <button
            onClick={onNewNote}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Note</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[500px]">
          {/* Note List */}
          <div className="md:col-span-5 bg-white dark:bg-[#16171b] rounded-2xl p-4 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs space-y-2">
            {notes.map((note) => {
              const isSelected = note.id === selectedNoteId;
              return (
                <div
                  key={note.id}
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setIsEditing(false);
                  }}
                  className={`p-3 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-neutral-100 dark:bg-white/10 border border-neutral-300/60 dark:border-white/15'
                      : 'hover:bg-neutral-50 dark:hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                  <h4 className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                    {note.title}
                  </h4>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-1">
                    {note.excerpt}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Reader / Editor Canvas */}
          <div className="md:col-span-7 bg-white dark:bg-[#16171b] rounded-2xl p-7 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs">
            {activeNote && (
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-white/[0.06]">
                  <span className="text-[11px] font-mono text-neutral-400">
                    {activeNote.updatedAt}
                  </span>
                  {isEditing ? (
                    <button
                      onClick={saveEdit}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  ) : (
                    <button
                      onClick={startEdit}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                <div className="pt-5">
                  {isEditing ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={14}
                      className="w-full bg-neutral-50 dark:bg-black/20 p-4 rounded-xl font-mono text-xs leading-relaxed text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 focus:outline-none"
                    />
                  ) : (
                    <div className="text-xs leading-relaxed space-y-4">
                      <h3 className="font-serif text-2xl font-normal text-neutral-900 dark:text-white">
                        {activeNote.title}
                      </h3>
                      <div className="pt-2 text-neutral-700 dark:text-neutral-300 font-normal leading-loose whitespace-pre-wrap font-sans text-[13px]">
                        {activeNote.content}
                      </div>
                    </div>
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
