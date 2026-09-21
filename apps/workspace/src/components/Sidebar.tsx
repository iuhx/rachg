import React, { useState } from 'react';
import {
  Home,
  Folder,
  FileText,
  Paperclip,
  LayoutGrid,
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
    { id: 'home', label: 'Home', icon: Home },
    { id: 'projects', label: 'Projects', icon: Folder },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'files', label: 'Files', icon: Paperclip },
    { id: 'tools', label: 'Tools', icon: LayoutGrid },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-[248px] h-screen bg-[#16171a] text-[#f3f4f6] flex flex-col justify-between border-r border-white/[0.06] select-none flex-shrink-0 relative z-30 transition-all">
      {/* Top Header & Logo */}
      <div className="pt-7 px-6">
        <div className="relative">
          <button
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="w-full flex items-center justify-between text-left py-1 rounded-lg hover:opacity-90 transition-opacity cursor-pointer group"
          >
            <span className="font-serif text-[28px] font-normal tracking-tight text-white">
              rachg
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                workspaceMenuOpen ? 'rotate-180 text-white' : 'group-hover:text-neutral-200'
              }`}
            />
          </button>

          {/* Workspace Dropdown */}
          {workspaceMenuOpen && (
            <div className="absolute top-12 left-0 w-full bg-[#1e2025] border border-white/10 rounded-xl shadow-2xl p-2 z-50">
              <div className="px-2 py-1 text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                Control Plane
              </div>
              <button
                onClick={() => {
                  onTabChange('home');
                  setWorkspaceMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                <span>rachg.com</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              </button>
              <a
                href="https://canvas.air1.cn"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg text-neutral-300 hover:text-white hover:bg-white/5 transition-colors mt-0.5"
              >
                <span>canvas.air1.cn</span>
                <span className="text-[10px] text-neutral-500 font-mono">live</span>
              </a>
            </div>
          )}
        </div>

        {/* Navigation list */}
        <nav className="mt-8 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-[14px] font-normal transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#22242a] text-white shadow-xs font-normal'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 stroke-[1.6] ${
                    isActive ? 'text-white' : 'text-neutral-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Quote & Line matching screenshot */}
      <div className="p-7">
        <div className="space-y-1.5">
          <p className="text-[12px] text-neutral-400 font-normal leading-relaxed">
            A more<br />thoughtful tomorrow.
          </p>
          <div className="w-3.5 h-[1px] bg-neutral-600 mt-2.5" />
        </div>
      </div>
    </aside>
  );
};
