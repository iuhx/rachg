import React, { useState } from 'react';
import { Search, Moon, Sun } from 'lucide-react';

interface TopBarProps {
  onOpenCommandPalette: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  authStatus: 'loading' | 'authenticated' | 'unauthenticated';
  apiAuthRequired?: boolean;
  userEmail?: string;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenCommandPalette,
  isDarkMode,
  onToggleDarkMode,
  authStatus,
  apiAuthRequired = false,
  userEmail,
  onSignIn,
  onSignOut,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const initials = userEmail?.slice(0, 1).toUpperCase() || '?';

  return (
    <header className="workspace-topbar w-full flex items-center justify-end px-4 pt-4 pb-3 sm:px-6 lg:px-8 lg:pt-6 select-none">
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Search Input Bar (⌘K) matching screenshot */}
        <button
          onClick={onOpenCommandPalette}
          className="type-label flex items-center gap-2.5 px-3 py-2 workspace-control text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 bg-white dark:bg-[#18191d] border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 transition-colors w-[min(62vw,18rem)] sm:w-72 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-neutral-400 stroke-[1.8]" />
          <span className="type-secondary flex-1 text-left">Search anything...</span>
          <kbd className="type-caption inline-flex items-center gap-0.5 px-1.5 py-0.5 text-neutral-400 bg-neutral-100 dark:bg-white/5 rounded border border-neutral-200/80 dark:border-white/10">
            <span>⌘</span>K
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

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((open) => !open)}
            aria-label={authStatus === 'authenticated' ? 'Open user menu' : 'Open sign-in menu'}
            aria-expanded={isUserMenuOpen}
            className="w-8 h-8 rounded-full bg-[#1b1c20] text-white flex items-center justify-center text-xs font-sans font-medium shadow-xs border border-white/10 select-none cursor-pointer hover:ring-2 hover:ring-neutral-300 transition-colors"
          >
            {initials}
          </button>

          {isUserMenuOpen && (
            <div className="workspace-modal absolute right-0 top-10 z-40 w-64 p-3 bg-white dark:bg-[#18191d] border border-neutral-200 dark:border-white/10" role="menu">
              <div className="px-2 py-2 border-b border-neutral-100 dark:border-white/10">
                <p className="type-label text-neutral-400">Account</p>
                <p className="type-body mt-1 truncate text-neutral-900 dark:text-white">{userEmail || 'Not signed in'}</p>
                <p className="type-caption mt-1 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${authStatus === 'authenticated' ? 'bg-emerald-500' : authStatus === 'loading' ? 'bg-amber-400' : 'bg-neutral-400'}`} />
                  {authStatus === 'authenticated' ? 'Signed in' : authStatus === 'loading' ? 'Checking session…' : 'Not signed in'}
                </p>
                {apiAuthRequired && <p className="type-caption mt-1 text-amber-600 dark:text-amber-400">Private API sign-in needed</p>}
              </div>
              {authStatus === 'authenticated' ? (
                apiAuthRequired ? (
                  <button type="button" onClick={onSignIn} className="workspace-button workspace-button-primary w-full mt-2 cursor-pointer" role="menuitem">Sign in to private API</button>
                ) : (
                  <button type="button" onClick={onSignOut} className="type-body w-full text-left px-2 py-2 mt-1 rounded-lg text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer" role="menuitem">Sign out</button>
                )
              ) : (
                <button type="button" onClick={onSignIn} className="workspace-button workspace-button-primary w-full mt-2 cursor-pointer" role="menuitem">Sign in with Cloudflare Access</button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
