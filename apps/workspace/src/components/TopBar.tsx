import React from 'react';
import { Search, Moon, Sun } from 'lucide-react';

interface TopBarProps {
  onOpenCommandPalette: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenCommandPalette,
  isDarkMode,
  onToggleDarkMode,
}) => {
  return (
    <header className="w-full flex items-center justify-end px-10 pt-7 pb-3 select-none">
      <div className="flex items-center gap-4">
        {/* Search Input Bar (⌘K) matching screenshot */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl text-xs bg-white dark:bg-[#18191d] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all w-60 sm:w-72 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-neutral-400 stroke-[1.8]" />
          <span className="flex-1 text-left text-neutral-400 text-xs">Search anything...</span>
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-sans font-medium text-neutral-400 bg-neutral-100 dark:bg-white/5 rounded border border-neutral-200/80 dark:border-white/10">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onToggleDarkMode}
          title={isDarkMode ? 'Switch to Studio Duo Mode' : 'Switch to Obsidian Dark Mode'}
          className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors cursor-pointer"
        >
          {isDarkMode ? <Sun className="w-4 h-4 stroke-[1.8]" /> : <Moon className="w-4 h-4 stroke-[1.8]" />}
        </button>

        {/* User avatar circle 'R' matching screenshot */}
        <div
          onClick={onOpenCommandPalette}
          className="w-8 h-8 rounded-full bg-[#1b1c20] text-white flex items-center justify-center text-xs font-serif font-normal shadow-xs border border-white/10 select-none cursor-pointer hover:ring-2 hover:ring-neutral-300 transition-all"
        >
          R
        </div>
      </div>
    </header>
  );
};
