import React, { useState } from 'react';
import {
  Upload,
  Clock,
  Copy,
  Check,
  Download,
  Trash2,
  Share2,
  FileText,
  FileCode,
  Image as ImageIcon,
  Video,
  File,
  Shield,
  QrCode,
  Sparkles,
  Loader2,
  Cloud,
} from 'lucide-react';
import type { FileItem } from '../types';

interface FilesViewProps {
  files: FileItem[];
  transfers: FileItem[];
  onUploadFile: (file: File, expiry: string) => Promise<void> | void;
  onDeleteTransfer: (id: string) => void;
  isUploading?: boolean;
}

export const FilesView: React.FC<FilesViewProps> = ({
  files,
  transfers,
  onUploadFile,
  onDeleteTransfer,
  isUploading = false,
}) => {
  const [selectedExpiry, setSelectedExpiry] = useState<string>('48 hours');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrModalItem, setQrModalItem] = useState<FileItem | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUploadFile(e.dataTransfer.files[0], selectedExpiry);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadFile(e.target.files[0], selectedExpiry);
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '')) {
      return <ImageIcon className="w-4 h-4 text-neutral-400" />;
    }
    if (['mp4', 'mov', 'webm'].includes(ext || '')) {
      return <Video className="w-4 h-4 text-neutral-400" />;
    }
    if (['zip', 'tar', 'gz'].includes(ext || '')) {
      return <FileCode className="w-4 h-4 text-neutral-400" />;
    }
    return <FileText className="w-4 h-4 text-neutral-400" />;
  };

  return (
    <div className="workspace-view space-y-7 pb-16">
      {/* Header */}
      <div>
        <h2 className="type-page-heading text-neutral-900 dark:text-white">
          File Service
        </h2>
        <p className="type-secondary mt-1">
          Temporary file transfer & edge sharing powered by Cloudflare R2 bucket (isolated <code className="font-mono text-neutral-600 dark:text-neutral-300">transfers/</code> prefix, 4GB cap).
        </p>
      </div>

      {/* Upload Station Card */}
      <div className="workspace-card p-5 sm:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="type-section-heading text-neutral-900 dark:text-white">
              Transfer New File
            </h3>
            <p className="type-secondary mt-0.5">
              Streams file to R2 with automated expiration & D1 metadata registry.
            </p>
          </div>

          {/* Expiry Selector */}
          <div className="flex items-center gap-2">
            <span className="type-label text-neutral-400">Expires in:</span>
            <div className="workspace-segment">
              {['1 hour', '24 hours', '48 hours', '7 days'].map((exp) => (
                <button
                  key={exp}
                  onClick={() => setSelectedExpiry(exp)}
                  className={`workspace-segment-item cursor-pointer ${
                    selectedExpiry === exp
                      ? 'workspace-segment-item-active'
                      : ''
                  }`}
                >
                  {exp}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Drag and drop target */}
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
            isUploading
              ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 animate-pulse'
              : 'border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/25 bg-neutral-50/40 dark:bg-white/[0.01]'
          }`}
        >
          <input
            type="file"
            className="hidden"
            disabled={isUploading}
            onChange={handleFileInput}
          />
          <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center mb-3 text-neutral-600 dark:text-neutral-300">
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
            ) : (
              <Upload className="w-5 h-5 stroke-[1.8]" />
            )}
          </div>
          <p className="type-section-heading text-neutral-900 dark:text-white">
            {isUploading
              ? 'Streaming to Cloudflare R2...'
              : 'Drop your files here, or browse'}
          </p>
          <p className="type-caption mt-1 max-w-sm">
            Temporary transfer storage quota: 4GB max total. Objects are strictly kept under <code className="font-mono text-[10px]">transfers/</code>.
          </p>
        </label>
      </div>

      {/* Active Shares Table */}
      <div className="workspace-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="type-section-heading text-neutral-900 dark:text-white">
            Active Shared Links ({transfers.length})
          </h3>
          <span className="type-mono text-neutral-400">
            R2 Bucket: transfers/ · D1 metadata
          </span>
        </div>

        <div className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
          {transfers.map((item) => (
            <div
              key={item.id}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                  {getFileIcon(item.name)}
                </div>
                <div className="min-w-0">
                  <p className="type-body font-medium text-neutral-900 dark:text-white truncate">
                    {item.name}
                  </p>
                  <p className="type-caption mt-0.5">
                    {item.size} · Expires in {item.expiresIn} · {item.downloads || 0} downloads
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={item.shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-neutral-200/60 dark:border-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors truncate max-w-xs"
                >
                  {item.shareUrl}
                </a>

                <button
                  onClick={() => handleCopy(item.shareUrl || '', item.id)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  title="Copy Link"
                >
                  {copiedId === item.id ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>

                <button
                  onClick={() => setQrModalItem(item)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  title="QR Code"
                >
                  <QrCode className="w-4 h-4" />
                </button>

                <button
                  onClick={() => onDeleteTransfer(item.id)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                  title="Delete File"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code Modal */}
      {qrModalItem && (
        <div
          className="workspace-modal-overlay fixed inset-0 bg-black/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          onClick={() => setQrModalItem(null)}
        >
          <div
            className="workspace-modal bg-white dark:bg-[#1a1b20] p-6 rounded-2xl max-w-xs w-full text-center border border-neutral-200 dark:border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="type-section-heading text-neutral-900 dark:text-white mb-1">
              Share File
            </h4>
            <p className="type-secondary mb-4 truncate">
              {qrModalItem.name}
            </p>
            {/* Minimal SVG QR Code placeholder */}
            <div className="bg-white p-4 rounded-xl border border-neutral-200 mx-auto w-44 h-44 flex items-center justify-center shadow-inner">
              <div className="grid grid-cols-5 gap-1.5 w-full h-full p-2 bg-neutral-950 rounded-lg">
                {Array.from({ length: 25 }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-xs ${
                      (i % 2 === 0 && i % 3 !== 1) || i < 5 || i > 20
                        ? 'bg-white'
                        : 'bg-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="type-mono text-neutral-400 mt-4 break-all">
              {qrModalItem.shareUrl}
            </p>
            <button
              onClick={() => setQrModalItem(null)}
              className="mt-4 w-full py-2 rounded-xl text-xs font-medium bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
