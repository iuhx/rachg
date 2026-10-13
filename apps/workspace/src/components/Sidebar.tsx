import React from 'react';
import {
  LayoutDashboard,
  FolderDot,
  FileText,
  Paperclip,
  Mail,
  Settings,
  Wrench,
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
  const navItems: { id: NavTab; label: string; icon: React.FC<{ className?: string }>; group?: string }[] = [
    { id: 'home', label: 'Overview', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderDot, group: 'Workspace' },
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'files', label: 'Files', icon: Paperclip },
    { id: 'mail', label: 'Mail', icon: Mail, group: 'Utilities' },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="workspace-sidebar w-[240px] min-h-screen bg-[#111215] text-[#f3f4f6] flex flex-col justify-between border-r border-white/[0.06] select-none flex-shrink-0 relative z-30">
      {/* Brand & Workspace Identity */}
      <div className="pt-6 px-5">
        <button
          onClick={() => onTabChange('home')}
          aria-label="Return to rachg overview"
          className="w-full text-left py-2 px-3 cursor-pointer"
        >
          <span className="brand-wordmark text-white antialiased">
            rachg
          </span>
        </button>

        {/* Navigation list */}
        <nav aria-label="Workspace navigation" className="mt-7 flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <React.Fragment key={item.id}>
              {item.group && <p className="hidden md:block px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">{item.group}</p>}
              <button
                onClick={() => onTabChange(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`type-body w-full min-h-10 flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1d1f24] text-white font-medium shadow-xs border-white/[0.07]'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 stroke-[1.7] ${
                    isActive ? 'text-white' : 'text-neutral-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Footer Tagline */}
      <div className="p-6">
        <div className="border-t border-white/[0.06] pt-4">
          <p className="type-caption text-neutral-500 leading-relaxed">
            A quiet space for deliberate thought.
          </p>
        </div>
      </div>
    </aside>
  );
};
