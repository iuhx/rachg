import React, { useState, useEffect } from 'react';
import {
  Search,
  LayoutDashboard,
  FolderDot,
  FileText,
  Paperclip,
  Mail,
  Settings,
  Wrench,
  Plus,
  Sun,
  ArrowRight,
} from 'lucide-react';
import type { NavTab, Project, NoteItem, FileItem } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: (tab: NavTab) => void;
  projects: Project[];
  notes: NoteItem[];
  transfers: FileItem[];
  onOpenNewModal: (type: 'project' | 'note' | 'transfer') => void;
  onToggleTheme: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onOpen,
  onClose,
  onNavigate,
  projects,
  notes,
  transfers,
  onOpenNewModal,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!isOpen && document.querySelector?.('[role="dialog"], [role="alertdialog"]')) return;
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          setQuery('');
          onOpen();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onOpen]);

  if (!isOpen) return null;

  const navActions = [
    { label: 'Overview', description: 'Calendar, daily tasks & system health', tab: 'home' as NavTab, icon: LayoutDashboard },
    { label: 'Projects', description: 'Tasks, progress & reference links', tab: 'projects' as NavTab, icon: FolderDot },
    { label: 'Notes', description: 'Categories, sharing, import & export', tab: 'notes' as NavTab, icon: FileText },
    { label: 'Files', description: 'Upload, download & manage files', tab: 'files' as NavTab, icon: Paperclip },
    { label: 'Mail', description: 'Read, reply to & send email', tab: 'mail' as NavTab, icon: Mail },
    { label: 'Tools', description: 'QR codes, Word, Markdown & images', tab: 'tools' as NavTab, icon: Wrench },
    { label: 'Settings', description: 'Appearance, storage & connection status', tab: 'settings' as NavTab, icon: Settings },
  ];

  const quickActions = [
    { label: 'Upload file', description: 'Save to R2 or InfiniCLOUD (WebDAV)', action: () => onOpenNewModal('transfer'), icon: Plus },
    { label: 'New note', description: 'Write a Markdown note', action: () => onOpenNewModal('note'), icon: Plus },
    { label: 'New project', description: 'Plan tasks and track progress', action: () => onOpenNewModal('project'), icon: Plus },
    { label: 'Switch theme', description: 'Switch between light and dark mode', action: onToggleTheme, icon: Sun },
  ];
  const search = query.trim().toLowerCase();
  const matchesAction = (action: { label: string; description: string }) =>
    `${action.label} ${action.description}`.toLowerCase().includes(search);

  const matchedProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );
  const matchedNotes = notes.filter((n) =>
    n.title.toLowerCase().includes(query.toLowerCase())
  );
  const matchedFiles = transfers.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 px-4 z-50 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="workspace-modal bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-100 dark:border-white/10">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspace…"
            aria-label="Search workspace"
            className="workspace-input workspace-input-plain type-body text-neutral-900 dark:text-white placeholder:text-neutral-400"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 bg-neutral-100 dark:bg-white/5 rounded">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-4">
          {/* Navigation */}
          <div>
            <div className="type-caption px-3 py-1 uppercase tracking-wider text-neutral-400">
              Go to
            </div>
            <div className="space-y-0.5">
              {navActions
                .filter(matchesAction)
                .map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.label}
                      onClick={() => {
                        onNavigate(a.tab);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex items-center gap-2.5 text-left">
                        <Icon className="w-4 h-4 shrink-0 text-neutral-400 stroke-[1.6]" />
                        <span className="min-w-0 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                          <span className="shrink-0 font-medium">{a.label}</span>
                          <span className="type-caption">{a.description}</span>
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 ml-2 text-neutral-400" />
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="type-caption px-3 py-1 uppercase tracking-wider text-neutral-400">
              Quick actions
            </div>
            <div className="space-y-0.5">
              {quickActions
                .filter(matchesAction)
                .map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.label}
                      onClick={() => {
                        a.action();
                        onClose();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <Icon className="w-4 h-4 shrink-0 text-neutral-400 stroke-[1.6]" />
                      <span className="min-w-0 flex flex-col gap-0.5 text-left sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="shrink-0 font-medium">{a.label}</span>
                        <span className="type-caption">{a.description}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {matchedProjects.length > 0 && <div>
            <div className="type-caption px-3 py-1 uppercase tracking-wider text-neutral-400">Projects</div>
            {matchedProjects.map(project => <button key={project.id} onClick={() => { onNavigate('projects'); onClose(); }} className="w-full flex justify-between gap-3 text-left px-3 py-2 rounded-xl type-secondary hover:bg-neutral-100 dark:hover:bg-white/5"><span className="truncate">{project.name}</span><span className="type-caption shrink-0">{project.status}</span></button>)}
          </div>}

          {/* Files */}
          {matchedFiles.length > 0 && (
            <div>
              <div className="type-caption px-3 py-1 uppercase tracking-wider text-neutral-400">
                Files
              </div>
              <div className="space-y-0.5">
                {matchedFiles.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      onNavigate('files');
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Paperclip className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0 stroke-[1.6]" />
                      <span className="truncate">{f.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">
                      {f.size}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
