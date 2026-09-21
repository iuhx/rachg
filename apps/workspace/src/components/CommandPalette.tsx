import React, { useState, useEffect } from 'react';
import {
  Search,
  LayoutDashboard,
  FolderDot,
  FileText,
  Paperclip,
  Settings,
  Plus,
  Sun,
  ArrowRight,
} from 'lucide-react';
import type { NavTab, Project, NoteItem, FileItem } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
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
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          setQuery('');
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navActions = [
    { label: 'Overview', tab: 'home' as NavTab, icon: LayoutDashboard },
    { label: 'Files', tab: 'files' as NavTab, icon: Paperclip },
    { label: 'Notes', tab: 'notes' as NavTab, icon: FileText },
    { label: 'Projects', tab: 'projects' as NavTab, icon: FolderDot },
    { label: 'Settings', tab: 'settings' as NavTab, icon: Settings },
  ];

  const quickActions = [
    { label: 'Upload File to R2...', action: () => onOpenNewModal('transfer'), icon: Plus },
    { label: 'New Note...', action: () => onOpenNewModal('note'), icon: Plus },
    { label: 'New Project...', action: () => onOpenNewModal('project'), icon: Plus },
    { label: 'Toggle Appearance (Duo / Dark)', action: onToggleTheme, icon: Sun },
  ];

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
        className="bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-100 dark:border-white/10">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="w-full bg-transparent text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 bg-neutral-100 dark:bg-white/5 rounded">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-4">
          {/* Navigation */}
          <div>
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              Navigation
            </div>
            <div className="space-y-0.5">
              {navActions
                .filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
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
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-neutral-400 stroke-[1.6]" />
                        <span>{a.label}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              Quick Actions
            </div>
            <div className="space-y-0.5">
              {quickActions
                .filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
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
                      <Icon className="w-4 h-4 text-neutral-400 stroke-[1.6]" />
                      <span>{a.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Files */}
          {matchedFiles.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
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
