import React, { useState } from 'react';
import {
  LayoutDashboard,
  FolderDot,
  FileText,
  ArrowUpRight,
  Paperclip,
  Settings,
  ChevronDown,
} from 'lucide-react';
import type { NavTab } from '../types';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
}) => {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const navItems: { id: NavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'home', label: 'Overview', icon: LayoutDashboard },
    { id: 'files', label: 'Files', icon: Paperclip },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'projects', label: 'Projects', icon: FolderDot },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-[240px] h-screen bg-[#111215] text-[#f3f4f6] flex flex-col justify-between border-r border-white/[0.06] select-none flex-shrink-0 relative z-30 transition-all">
      {/* Brand & Workspace Identity */}
      <div className="pt-6 px-5">
        <div className="relative">
          <button
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="w-full flex items-center justify-between text-left py-2 px-2 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group"
          >
            {/* Modern, solid, Apple/Linear-inspired brand mark */}
            <div className="flex items-center gap-2.5">
              <span className="font-sans text-[19px] font-semibold tracking-[-0.035em] text-white antialiased group-hover:text-white/95">
                rachg
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.08] text-neutral-400">
                os
              </span>
            </div>

            <ChevronDown
              className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                workspaceMenuOpen ? 'rotate-180 text-white' : 'group-hover:text-neutral-300'
              }`}
            />
          </button>

          {/* Context Popover */}
          {workspaceMenuOpen && (
            <div className="absolute top-12 left-0 w-full bg-[#18191d] border border-white/10 rounded-xl shadow-2xl p-2 z-50">
              <div className="px-2.5 py-1 text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                Environment
              </div>
              <div className="px-2.5 py-2 text-xs rounded-lg text-white bg-white/5 flex items-center justify-between">
                <span className="font-mono text-[11px]">app.rachg.com</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              </div>
              <div className="mt-1 px-2.5 py-1.5 text-[11px] text-neutral-400 leading-snug">
                Personal Digital Studio
              </div>
            </div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="mt-7 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-normal transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1d1f24] text-white font-medium shadow-xs border border-white/[0.07]'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 stroke-[1.7] ${
                    isActive ? 'text-white' : 'text-neutral-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Tagline */}
      <div className="p-6">
        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-[11px] text-neutral-500 font-normal leading-relaxed">
            A quiet space for deliberate thought.
          </p>
        </div>
      </div>
    </aside>
  );
};
