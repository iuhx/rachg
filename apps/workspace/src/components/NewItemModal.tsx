import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Project, NoteItem } from '../types';

interface NewItemModalProps {
  isOpen: boolean;
  type: 'project' | 'note' | 'transfer' | null;
  onClose: () => void;
  onCreateProject: (p: Partial<Project>) => void;
  onCreateNote: (n: Partial<NoteItem>) => Promise<void>;
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
  // Project form state
  const [projName, setProjName] = useState('');
  const [projTagline, setProjTagline] = useState('');
  const [projDesc, setProjDesc] = useState('');

  // Note form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Transfer form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setProjName('');
    setProjTagline('');
    setProjDesc('');
    setNoteTitle('');
    setNoteContent('');
    setSelectedFile(null);
  }, [isOpen, type]);

  if (!isOpen || !type) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'project' && projName) {
      onCreateProject({
        name: projName,
        tagline: projTagline || '',
        description: projDesc || '',
        status: 'Planning',
      });
    } else if (type === 'note' && noteTitle) {
      try {
        await onCreateNote({ title: noteTitle, content: noteContent || '' });
      } catch {
        return;
      }
    } else if (type === 'transfer' && selectedFile) {
      onCreateTransfer(selectedFile);
    }
    onClose();
  };

  return (
    <div
      className="workspace-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 z-50 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="workspace-modal bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-item-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 id="new-item-modal-title" className="type-modal-heading text-neutral-900 dark:text-white capitalize mb-1">
          {type === 'transfer' ? 'Upload to R2' : `New ${type}`}
        </h3>
        <p className="type-secondary mb-5">
          {type === 'transfer'
            ? 'Select a file to stream directly into Cloudflare R2.'
            : 'Add a new record to your workspace.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'project' && (
            <>
              <div>
                <label className="type-label block text-neutral-700 dark:text-neutral-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="Project name"
                  className="workspace-input"
                />
              </div>
              <div>
                <label className="type-label block text-neutral-700 dark:text-neutral-300 mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={projTagline}
                  onChange={(e) => setProjTagline(e.target.value)}
                  placeholder="Short one-line description"
                  className="workspace-input"
                />
              </div>
              <div>
                <label className="type-label block text-neutral-700 dark:text-neutral-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  placeholder="Architecture or implementation notes..."
                  className="workspace-input min-h-[6rem]"
                />
              </div>
            </>
          )}

          {type === 'note' && (
            <>
              <div>
                <label className="type-label block text-neutral-700 dark:text-neutral-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Note title"
                  className="workspace-input"
                />
              </div>
              <div>
                <label className="type-label block text-neutral-700 dark:text-neutral-300 mb-1">
                  Content
                </label>
                <textarea
                  rows={5}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write your note..."
                  className="workspace-input workspace-input-mono min-h-[10rem]"
                />
              </div>
            </>
          )}

          {type === 'transfer' && (
            <div>
              <label className="type-label block text-neutral-700 dark:text-neutral-300 mb-2">
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
              className="workspace-button workspace-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="workspace-button workspace-button-primary cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
