import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { NoteItem } from '../types';

interface NewItemModalProps {
  isOpen: boolean;
  type: 'project' | 'note' | 'transfer' | null;
  onClose: () => void;
  onCreateNote: (n: Partial<NoteItem>) => Promise<void>;
  onCreateTransfer: (file: File) => Promise<void>;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({
  isOpen,
  type,
  onClose,
  onCreateNote,
  onCreateTransfer,
}) => {
  // Note form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Transfer form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNoteTitle('');
    setNoteContent('');
    setSelectedFile(null);
    setSubmitError(null);
  }, [isOpen, type]);

  if (!isOpen || !type) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || type === 'project') return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
    if (type === 'note' && noteTitle) {
      await onCreateNote({ title: noteTitle, content: noteContent || '' });
    } else if (type === 'transfer' && selectedFile) {
      await onCreateTransfer(selectedFile);
    }
    onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save. Please retry.');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div
      className="workspace-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 z-50 animate-in fade-in duration-100"
      onClick={() => { if (!isSubmitting) onClose(); }}
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
          disabled={isSubmitting}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 id="new-item-modal-title" className="type-modal-heading text-neutral-900 dark:text-white capitalize mb-1">
          {type === 'transfer' ? 'Upload to R2' : `New ${type}`}
        </h3>
        <p className="type-secondary mb-5">
          {type === 'project'
            ? 'Project saving is not available yet. Use Notes to keep your work.'
            : type === 'transfer'
            ? 'Select a file to stream directly into Cloudflare R2.'
            : 'Add a new record to your workspace.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && <p role="alert" className="type-secondary text-red-600 dark:text-red-300">{submitError}</p>}
          <fieldset disabled={isSubmitting} className="space-y-4">
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
              disabled={isSubmitting}
              onClick={onClose}
              className="workspace-button workspace-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || type === 'project'}
              className="workspace-button workspace-button-primary cursor-pointer"
            >
              Confirm
            </button>
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
};
