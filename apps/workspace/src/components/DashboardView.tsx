import React, { useState, useRef } from 'react';
import {
  ChevronRight,
  Plus,
  Upload,
  Copy,
  Check,
  File,
  FileText,
  FileCode,
  Image as ImageIcon,
  Video,
  Clock,
  FolderDot,
  ArrowUpRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import type { Project, FileItem, NoteItem, NavTab } from '../types';

interface DashboardViewProps {
  projects: Project[];
  transfers: FileItem[];
  notes: NoteItem[];
  onNavigate: (tab: NavTab) => void;
  onUploadFile: (file: File) => void;
  isUploading?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  transfers,
  notes,
  onNavigate,
  onUploadFile,
  isUploading = false,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadFile(e.target.files[0]);
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '')) {
      return <ImageIcon className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
    }
    if (ext === 'pdf') {
      return <FileText className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
    }
    if (['mov', 'mp4', 'webm'].includes(ext || '')) {
      return <Video className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
    }
    if (['zip', 'tar', 'gz'].includes(ext || '')) {
      return <FileCode className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
    }
    return <FileText className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
  };

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="space-y-8 pb-20 max-w-6xl">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pt-2">
        <div>
          <h1 className="font-serif text-[42px] leading-none text-neutral-900 dark:text-white font-normal tracking-[-0.015em]">
            Good evening.
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-2 font-normal tracking-normal">
            Build. Explore. Create. Repeat.
          </p>
        </div>

        <div className="text-left sm:text-right">
          <div className="flex items-center sm:justify-end gap-1.5 text-xs text-neutral-600 dark:text-neutral-300 font-medium">
            <span className="text-neutral-400">☾</span>
            <span>{todayFormatted}</span>
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
            A calmer space for bigger ideas.
          </p>
        </div>
      </div>

      {/* Main Grid: File Transfer (Primary Live Service) & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Left: Active File Transfer Vault (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#16171b] rounded-2xl p-7 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => onNavigate('files')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer group"
              >
                <span>File Transfer</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <Clock className="w-3.5 h-3.5 stroke-[1.6]" />
                <span>Temporary Edge Storage</span>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border border-dashed py-8 px-4 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-neutral-500 bg-neutral-100/80 dark:bg-white/10'
                  : 'border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/25 bg-neutral-50/50 dark:bg-white/[0.02]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                disabled={isUploading}
                onChange={handleFileChange}
              />
              <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-2 text-neutral-600 dark:text-neutral-300">
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-800 dark:text-neutral-200" />
                ) : (
                  <Upload className="w-4 h-4 stroke-[1.8]" />
                )}
              </div>
              <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                {isUploading ? 'Streaming to Cloudflare R2...' : 'Drag and drop files here'}
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                or click to browse
              </p>
              <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">
                Files are stored directly in R2 and purged after expiration.
              </p>
            </div>

            {/* Active Transfers List */}
            <div className="mt-5">
              {transfers.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-neutral-400">No active transfers</p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                    Uploaded files will appear here with temporary sharing links.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transfers.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0 text-neutral-500">
                          {getFileIcon(item.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200 truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-neutral-400">
                            {item.size} · Expires in {item.expiresIn}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="hidden sm:inline-block font-mono text-[11px] text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors truncate max-w-[160px]">
                          {item.shareUrl}
                        </span>
                        <button
                          onClick={() => handleCopyLink(item.shareUrl || '', item.id)}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          title="Copy Share Link"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 stroke-[1.6]" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-neutral-100 dark:border-white/[0.05]">
            <button
              onClick={() => onNavigate('files')}
              className="text-xs font-normal text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              Manage file transfers →
            </button>
          </div>
        </div>

        {/* Right: Notes & Projects Overview (5 Cols) */}
        <div className="lg:col-span-5 space-y-7">
          {/* Notes Card */}
          <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-colors">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => onNavigate('notes')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer group"
              >
                <span>Latest Notes</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => onNavigate('notes')}
                className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
                title="Open Notes"
              >
                <Plus className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="py-7 text-center">
                <FileText className="w-6 h-6 text-neutral-300 dark:text-neutral-600 mx-auto mb-2 stroke-[1.4]" />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">No notes yet</p>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                  A personal Markdown writing space is planned here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.slice(0, 3).map((note) => (
                  <div
                    key={note.id}
                    onClick={() => onNavigate('notes')}
                    className="p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                      {note.title}
                    </p>
                    <p className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">
                      {note.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projects Card */}
          <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-colors">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => onNavigate('projects')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer group"
              >
                <span>Projects</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => onNavigate('projects')}
                className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
                title="Open Projects"
              >
                <Plus className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="py-7 text-center">
                <FolderDot className="w-6 h-6 text-neutral-300 dark:text-neutral-600 mx-auto mb-2 stroke-[1.4]" />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">No projects yet</p>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
                  Your private projects will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 3).map((proj) => (
                  <div
                    key={proj.id}
                    onClick={() => onNavigate('projects')}
                    className="p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                      {proj.name}
                    </p>
                    <p className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">
                      {proj.tagline}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
