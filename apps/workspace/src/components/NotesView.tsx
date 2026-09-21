import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Tag,
  Clock,
  Pin,
  ChevronRight,
  BookOpen,
  Edit3,
  Check,
  Eye,
} from 'lucide-react';
import type { NoteItem } from '../types';

interface NotesViewProps {
  notes: NoteItem[];
  onSelectNote: (n: NoteItem) => void;
  onNewNote: () => void;
  onUpdateNote: (n: NoteItem) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  onSelectNote,
  onNewNote,
  onUpdateNote,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notes[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const activeNote = notes.find((n) => n.id === selectedNoteId) || notes[0];

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-neutral-900 dark:text-white font-normal tracking-tight">
            Writing & Notes
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            Markdown thoughts, architecture blueprints, essays, and reading notes.
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

      {/* Two Column Layout: List on Left, Calm Reader on Right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[600px]">
        {/* Left Column: Note List (5 cols) */}
        <div className="md:col-span-5 bg-white dark:bg-[#16171b] rounded-2xl p-4 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs flex flex-col">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search thoughts & notes..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 transition-all"
            />
          </div>

          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {filteredNotes.map((note) => {
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
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                      {note.title}
                    </h4>
                    {note.pinned && (
                      <Pin className="w-3 h-3 text-neutral-400 rotate-45 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-1">
                    {note.excerpt}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-400 font-mono">
                    <span>{note.updatedAt}</span>
                    <span>·</span>
                    <span>{note.readTime}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Reader / Editor Canvas (7 cols) */}
        <div className="md:col-span-7 bg-white dark:bg-[#16171b] rounded-2xl p-7 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs flex flex-col justify-between">
          {activeNote ? (
            <div>
              {/* Note Header & Actions */}
              <div className="flex items-center justify-between pb-5 border-b border-neutral-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-neutral-400">
                    {activeNote.updatedAt}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-700">·</span>
                  <span className="text-[11px] text-neutral-400">
                    {activeNote.readTime}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <button
                      onClick={saveEdit}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
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
              </div>

              {/* Note Content */}
              <div className="pt-6">
                {isEditing ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={18}
                    className="w-full bg-neutral-50 dark:bg-black/20 p-4 rounded-xl font-mono text-xs leading-relaxed text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                ) : (
                  <div className="prose prose-neutral dark:prose-invert max-w-none text-xs leading-relaxed space-y-4">
                    <h3 className="font-serif text-2xl font-normal text-neutral-900 dark:text-white tracking-tight">
                      {activeNote.title}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {activeNote.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-mono text-[10px]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div className="pt-4 text-neutral-700 dark:text-neutral-300 font-normal leading-loose whitespace-pre-wrap font-sans text-[13px]">
                      {activeNote.content}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 text-xs">
              <BookOpen className="w-8 h-8 stroke-[1.2] mb-2 opacity-50" />
              <span>Select or create a note to begin reading.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
