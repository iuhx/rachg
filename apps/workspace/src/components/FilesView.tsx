import { FILE_UPLOAD_BYTES } from '@rachg/shared';
import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Archive,
  FileCode,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  Video,
  QrCode,
  Presentation,
} from 'lucide-react';
import type { FileItem, FileCategory } from '../types';
import type { StorageBackend } from '@rachg/shared';
import { ConfirmDialog } from './ConfirmDialog';
import { StoragePicker, useUploadSettings } from './StoragePicker';

interface FilesViewProps {
  transfers: FileItem[];
  onUploadFile: (file: File, expiry: string, storageBackend?: StorageBackend) => Promise<unknown> | void;
  webdavAvailable?: boolean;
  onDeleteTransfer: (id: string, deleteRemote?: boolean) => Promise<void>;
  onGenerateQr: (file: FileItem) => void;
  isUploading?: boolean;
  isLoading?: boolean;
}

const FILE_TYPES: { value: FileCategory; label: string; icon: typeof FileText }[] = [
  { value: 'image', label: 'Images', icon: ImageIcon },
  { value: 'pdf', label: 'PDFs', icon: FileText },
  { value: 'video', label: 'Videos', icon: Video },
  { value: 'archive', label: 'Archives', icon: Archive },
  { value: 'keynote', label: 'Slides', icon: Presentation },
  { value: 'code', label: 'Code', icon: FileCode },
  { value: 'text', label: 'Text & other', icon: FileText },
];

export const FilesView: React.FC<FilesViewProps> = ({
  transfers,
  onUploadFile,
  onDeleteTransfer,
  onGenerateQr,
  isUploading = false,
  isLoading = false,
  webdavAvailable = false,
}) => {
  const { expiry: selectedExpiry, setExpiry: setSelectedExpiry, storageBackend, setStorageBackend } = useUploadSettings(webdavAvailable);
  const [typeFilter, setTypeFilter] = useState<FileCategory | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [failedUpload, setFailedUpload] = useState<{ file: File; expiry: string; storageBackend: StorageBackend } | null>(null);
  const uploadBusy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const deletingRef = useRef(false);
  const canKeepOriginal = fileToDelete?.storageBackend === 'webdav' && fileToDelete.expiresIn === 'Permanent' && !fileToDelete.expiresTimestamp;
  const fileType = (file: FileItem) => FILE_TYPES.some(type => type.value === file.type) ? file.type : 'text';
  const typeCounts = Object.fromEntries(FILE_TYPES.map(type => [type.value, transfers.filter(file => fileType(file) === type.value).length]));
  const visibleFiles = typeFilter === 'all' ? transfers : transfers.filter(file => fileType(file) === typeFilter);
  useEffect(() => {
    if (!isLoading && typeFilter !== 'all' && !typeCounts[typeFilter]) setTypeFilter('all');
  }, [isLoading, typeFilter, typeCounts[typeFilter]]);

  const confirmDelete = async () => {
    if (!fileToDelete || deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    try {
      await onDeleteTransfer(fileToDelete.id, canKeepOriginal ? deleteRemote : undefined);
      setFileToDelete(null);
    } catch {
      // The parent displays the failure. Keep this dialog open for retry.
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  const upload = async (file: File, expiry = selectedExpiry, backend = storageBackend) => {
    if (uploadBusy.current || isUploading) return;
    setUploadError(''); setFailedUpload(null);
    if (file.size > FILE_UPLOAD_BYTES) { setUploadError('Choose a file up to 99 MB. Nothing was uploaded.'); return; }
    uploadBusy.current = true;
    try { await onUploadFile(file, expiry, backend); setTypeFilter('all'); }
    catch (error) {
      setFailedUpload({ file, expiry, storageBackend: backend });
      setUploadError(error instanceof Error ? error.message : 'Upload failed. Your file is ready to retry.');
    } finally { uploadBusy.current = false; }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(''); setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { setCopyError('Clipboard access was denied. Select the file link to copy it.'); }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 1) { setUploadError('Upload one file at a time. Nothing was uploaded.'); return; }
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void upload(file);
    event.target.value = '';
  };

  const getFileIcon = (file: FileItem) => {
    const Icon = FILE_TYPES.find(type => type.value === fileType(file))?.icon || FileText;
    return <Icon className="w-4 h-4 text-neutral-400" />;
  };

  return (
    <div className="workspace-view space-y-7 pb-16">
      <header>
        <h2 className="type-page-heading text-neutral-900 dark:text-white">Files</h2>
        <p className="type-secondary mt-1">A quiet place for files you want to keep close.</p>
      </header>

      <section className="workspace-card p-5 sm:p-7 space-y-5" aria-labelledby="add-file-heading">
        {uploadError && <div role="alert" className="space-y-2 type-secondary text-red-600 dark:text-red-300"><p>{uploadError}</p>{failedUpload && <button type="button" className="workspace-button workspace-button-secondary" disabled={isUploading} onClick={() => void upload(failedUpload.file, failedUpload.expiry, failedUpload.storageBackend)}>Retry {failedUpload.file.name}</button>}</div>}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 id="add-file-heading" className="type-section-heading text-neutral-900 dark:text-white">Add a file</h3>
            <p className="type-secondary mt-0.5">Up to 99 MB per file. Choose how long it should stay available.</p>
          </div>
          <div className="workspace-field-inline">
            <span className="type-label">Keep for</span>
            <div className="workspace-segment flex-wrap" role="group" aria-label="File expiration">
              {['1 hour', '24 hours', '48 hours', '7 days', 'permanent'].map((expiry) => (
                <button
                  key={expiry}
                  type="button"
                  disabled={isUploading}
                  onClick={() => setSelectedExpiry(expiry)}
                  aria-pressed={selectedExpiry === expiry}
                  className={`workspace-segment-item cursor-pointer ${selectedExpiry === expiry ? 'workspace-segment-item-active' : ''}`}
                >
                  {expiry === 'permanent' ? 'Permanent' : expiry}
                </button>
              ))}
            </div>
          </div>
        </div>

        <StoragePicker value={storageBackend} onChange={setStorageBackend} webdavAvailable={webdavAvailable} disabled={isUploading} />
        <div
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`workspace-panel flex flex-col items-center justify-center text-center border-dashed p-8 transition-colors ${
            isDragging ? 'border-neutral-500 bg-neutral-100 dark:bg-white/10' : 'hover:border-neutral-400 dark:hover:border-white/20'
          }`}
        >
          <input ref={fileInput} type="file" aria-label="Choose file to upload" className="hidden" disabled={isUploading} onChange={handleFileInput} />
          <span className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center mb-3 text-neutral-500">
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          </span>
          <span className="type-section-heading text-neutral-900 dark:text-white">{isUploading ? 'Saving file…' : 'Drop a file here'}</span>
          <span className="type-caption mt-1">{selectedExpiry === 'permanent' ? storageBackend === 'webdav' ? 'Private. Saved permanently to WebDAV.' : 'Private. Kept until you delete it.' : 'Private. Expires after the selected time.'}</span>
          <button type="button" disabled={isUploading} onClick={() => fileInput.current?.click()} className="workspace-button workspace-button-secondary mt-3">Choose file</button>
        </div>
      </section>

      <section className="workspace-card p-5 sm:p-6 space-y-4" aria-labelledby="recent-files-heading">
        {copyError && <p role="alert" className="type-secondary text-red-600">{copyError}</p>}
        <div className="flex items-center justify-between gap-3">
          <h3 id="recent-files-heading" className="type-section-heading text-neutral-900 dark:text-white">Recent files</h3>
          {!isLoading && <span className="type-caption">{typeFilter === 'all' ? transfers.length : `${visibleFiles.length} of ${transfers.length}`} {transfers.length === 1 ? 'file' : 'files'}</span>}
        </div>

        {!isLoading && transfers.length > 0 && <div role="group" aria-label="Filter files by type" className="workspace-segment">
          <button type="button" aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')} className={`workspace-segment-item ${typeFilter === 'all' ? 'workspace-segment-item-active' : ''}`}>All <span className="type-caption">{transfers.length}</span></button>
          {FILE_TYPES.filter(type => typeCounts[type.value] > 0).map(type => <button key={type.value} type="button" aria-pressed={typeFilter === type.value} onClick={() => setTypeFilter(type.value)} className={`workspace-segment-item ${typeFilter === type.value ? 'workspace-segment-item-active' : ''}`}><type.icon className="w-3.5 h-3.5" />{type.label} <span className="type-caption">{typeCounts[type.value]}</span></button>)}
        </div>}

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
            {visibleFiles.map((file) => (
              <div key={file.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">{getFileIcon(file)}</div>
                  <div className="min-w-0">
                    <p className="type-body font-medium text-neutral-900 dark:text-white truncate">{file.name}</p>
                    <p className="type-caption mt-0.5">{file.storageBackend === 'webdav' ? 'InfiniCLOUD' : 'R2'} · {file.size} · {file.expiresIn === 'Permanent' ? 'Permanent' : `Expires in ${file.expiresIn}`} · {file.downloads || 0} downloads</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 min-w-0 sm:max-w-[22rem]">
                  <a href={file.shareUrl} target="_blank" rel="noreferrer" className="type-mono min-w-0 flex-1 text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-neutral-200/60 dark:border-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors truncate">
                    {file.shareUrl}
                  </a>
                  <button onClick={() => handleCopy(file.shareUrl || '', file.id)} className="workspace-button workspace-button-secondary min-h-8 px-2 cursor-pointer" title="Copy link" aria-label={`Copy link for ${file.name}`}>
                    {copiedId === file.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button disabled={!file.shareUrl || file.status !== 'active' || Boolean(file.expiresTimestamp && file.expiresTimestamp <= Date.now())} onClick={() => onGenerateQr(file)} className="workspace-button workspace-button-secondary min-h-8 px-2" title="Generate QR code" aria-label={`Generate QR for ${file.name}`}><QrCode className="w-4 h-4" /></button>
                  <button onClick={() => { if (!deletingRef.current) { setDeleteRemote(false); setFileToDelete(file); } }} className="workspace-button workspace-button-secondary min-h-8 px-2 text-neutral-400 hover:text-red-500 cursor-pointer" title="Delete file" aria-label={`Delete ${file.name}`}>
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
        title={canKeepOriginal ? 'Remove file?' : 'Delete file?'}
        description={canKeepOriginal
          ? deleteRemote
            ? `“${fileToDelete.name}” will be permanently deleted from the workspace and WebDAV. This cannot be undone.`
            : `“${fileToDelete.name}” will be removed from the workspace and its links will stop working. The original file will stay in WebDAV.`
          : fileToDelete ? `“${fileToDelete.name}” will be permanently removed from your private file space.` : 'This file will be permanently removed from your private file space.'}
        confirmLabel={canKeepOriginal ? deleteRemote ? 'Delete from both' : 'Remove from workspace' : 'Delete file'}
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => { if (!isDeleting) setFileToDelete(null); }}
      >
        {canKeepOriginal && <label className="type-secondary flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" className="workspace-checkbox mt-0.5" aria-label="Also delete the file from WebDAV" checked={deleteRemote} disabled={isDeleting} onChange={event => setDeleteRemote(event.target.checked)} />
          <span>Also delete the file from WebDAV</span>
        </label>}
      </ConfirmDialog>
    </div>
  );
};
