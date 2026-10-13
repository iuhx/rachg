import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { NoteItem } from '../types';
import type { StorageBackend } from '@rachg/shared';
import { StoragePicker } from './StoragePicker';

interface NewItemModalProps {
  isOpen: boolean;
  isActive?: boolean;
  type: 'note' | 'transfer' | null;
  initialNote?: Pick<NoteItem, 'title' | 'content'>;
  onClose: () => void;
  onCreateNote: (n: Partial<NoteItem>) => Promise<void>;
  onCreateTransfer: (file: File, storageBackend?: StorageBackend) => Promise<unknown>;
  webdavAvailable?: boolean;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({
  isOpen,
  isActive = true,
  type,
  initialNote,
  onClose,
  onCreateNote,
  onCreateTransfer,
  webdavAvailable = false,
}) => {
  // Note form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Transfer form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [storageBackend, setStorageBackend] = useState<StorageBackend>('r2');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setNoteTitle(initialNote?.title || '');
    setNoteContent(initialNote?.content || '');
    setSelectedFile(null);
    setStorageBackend('r2');
    setSubmitError(null);
  }, [isOpen, type, initialNote]);

  if (!isOpen || !isActive || !type) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if ((type === 'note' && !noteTitle.trim()) || (type === 'transfer' && !selectedFile)) {
      setSubmitError(type === 'note' ? 'A note title is required.' : 'Choose a file before uploading.');
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
    if (type === 'note' && noteTitle) {
      await onCreateNote({ title: noteTitle, content: noteContent || '' });
    } else if (type === 'transfer' && selectedFile) {
      await onCreateTransfer(selectedFile, storageBackend);
    }
    onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save. Please retry.');
    } finally { submittingRef.current = false; setIsSubmitting(false); }
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
          {type === 'transfer' ? 'Upload a file' : `New ${type}`}
        </h3>
        <p className="type-secondary mb-5">
          {type === 'transfer'
            ? 'Choose a file and where to save it.'
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
            <div className="space-y-3">
              <StoragePicker value={storageBackend} onChange={setStorageBackend} webdavAvailable={webdavAvailable} disabled={isSubmitting} />
              <p className="type-label">File</p>
              <input
                ref={fileInput}
                type="file"
                aria-label="Choose file to transfer"
                disabled={isSubmitting}
                onChange={event => { const file = event.target.files?.[0]; if (file) setSelectedFile(file); event.target.value = ''; }}
                className="hidden"
              />
              <div className="workspace-field-inline">
                <button type="button" disabled={isSubmitting} onClick={() => fileInput.current?.click()} className="workspace-button workspace-button-secondary">Choose file</button>
                {selectedFile && <span className="type-secondary min-w-0 break-all">{selectedFile.name}</span>}
              </div>
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
              disabled={isSubmitting}
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
