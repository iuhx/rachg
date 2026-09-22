import React, { useState } from 'react';
import {
  Cloud,
  RefreshCw,
  Sun,
  Moon,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  Database,
  Radio,
} from 'lucide-react';

interface SettingsViewProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onResetWorkspace: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDarkMode,
  onToggleDarkMode,
  onResetWorkspace,
}) => {
  const [testingPing, setTestingPing] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  const handleTestPing = async () => {
    setTestingPing(true);
    const start = performance.now();
    try {
      const apiBaseUrl = import.meta.env.PUBLIC_FILE_SERVICE_URL || 'https://files.rachg.com';
      const response = await fetch(`${apiBaseUrl}/health`, { method: 'GET', credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const duration = Math.round(performance.now() - start);
      setPingLatency(duration);
    } catch {
      setPingLatency(null);
    } finally {
      setTestingPing(false);
    }
  };

  return (
    <div className="space-y-8 pb-20 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="font-serif text-3xl text-neutral-900 dark:text-white font-normal tracking-tight">
          Settings
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
          Private workspace configuration and production edge status.
        </p>
      </div>

      {/* Cloudflare Edge Status */}
      <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-xs space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-white/5 text-neutral-800 dark:text-neutral-200 flex items-center justify-center">
              <Cloud className="w-5 h-5 stroke-[1.7]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
                Cloudflare Edge Architecture
              </h3>
              <p className="text-xs text-neutral-400">
                Connected to <span className="font-mono text-neutral-700 dark:text-neutral-300">rachg.com</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestPing}
              disabled={testingPing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingPing ? 'animate-spin' : ''}`} />
              <span>{pingLatency !== null ? `${pingLatency}ms` : 'Ping Edge'}</span>
            </button>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
        </div>

        {/* Real Production Services */}
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.05] pt-2 text-xs">
          <div className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="w-4 h-4 text-neutral-400" />
              <div>
                <span className="font-medium text-neutral-900 dark:text-white">
                  R2 Storage Vault
                </span>
                <span className="font-mono text-neutral-400 ml-2 text-[11px]">
                  bucket: r2rachg
                </span>
              </div>
            </div>
            <span className="font-mono text-[11px] text-neutral-400">
              transfers/ (4GB cap)
            </span>
          </div>

          <div className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-neutral-400" />
              <div>
                <span className="font-medium text-neutral-900 dark:text-white">
                  D1 Database Metadata
                </span>
                <span className="font-mono text-neutral-400 ml-2 text-[11px]">
                  db: d1rachg
                </span>
              </div>
            </div>
            <span className="font-mono text-[11px] text-neutral-400">
              files table
            </span>
          </div>

          <div className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Radio className="w-4 h-4 text-neutral-400" />
              <div>
                <span className="font-medium text-neutral-900 dark:text-white">
                  File Service Worker
                </span>
                <span className="font-mono text-neutral-400 ml-2 text-[11px]">
                  rachg-file-service
                </span>
              </div>
            </div>
            <span className="font-mono text-[11px] text-neutral-400">
              files.rachg.com
            </span>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/70 dark:border-white/[0.07] shadow-xs space-y-4">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
          Appearance
        </h3>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Switch between Studio Duo (dark obsidian navigation with warm paper white canvas) or Pure Obsidian dark mode.
        </p>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <button
            onClick={() => {
              if (isDarkMode) onToggleDarkMode();
            }}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              !isDarkMode
                ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5 shadow-xs'
                : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-900 dark:text-white">
                Studio Duo
              </span>
              <Sun className="w-4 h-4 text-neutral-400" />
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Dark sidebar with calm, high-contrast light workspace canvas.
            </p>
          </button>

          <button
            onClick={() => {
              if (!isDarkMode) onToggleDarkMode();
            }}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              isDarkMode
                ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5 shadow-xs'
                : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-900 dark:text-white">
                Obsidian Dark
              </span>
              <Moon className="w-4 h-4 text-neutral-400" />
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Pure dark monochrome across the entire interface.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};
