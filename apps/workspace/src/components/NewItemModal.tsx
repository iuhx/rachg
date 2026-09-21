import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { Project, NoteItem, FileItem, ToolItem } from '../types';

interface NewItemModalProps {
  isOpen: boolean;
  type: 'project' | 'note' | 'transfer' | 'experiment' | null;
  onClose: () => void;
  onCreateProject: (p: Partial<Project>) => void;
  onCreateNote: (n: Partial<NoteItem>) => void;
  onCreateTransfer: (name: string, size: string, expiry: string) => void;
  onCreateExperiment: (e: Partial<ToolItem>) => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({
  isOpen,
  type,
  onClose,
  onCreateProject,
  onCreateNote,
  onCreateTransfer,
  onCreateExperiment,
}) => {
  if (!isOpen || !type) return null;

  // Project form state
  const [projName, setProjName] = useState('');
  const [projTagline, setProjTagline] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projStatus, setProjStatus] = useState<'In Progress' | 'Planning' | 'Exploring' | 'Live'>('Planning');

  // Note form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('Product, Ideas');

  // Transfer form state
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('5.4 MB');
  const [fileExpiry, setFileExpiry] = useState('48 hours');

  // Experiment form state
  const [expName, setExpName] = useState('');
  const [expTagline, setExpTagline] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'project' && projName) {
      onCreateProject({
        name: projName,
        tagline: projTagline || 'A new personal project.',
        description: projDesc || 'Detailed exploration and implementation notes.',
        status: projStatus,
        stack: ['Astro', 'Cloudflare Workers'],
      });
    } else if (type === 'note' && noteTitle) {
      onCreateNote({
        title: noteTitle,
        content: noteContent || `# ${noteTitle}\n\nStart writing your thoughts here...`,
        excerpt: (noteContent || noteTitle).slice(0, 60) + '...',
        tags: noteTags.split(',').map((t) => t.trim()),
        readTime: '1 min read',
      });
    } else if (type === 'transfer' && fileName) {
      onCreateTransfer(fileName, fileSize, fileExpiry);
    } else if (type === 'experiment' && expName) {
      onCreateExperiment({
        name: expName,
        tagline: expTagline || 'Experimental tool prototype.',
        status: 'Exploring',
        workerEndpoint: `${expName.toLowerCase().replace(/\s+/g, '-')}.rachg.workers.dev`,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white p-1 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-serif text-xl font-normal text-neutral-900 dark:text-white capitalize mb-1">
          {type === 'transfer' ? 'New Temporary Share' : `Create New ${type}`}
        </h3>
        <p className="text-xs text-neutral-400 mb-5">
          Fill in metadata. Synced with local memory and Cloudflare edge schemas.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'project' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="e.g. Prism, Echo, Solitude"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Tagline (One-sentence premise)
                </label>
                <input
                  type="text"
                  value={projTagline}
                  onChange={(e) => setProjTagline(e.target.value)}
                  placeholder="e.g. A focused ambient synthesizer."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Status
                </label>
                <select
                  value={projStatus}
                  onChange={(e) => setProjStatus(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                >
                  <option value="Planning">Planning</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Exploring">Exploring</option>
                  <option value="Live">Live</option>
                </select>
              </div>
            </>
          )}

          {type === 'note' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="e.g. Edge computing architecture notes"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={noteTags}
                  onChange={(e) => setNoteTags(e.target.value)}
                  placeholder="Design, Tech, Architecture"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Content (Markdown)
                </label>
                <textarea
                  rows={5}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write initial thoughts..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white font-mono focus:outline-none"
                />
              </div>
            </>
          )}

          {type === 'transfer' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  File Name
                </label>
                <input
                  type="text"
                  required
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="e.g. design-specs.pdf"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    File Size
                  </label>
                  <input
                    type="text"
                    value={fileSize}
                    onChange={(e) => setFileSize(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Expiration
                  </label>
                  <select
                    value={fileExpiry}
                    onChange={(e) => setFileExpiry(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                  >
                    <option value="1 hour">1 hour</option>
                    <option value="24 hours">24 hours</option>
                    <option value="48 hours">48 hours</option>
                    <option value="7 days">7 days</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {type === 'experiment' && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Experiment Name
                </label>
                <input
                  type="text"
                  required
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  placeholder="e.g. Vector Matrix"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Tagline
                </label>
                <input
                  type="text"
                  value={expTagline}
                  onChange={(e) => setExpTagline(e.target.value)}
                  placeholder="e.g. Tiny computational playground."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
            </>
          )}

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
