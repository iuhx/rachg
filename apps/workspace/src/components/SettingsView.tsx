import React, { useState } from 'react';
import {
  Cloud,
  Database,
  HardDrive,
  Key,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Sun,
  Moon,
  Laptop,
  Server,
  Zap,
} from 'lucide-react';
import { CLOUDFLARE_BINDINGS } from '../data/mockData';

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
  const [pingLatency, setPingLatency] = useState<number | null>(18);

  const handleTestPing = () => {
    setTestingPing(true);
    setTimeout(() => {
      setPingLatency(Math.floor(14 + Math.random() * 8));
      setTestingPing(false);
    }, 600);
  };

  return (
    <div className="space-y-7 pb-16 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="font-serif text-3xl text-neutral-900 dark:text-white font-normal tracking-tight">
          Settings & Infrastructure
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
          Cloudflare environment bindings, storage targets, and workspace preferences.
        </p>
      </div>

      {/* Cloudflare Edge Status Card */}
      <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <Cloud className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
                Cloudflare Ecosystem Status
              </h3>
              <p className="text-xs text-neutral-400">
                Connected to account: <span className="font-mono text-neutral-600 dark:text-neutral-300">haenlau@rachg.com</span>
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
              <span>{pingLatency ? `${pingLatency}ms` : 'Ping'}</span>
            </button>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Healthy
            </span>
          </div>
        </div>

        {/* Bindings list */}
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.05] pt-2">
          {CLOUDFLARE_BINDINGS.map((b) => (
            <div key={b.service} className="py-3 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <div>
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {b.service}
                  </span>
                  <span className="font-mono text-neutral-400 ml-2 text-[11px]">
                    env.{b.bindingName}
                  </span>
                </div>
              </div>
              <span className="text-neutral-400 font-mono text-[11px]">
                {b.details}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Visual Mode Card */}
      <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs space-y-4">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
          Appearance & Contrast
        </h3>
        <p className="text-xs text-neutral-400">
          Choose between Studio Duo (dark obsidian sidebar + calm light canvas, identical to the design mockup) or Pure Obsidian dark mode.
        </p>

        <div className="grid grid-cols-2 gap-4 pt-2">
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
                Studio Duo (Mockup Default)
              </span>
              <Sun className="w-4 h-4 text-neutral-500" />
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Dark obsidian sidebar with warm paper white canvas for maximum contrast and reading calm.
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
              <Moon className="w-4 h-4 text-neutral-500" />
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Pure dark monochrome palette across all canvases, ideal for deep focus and nighttime work.
            </p>
          </button>
        </div>
      </div>

      {/* Danger / Reset Area */}
      <div className="bg-white dark:bg-[#16171b] rounded-2xl p-6 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs flex items-center justify-between">
        <div>
          <h4 className="text-xs font-medium text-neutral-900 dark:text-white">
            Reset Local Workspace State
          </h4>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Restores mock files, sample notes, and project cards to factory initial data.
          </p>
        </div>
        <button
          onClick={onResetWorkspace}
          className="px-3.5 py-1.5 rounded-xl text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer border border-red-200/60 dark:border-red-900/40"
        >
          Reset State
        </button>
      </div>
    </div>
  );
};
