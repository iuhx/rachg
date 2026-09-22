import React from 'react';
import {
  LayoutDashboard,
  FolderDot,
  FileText,
  Paperclip,
  Settings,
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
  const navItems: { id: NavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'home', label: 'Overview', icon: LayoutDashboard },
    { id: 'files', label: 'Files', icon: Paperclip },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'projects', label: 'Projects', icon: FolderDot },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="workspace-sidebar w-[240px] min-h-screen bg-[#111215] text-[#f3f4f6] flex flex-col justify-between border-r border-white/[0.06] select-none flex-shrink-0 relative z-30">
      {/* Brand & Workspace Identity */}
      <div className="pt-6 px-5">
        <button
          onClick={() => onTabChange('home')}
          aria-label="Return to rachg overview"
          className="w-full text-left py-2 px-2 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group"
        >
          <span className="font-sans text-[19px] font-semibold tracking-[-0.035em] text-white antialiased group-hover:text-white/95">
            rachg
          </span>
        </button>

        {/* Navigation list */}
        <nav aria-label="Workspace navigation" className="mt-7 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                aria-label={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-normal transition-colors cursor-pointer ${
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
