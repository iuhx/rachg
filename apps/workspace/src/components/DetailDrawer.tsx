import React from 'react';
import {
  X,
  ExternalLink,
  Layers,
  Sparkles,
  Calendar,
  Clock,
  Terminal,
  Globe,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import type { Project, NoteItem, ToolItem } from '../types';
import { ArtThumbnail } from './ArtThumbnail';

interface DetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: Project | NoteItem | ToolItem | null;
  itemType: 'project' | 'note' | 'tool' | null;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  isOpen,
  onClose,
  item,
  itemType,
}) => {
  if (!isOpen || !item) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs flex justify-end z-50 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-white dark:bg-[#16171b] border-l border-neutral-200 dark:border-white/10 shadow-2xl p-6 overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-white/5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
              {itemType} Inspector
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Project / Tool Inspector */}
          {(itemType === 'project' || itemType === 'tool') && (
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <ArtThumbnail
                  id={(item as any).id}
                  name={(item as any).name}
                  gradient={(item as any).thumbnailGradient}
                  styleVariant={(item as any).thumbnailStyle}
                  className="w-16 h-16 rounded-2xl shadow-sm"
                />
                <div>
                  <h3 className="font-serif text-2xl font-normal text-neutral-900 dark:text-white">
                    {(item as any).name}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    {(item as any).tagline}
                  </p>
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {(item as any).status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-neutral-400 uppercase">
                  Description
                </label>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  {(item as any).description}
                </p>
              </div>

              {/* Cloudflare Worker Specs */}
              <div className="bg-neutral-50 dark:bg-white/[0.02] p-4 rounded-xl border border-neutral-200/70 dark:border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Cloudflare Edge Worker</span>
                </div>
                <div className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400 break-all select-all">
                  {(item as any).workerUrl || (item as any).workerEndpoint || 'worker.rachg.workers.dev'}
                </div>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Sub-20ms edge response SLA</span>
                </div>
              </div>

              {/* Tech Stack */}
              {(item as any).stack && (
                <div className="space-y-2">
                  <label className="text-[11px] font-mono text-neutral-400 uppercase">
                    Technology Stack
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {((item as any).stack as string[]).map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 text-xs font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Launch link if available */}
              {(item as any).externalUrl && (
                <div className="pt-2">
                  <a
                    href={(item as any).externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center gap-2 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs"
                  >
                    <span>Open Live Application</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Note Inspector */}
          {itemType === 'note' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-serif text-2xl font-normal text-neutral-900 dark:text-white">
                  {(item as NoteItem).title}
                </h3>
                <div className="flex items-center gap-2 mt-2 text-xs text-neutral-400 font-mono">
                  <span>{(item as NoteItem).updatedAt}</span>
                  <span>·</span>
                  <span>{(item as NoteItem).readTime}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(item as NoteItem).tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-mono text-[10px]"
                  >
                    #{t}
                  </span>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/70 dark:border-white/5 font-sans text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                {(item as NoteItem).content}
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-neutral-100 dark:border-white/5">
          <p className="text-[10px] text-neutral-400 text-center font-mono">
            rachg control plane · Cloudflare D1 encrypted
          </p>
        </div>
      </div>
    </div>
  );
};
