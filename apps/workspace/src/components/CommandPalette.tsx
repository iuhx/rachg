import React, { useState, useEffect } from 'react';
import {
  Search,
  Folder,
  FileText,
  Paperclip,
  LayoutGrid,
  Settings,
  Plus,
  Moon,
  Sun,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import type { NavTab, Project, NoteItem, ToolItem, FileItem } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavTab) => void;
  projects: Project[];
  notes: NoteItem[];
  tools: ToolItem[];
  transfers: FileItem[];
  onSelectProject: (p: Project) => void;
  onSelectNote: (n: NoteItem) => void;
  onOpenNewModal: (type: 'project' | 'note' | 'transfer' | 'experiment') => void;
  onToggleTheme: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  projects,
  notes,
  tools,
  transfers,
  onSelectProject,
  onSelectNote,
  onOpenNewModal,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  // Actions list
  const navActions = [
    { label: 'Go to Home Dashboard', tab: 'home' as NavTab, icon: LayoutGrid },
    { label: 'Go to Projects', tab: 'projects' as NavTab, icon: Folder },
    { label: 'Go to Writing & Notes', tab: 'notes' as NavTab, icon: FileText },
    { label: 'Go to File Transfer', tab: 'files' as NavTab, icon: Paperclip },
    { label: 'Go to Tools & Workers', tab: 'tools' as NavTab, icon: LayoutGrid },
    { label: 'Go to Settings', tab: 'settings' as NavTab, icon: Settings },
  ];

  const quickActions = [
    { label: 'New Project...', action: () => onOpenNewModal('project'), icon: Plus },
    { label: 'New Note...', action: () => onOpenNewModal('note'), icon: Plus },
    { label: 'Upload File to R2...', action: () => onOpenNewModal('transfer'), icon: Plus },
    { label: 'Toggle Contrast Theme', action: onToggleTheme, icon: Sun },
  ];

  const matchedProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );
  const matchedNotes = notes.filter((n) =>
    n.title.toLowerCase().includes(query.toLowerCase())
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
            placeholder="Type a command, search project or note..."
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
                        <Icon className="w-4 h-4 text-neutral-400" />
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
                      <Icon className="w-4 h-4 text-neutral-400" />
                      <span>{a.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Matched Projects */}
          {matchedProjects.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                Projects
              </div>
              <div className="space-y-0.5">
                {matchedProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Folder className="w-4 h-4 text-neutral-400" />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-neutral-400 text-[11px] truncate max-w-xs">
                        {p.tagline}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {p.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Matched Notes */}
          {matchedNotes.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                Notes
              </div>
              <div className="space-y-0.5">
                {matchedNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      onSelectNote(n);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-neutral-400" />
                      <span className="font-medium">{n.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {n.updatedAt}
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
