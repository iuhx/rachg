import React, { useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  FileCode,
  FileText,
  FolderDot,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Upload,
  Video,
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

interface ActivityItem {
  id: string;
  label: string;
  title: string;
  detail: string;
  tab: NavTab;
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

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onUploadFile(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onUploadFile(file);
    event.target.value = '';
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext || '')) return <ImageIcon className="w-4 h-4 text-neutral-400" />;
    if (ext === 'pdf') return <FileText className="w-4 h-4 text-neutral-400" />;
    if (['mov', 'mp4', 'webm'].includes(ext || '')) return <Video className="w-4 h-4 text-neutral-400" />;
    if (['zip', 'tar', 'gz'].includes(ext || '')) return <FileCode className="w-4 h-4 text-neutral-400" />;
    return <FileText className="w-4 h-4 text-neutral-400" />;
  };

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date());

  const activities: ActivityItem[] = [
    ...notes.slice(0, 3).map((note) => ({
      id: `note-${note.id}`,
      label: 'Note updated',
      title: note.title,
      detail: note.updatedAt,
      tab: 'notes' as NavTab,
    })),
    ...transfers.slice(0, 3).map((file) => ({
      id: `file-${file.id}`,
      label: 'File added',
      title: file.name,
      detail: file.updatedAt,
      tab: 'files' as NavTab,
    })),
    ...projects.slice(0, 2).map((project) => ({
      id: `project-${project.id}`,
      label: 'Project updated',
      title: project.name,
      detail: project.updatedAt,
      tab: 'projects' as NavTab,
    })),
  ].slice(0, 6);

  return (
    <div className="workspace-view space-y-8 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="type-display text-neutral-900 dark:text-white">Welcome back.</h1>
          <p className="type-secondary mt-2">A quiet space for notes, files, and the work in between.</p>
        </div>
        <p className="type-label text-neutral-500 dark:text-neutral-400">{todayFormatted}</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="workspace-card p-5 sm:p-6" aria-labelledby="recent-notes-heading">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => onNavigate('notes')} className="type-section-heading flex items-center gap-1.5 text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer">
              <span id="recent-notes-heading">Recent Notes</span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </button>
            <button onClick={() => onNavigate('notes')} className="workspace-button workspace-button-secondary min-h-8 px-2.5 py-1 cursor-pointer" aria-label="Open notes">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {notes.length === 0 ? (
            <div className="workspace-empty py-8">
              <FileText className="w-6 h-6 text-neutral-300 dark:text-neutral-600 mb-3" />
              <p className="type-section-heading text-neutral-600 dark:text-neutral-300">Start writing your first thought.</p>
              <p className="type-caption mt-1">Your private notes will live here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notes.slice(0, 4).map((note) => (
                <button key={note.id} onClick={() => onNavigate('notes')} className="w-full text-left p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer">
                  <span className="type-body block font-medium text-neutral-900 dark:text-white truncate">{note.title}</span>
                  <span className="type-caption block line-clamp-1 mt-1">{note.excerpt || 'Empty note'}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="workspace-card p-5 sm:p-6" aria-labelledby="recent-files-heading">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => onNavigate('files')} className="type-section-heading flex items-center gap-1.5 text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors cursor-pointer">
              <span id="recent-files-heading">Recent Files</span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            </button>
            <Paperclip className="w-4 h-4 text-neutral-400" />
          </div>

          <label
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`workspace-panel flex items-center gap-3 p-3 mb-3 border-dashed cursor-pointer transition-colors ${isDragging ? 'border-neutral-500 bg-neutral-100 dark:bg-white/10' : 'hover:border-neutral-400 dark:hover:border-white/20'}`}
          >
            <input ref={fileInputRef} type="file" className="hidden" disabled={isUploading} onChange={handleFileChange} />
            <span className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-500">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </span>
            <span className="min-w-0">
              <span className="type-body block text-neutral-800 dark:text-neutral-200">{isUploading ? 'Saving file…' : 'Add a file'}</span>
              <span className="type-caption block">Drop here or browse</span>
            </span>
          </label>

          {transfers.length === 0 ? (
            <div className="workspace-empty py-6">
              <p className="type-section-heading text-neutral-600 dark:text-neutral-300">Your private files will appear here.</p>
              <p className="type-caption mt-1">A small space for things you want close.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {transfers.slice(0, 4).map((file) => (
                <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors">
                  <span className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0">{getFileIcon(file.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="type-body block text-neutral-800 dark:text-neutral-200 truncate">{file.name}</span>
                    <span className="type-caption block mt-0.5">{file.size} · Expires in {file.expiresIn}</span>
                  </span>
                  <button onClick={() => handleCopyLink(file.shareUrl || '', file.id)} className="workspace-button workspace-button-secondary min-h-8 px-2 cursor-pointer" aria-label={`Copy link for ${file.name}`}>
                    {copiedId === file.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="workspace-card p-5 sm:p-6" aria-labelledby="recent-activity-heading">
        <div className="flex items-center justify-between mb-4">
          <div className="type-section-heading flex items-center gap-2 text-neutral-900 dark:text-white">
            <Activity className="w-4 h-4 text-neutral-400" />
            <span id="recent-activity-heading">Recent Activity</span>
          </div>
          <span className="type-caption">Your workspace, in motion</span>
        </div>

        {activities.length === 0 ? (
          <div className="workspace-empty py-8">
            <p className="type-section-heading text-neutral-600 dark:text-neutral-300">Your recent work will appear here.</p>
            <p className="type-caption mt-1">Write a note or add a file to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {activities.map((activity) => (
              <button key={activity.id} onClick={() => onNavigate(activity.tab)} className="text-left p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer">
                <span className="type-caption block">{activity.label}</span>
                <span className="type-body block text-neutral-800 dark:text-neutral-200 truncate mt-1">{activity.title}</span>
                <span className="type-caption block mt-1">{activity.detail}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {projects.length > 0 && (
        <button onClick={() => onNavigate('projects')} className="type-secondary inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer">
          <FolderDot className="w-3.5 h-3.5" />
          <span>{projects.length} project{projects.length === 1 ? '' : 's'} in your workspace</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
