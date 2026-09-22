import React, { useState } from 'react';
import {
  Check,
  Copy,
  FileCode,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import type { FileItem } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface FilesViewProps {
  transfers: FileItem[];
  onUploadFile: (file: File, expiry: string) => Promise<void> | void;
  onDeleteTransfer: (id: string) => void;
  isUploading?: boolean;
  isLoading?: boolean;
}

export const FilesView: React.FC<FilesViewProps> = ({
  transfers,
  onUploadFile,
  onDeleteTransfer,
  isUploading = false,
  isLoading = false,
}) => {
  const [selectedExpiry, setSelectedExpiry] = useState('48 hours');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteTransfer(fileToDelete.id);
      setFileToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onUploadFile(file, selectedExpiry);
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onUploadFile(file, selectedExpiry);
    event.target.value = '';
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '')) return <ImageIcon className="w-4 h-4 text-neutral-400" />;
    if (['mp4', 'mov', 'webm'].includes(ext || '')) return <Video className="w-4 h-4 text-neutral-400" />;
    if (['zip', 'tar', 'gz'].includes(ext || '')) return <FileCode className="w-4 h-4 text-neutral-400" />;
    return <FileText className="w-4 h-4 text-neutral-400" />;
  };

  return (
    <div className="workspace-view space-y-7 pb-16">
      <header>
        <h2 className="type-page-heading text-neutral-900 dark:text-white">Files</h2>
        <p className="type-secondary mt-1">A quiet place for files you want to keep close.</p>
      </header>

      <section className="workspace-card p-5 sm:p-7 space-y-5" aria-labelledby="add-file-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 id="add-file-heading" className="type-section-heading text-neutral-900 dark:text-white">Add a file</h3>
            <p className="type-secondary mt-0.5">Choose how long it should stay available.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="type-label text-neutral-400">Keep for</span>
            <div className="workspace-segment" role="group" aria-label="File expiration">
              {['1 hour', '24 hours', '48 hours', '7 days'].map((expiry) => (
                <button
                  key={expiry}
                  type="button"
                  onClick={() => setSelectedExpiry(expiry)}
                  aria-pressed={selectedExpiry === expiry}
                  className={`workspace-segment-item cursor-pointer ${selectedExpiry === expiry ? 'workspace-segment-item-active' : ''}`}
                >
                  {expiry}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`workspace-panel flex flex-col items-center justify-center text-center cursor-pointer border-dashed p-8 transition-colors ${
            isDragging ? 'border-neutral-500 bg-neutral-100 dark:bg-white/10' : 'hover:border-neutral-400 dark:hover:border-white/20'
          }`}
        >
          <input type="file" className="hidden" disabled={isUploading} onChange={handleFileInput} />
          <span className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center mb-3 text-neutral-500">
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          </span>
          <span className="type-section-heading text-neutral-900 dark:text-white">{isUploading ? 'Saving file…' : 'Drop a file here or browse'}</span>
          <span className="type-caption mt-1">Files are kept private and expire automatically.</span>
        </label>
      </section>

      <section className="workspace-card p-5 sm:p-6 space-y-4" aria-labelledby="recent-files-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="recent-files-heading" className="type-section-heading text-neutral-900 dark:text-white">Recent files</h3>
          {!isLoading && <span className="type-caption">{transfers.length} {transfers.length === 1 ? 'file' : 'files'}</span>}
        </div>

        {isLoading ? (
          <div className="workspace-empty py-12 type-secondary">Loading files…</div>
        ) : transfers.length === 0 ? (
          <div className="workspace-empty py-12">
            <div className="workspace-empty-icon"><FileText className="w-5 h-5" /></div>
            <p className="type-section-heading text-neutral-600 dark:text-neutral-300">Your files will appear here.</p>
            <p className="type-secondary mt-1">Upload something to keep it close.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
            {transfers.map((file) => (
              <div key={file.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">{getFileIcon(file.name)}</div>
                  <div className="min-w-0">
                    <p className="type-body font-medium text-neutral-900 dark:text-white truncate">{file.name}</p>
                    <p className="type-caption mt-0.5">{file.size} · Expires in {file.expiresIn} · {file.downloads || 0} downloads</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 min-w-0 sm:max-w-[22rem]">
                  <a href={file.shareUrl} target="_blank" rel="noreferrer" className="type-mono min-w-0 flex-1 text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-neutral-200/60 dark:border-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors truncate">
                    {file.shareUrl}
                  </a>
                  <button onClick={() => handleCopy(file.shareUrl || '', file.id)} className="workspace-button workspace-button-secondary min-h-8 px-2 cursor-pointer" title="Copy link" aria-label={`Copy link for ${file.name}`}>
                    {copiedId === file.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setFileToDelete(file)} className="workspace-button workspace-button-secondary min-h-8 px-2 text-neutral-400 hover:text-red-500 cursor-pointer" title="Delete file" aria-label={`Delete ${file.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={fileToDelete !== null}
        title="Delete file?"
        description={fileToDelete ? `“${fileToDelete.name}” will be permanently removed from your private file space.` : 'This file will be permanently removed from your private file space.'}
        confirmLabel="Delete file"
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => { if (!isDeleting) setFileToDelete(null); }}
      />
    </div>
  );
};
