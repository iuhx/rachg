import React, { useState, useRef } from 'react';
import {
  ChevronRight,
  Plus,
  Upload,
  Copy,
  Check,
  MoreHorizontal,
  File,
  FileText,
  FileCode,
  Image as ImageIcon,
  Video,
  Clock,
} from 'lucide-react';
import type { Project, FileItem, NoteItem, ToolItem, NavTab } from '../types';
import { ArtThumbnail } from './ArtThumbnail';

interface DashboardViewProps {
  projects: Project[];
  recentFiles: FileItem[];
  transfers: FileItem[];
  notes: NoteItem[];
  experiments: ToolItem[];
  onNavigate: (tab: NavTab) => void;
  onSelectProject: (p: Project) => void;
  onSelectNote: (n: NoteItem) => void;
  onSelectExperiment: (e: ToolItem) => void;
  onUploadFile: (file: File) => void;
  onOpenNewModal: (type: 'project' | 'note' | 'transfer' | 'experiment') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  recentFiles,
  transfers,
  notes,
  experiments,
  onNavigate,
  onSelectProject,
  onSelectNote,
  onSelectExperiment,
  onUploadFile,
  onOpenNewModal,
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
    if (ext === 'key' || ext === 'ppt') {
      return <File className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
    }
    if (['mov', 'mp4', 'webm'].includes(ext || '')) {
      return <Video className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
    }
    if (['zip', 'tar', 'gz'].includes(ext || '')) {
      return <FileCode className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
    }
    return <FileText className="w-4 h-4 text-neutral-400 stroke-[1.6]" />;
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'In Progress':
        return <span className="w-2 h-2 rounded-full bg-[#22c55e]" />;
      case 'Planning':
        return <span className="w-2 h-2 rounded-full bg-[#94a3b8]" />;
      case 'Exploring':
        return <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />;
      case 'Prototype':
        return <span className="w-2 h-2 rounded-full bg-[#a855f7]" />;
      case 'Live':
        return <span className="w-2 h-2 rounded-full bg-[#10b981]" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-[#a1a1aa]" />;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Greeting and Header Bar matching screenshot */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pt-1">
        <div>
          <h1 className="font-serif text-[44px] leading-tight text-neutral-900 dark:text-white font-normal tracking-[-0.01em]">
            Good evening.
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-0.5 font-normal tracking-wide">
            Build. Explore. Create. Repeat.
          </p>
        </div>

        {/* Date & Subtitle widget matching top right in screenshot */}
        <div className="text-left sm:text-right">
          <div className="flex items-center sm:justify-end gap-1.5 text-xs text-neutral-600 dark:text-neutral-300 font-medium">
            <span className="text-neutral-400">☾</span>
            <span>Tue, Apr 22, 2025</span>
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-400 mt-0.5">
            A calmer space for bigger ideas.
          </p>
        </div>
      </div>

      {/* Grid Row 1: Current Projects | Recent Files | Latest Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Projects Card */}
        <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => onNavigate('projects')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors group cursor-pointer"
              >
                <span>Current Projects</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => onOpenNewModal('project')}
                className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
                title="Add Project"
              >
                <Plus className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>

            <div className="space-y-4">
              {projects.slice(0, 3).map((project) => (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project)}
                  className="flex items-start gap-3.5 p-1 -mx-1 rounded-xl hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer group"
                >
                  <ArtThumbnail
                    id={project.id}
                    name={project.name}
                    gradient={project.thumbnailGradient}
                    styleVariant={project.thumbnailStyle}
                    className="w-12 h-12 rounded-xl mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100 group-hover:text-black dark:group-hover:text-white transition-colors truncate">
                        {project.name}
                      </h3>
                      <span className="text-[11px] text-neutral-400 flex-shrink-0">
                        Updated {project.updatedAt}
                      </span>
                    </div>
                    <p className="text-[12px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">
                      {project.tagline}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {getStatusDot(project.status)}
                      <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
                        {project.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Files Card */}
        <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => onNavigate('files')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors group cursor-pointer"
              >
                <span>Recent Files</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => onOpenNewModal('transfer')}
                className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
                title="Upload file"
              >
                <Plus className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>

            <div className="space-y-3.5">
              {recentFiles.slice(0, 5).map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between gap-3 p-1 -mx-1 rounded-lg hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-neutral-200 dark:group-hover:bg-white/10 transition-colors">
                      {getFileIcon(file.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-normal text-neutral-800 dark:text-neutral-200 truncate group-hover:text-neutral-950 dark:group-hover:text-white">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {file.size}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-neutral-400 flex-shrink-0">
                    {file.updatedAt}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Latest Notes Card */}
        <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => onNavigate('notes')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors group cursor-pointer"
              >
                <span>Latest Notes</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => onOpenNewModal('note')}
                className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
                title="New Note"
              >
                <Plus className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>

            <div className="space-y-3.5">
              {notes.slice(0, 5).map((note) => (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note)}
                  className="flex items-start justify-between gap-3 p-1 -mx-1 rounded-lg hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors group cursor-pointer"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-colors stroke-[1.6]" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200 truncate group-hover:text-neutral-950 dark:group-hover:text-white">
                        {note.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {note.excerpt}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-neutral-400 flex-shrink-0 mt-0.5">
                    {note.updatedAt}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid Row 2: File Transfer (2 cols) | Experiments (1 col) matching screenshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File Transfer Section (spanning 2 columns) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => onNavigate('files')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors group cursor-pointer"
              >
                <span>File Transfer</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                <Clock className="w-3.5 h-3.5 stroke-[1.6]" />
                <span>Temporary file sharing</span>
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
                onChange={handleFileChange}
              />
              <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-2 text-neutral-600 dark:text-neutral-300">
                <Upload className="w-4 h-4 stroke-[1.8]" />
              </div>
              <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                Drag and drop files here
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                or click to browse
              </p>
              <p className="text-[10px] text-neutral-400 mt-1">
                Files are automatically deleted after the expiration period.
              </p>
            </div>

            {/* Active Transfers List matching screenshot */}
            <div className="mt-5 space-y-2.5">
              {transfers.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 p-1.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors group"
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
                    <span className="hidden sm:inline-block font-mono text-[11px] text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">
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
                    <button
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                      title="More Options"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-neutral-100 dark:border-white/[0.05]">
            <button
              onClick={() => onNavigate('files')}
              className="text-xs font-normal text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              View file history →
            </button>
          </div>
        </div>

        {/* Experiments Card (1 column) matching screenshot */}
        <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => onNavigate('tools')}
                className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors group cursor-pointer"
              >
                <span>Experiments</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => onOpenNewModal('experiment')}
                className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors cursor-pointer"
                title="Add Experiment"
              >
                <Plus className="w-4 h-4 stroke-[1.8]" />
              </button>
            </div>

            <div className="space-y-4">
              {experiments.slice(0, 4).map((exp) => (
                <div
                  key={exp.id}
                  onClick={() => onSelectExperiment(exp)}
                  className="flex items-center justify-between gap-3 p-1 -mx-1 rounded-xl hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ArtThumbnail
                      id={exp.id}
                      name={exp.name}
                      gradient={exp.thumbnailGradient}
                      className="w-10 h-10 rounded-xl"
                    />
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-medium text-neutral-800 dark:text-neutral-200 truncate group-hover:text-black dark:group-hover:text-white">
                        {exp.name}
                      </h4>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {exp.tagline}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      {getStatusDot(exp.status)}
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {exp.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400">
                      {exp.updatedAt}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-neutral-100 dark:border-white/[0.05]">
            <button
              onClick={() => onNavigate('tools')}
              className="text-xs font-normal text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
            >
              View all experiments →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
