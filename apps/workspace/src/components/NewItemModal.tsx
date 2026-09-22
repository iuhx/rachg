import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Project, NoteItem } from '../types';

interface NewItemModalProps {
  isOpen: boolean;
  type: 'project' | 'note' | 'transfer' | null;
  onClose: () => void;
  onCreateProject: (p: Partial<Project>) => void;
  onCreateNote: (n: Partial<NoteItem>) => void;
  onCreateTransfer: (file: File) => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({
  isOpen,
  type,
  onClose,
  onCreateProject,
  onCreateNote,
  onCreateTransfer,
}) => {
  if (!isOpen || !type) return null;

  // Project form state
  const [projName, setProjName] = useState('');
  const [projTagline, setProjTagline] = useState('');
  const [projDesc, setProjDesc] = useState('');

  // Note form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Transfer form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'project' && projName) {
      onCreateProject({
        name: projName,
        tagline: projTagline || '',
        description: projDesc || '',
        status: 'Planning',
      });
    } else if (type === 'note' && noteTitle) {
      onCreateNote({
        title: noteTitle,
        content: noteContent || '',
        excerpt: (noteContent || noteTitle).slice(0, 60),
        tags: [],
        readTime: '1 min read',
      });
    } else if (type === 'transfer' && selectedFile) {
      onCreateTransfer(selectedFile);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-serif text-xl font-normal text-neutral-900 dark:text-white capitalize mb-1">
          {type === 'transfer' ? 'Upload to R2' : `New ${type}`}
        </h3>
        <p className="text-xs text-neutral-400 mb-5">
          {type === 'transfer'
            ? 'Select a file to stream directly into Cloudflare R2.'
            : 'Add a new record to your workspace.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'project' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={projTagline}
                  onChange={(e) => setProjTagline(e.target.value)}
                  placeholder="Short one-line description"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  placeholder="Architecture or implementation notes..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
            </>
          )}

          {type === 'note' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note title"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Content
                </label>
                <textarea
                  rows={5}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write your note..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white font-mono focus:outline-none"
                />
              </div>
            </>
          )}

          {type === 'transfer' && (
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Choose File
              </label>
              <input
                type="file"
                required
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-medium file:bg-neutral-900 file:text-white dark:file:bg-white dark:file:text-black hover:file:opacity-90 cursor-pointer"
              />
            </div>
          )}

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
