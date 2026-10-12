import React, { useRef, useState } from 'react';
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
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDarkMode,
  onToggleDarkMode,
}) => {
  const [testingPing, setTestingPing] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const pingBusy = useRef(false);

  const handleTestPing = async () => {
    if (pingBusy.current) return;
    pingBusy.current = true;
    setTestingPing(true);
    setPingError(null); setPingLatency(null);
    const start = performance.now();
    try {
      const apiBaseUrl = 'https://files.rachg.com';
      const response = await fetch(`${apiBaseUrl}/health`, { method: 'GET', credentials: 'include', signal: AbortSignal.timeout(10_000) });
      if (response.redirected || response.status === 401 || response.status === 403) throw new Error('Sign in to the file service to check its status.');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The server did not return a health response.');
      const health = await response.json();
      if (!health || health.service !== 'rachg-file-service' || health.status !== 'healthy' || health.schema !== 'ready') throw new Error('The file service did not report ready.');
      const duration = Math.round(performance.now() - start);
      setPingLatency(duration);
    } catch (error) {
      setPingLatency(null);
      setPingError(error instanceof Error ? error.message : 'Unable to reach the file service.');
    } finally {
      pingBusy.current = false;
      setTestingPing(false);
    }
  };

  return (
    <div className="workspace-view space-y-8 pb-20">
      {/* Header */}
      <div>
        <h2 className="type-page-heading text-neutral-900 dark:text-white">
          Settings
        </h2>
        <p className="type-secondary mt-1">
          Private workspace configuration and production edge status.
        </p>
      </div>

      {/* Cloudflare Edge Status */}
      <div className="workspace-card p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-white/5 text-neutral-800 dark:text-neutral-200 flex items-center justify-center">
              <Cloud className="w-5 h-5 stroke-[1.7]" />
            </div>
            <div>
              <h3 className="type-section-heading text-neutral-900 dark:text-white">
                Cloudflare Edge Architecture
              </h3>
              <p className="type-secondary">
                Configured for <span className="font-mono text-neutral-700 dark:text-neutral-300">rachg.com</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestPing}
              disabled={testingPing}
              className="workspace-button workspace-button-secondary font-mono cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingPing ? 'animate-spin' : ''}`} />
              <span>{pingLatency !== null ? `${pingLatency}ms` : 'Ping Edge'}</span>
            </button>
          <span role="status" className={`type-label flex items-center gap-1 px-2.5 py-1 rounded-full border ${pingLatency !== null ? 'text-emerald-700 dark:text-emerald-400 border-emerald-200' : 'text-neutral-500 border-neutral-200 dark:border-white/10'}`}>
              {testingPing ? 'Checking…' : pingLatency !== null ? 'API reachable' : pingError ? 'Check failed' : 'Not checked'}
            </span>
          </div>
        </div>

        {pingError && <p role="alert" className="type-secondary text-red-600 dark:text-red-300">{pingError}</p>}

        {/* Real Production Services */}
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.05] pt-2 text-xs">
          <div className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="w-4 h-4 text-neutral-400" />
              <div>
                <span className="font-medium text-neutral-900 dark:text-white">
                  R2 Storage Vault
                </span>
                <span className="type-mono text-neutral-400 ml-2">
                  bucket: r2rachg
                </span>
              </div>
            </div>
            <span className="type-mono text-neutral-400">
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
                <span className="type-mono text-neutral-400 ml-2">
                  db: d1rachg
                </span>
              </div>
            </div>
            <span className="type-mono text-neutral-400">
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
                <span className="type-mono text-neutral-400 ml-2">
                  rachg-file-service
                </span>
              </div>
            </div>
            <span className="type-mono text-neutral-400">
              files.rachg.com
            </span>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="workspace-card p-5 sm:p-6 space-y-4">
        <h3 className="type-section-heading text-neutral-900 dark:text-white">
          Appearance
        </h3>
        <p className="type-secondary leading-relaxed">
          Switch between Studio Duo (dark obsidian navigation with warm paper white canvas) or Pure Obsidian dark mode.
        </p>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <button
            onClick={() => {
              if (isDarkMode) onToggleDarkMode();
            }}
            className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              !isDarkMode
                ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5 shadow-xs'
                : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="type-section-heading text-neutral-900 dark:text-white">
                Studio Duo
              </span>
              <Sun className="w-4 h-4 text-neutral-400" />
            </div>
            <p className="type-caption leading-relaxed">
              Dark sidebar with calm, high-contrast light workspace canvas.
            </p>
          </button>

          <button
            onClick={() => {
              if (!isDarkMode) onToggleDarkMode();
            }}
            className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              isDarkMode
                ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5 shadow-xs'
                : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="type-section-heading text-neutral-900 dark:text-white">
                Obsidian Dark
              </span>
              <Moon className="w-4 h-4 text-neutral-400" />
            </div>
            <p className="type-caption leading-relaxed">
              Pure dark monochrome across the entire interface.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
};
