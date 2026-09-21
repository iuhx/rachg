import React, { useState } from 'react';
import {
  Wrench,
  Terminal,
  ExternalLink,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import type { ToolItem } from '../types';
import { ArtThumbnail } from './ArtThumbnail';

interface ToolsViewProps {
  tools: ToolItem[];
  onSelectTool: (t: ToolItem) => void;
  onNewTool: () => void;
}

export const ToolsView: React.FC<ToolsViewProps> = ({
  tools,
  onSelectTool,
  onNewTool,
}) => {
  // Live mini tool demo: ASCII art transformer
  const [asciiInput, setAsciiInput] = useState('RACHG');
  const [asciiOutput, setAsciiOutput] = useState('');
  const [copiedAscii, setCopiedAscii] = useState(false);
  const [activeTab, setActiveTab] = useState<'catalog' | 'live-demo'>('catalog');

  const generateAscii = (text: string) => {
    // Generate clean retro banner ascii art
    const map: Record<string, string[]> = {
      R: ['█▀▀█', '█▄▄▀', '▀  ▀'],
      A: ['█▀▀█', '█▄▄█', '▀  ▀'],
      C: ['█▀▀▀', '█   ', '▀▀▀▀'],
      H: ['█  █', '█▀▀█', '▀  ▀'],
      G: ['█▀▀▀', '█ ▀█', '▀▀▀▀'],
      O: ['█▀▀█', '█  █', '▀▀▀▀'],
      S: ['█▀▀▀', '▀▀▀█', '▀▀▀▀'],
    };

    const chars = text.toUpperCase().split('');
    const rows = ['', '', ''];

    chars.forEach((c) => {
      const glyph = map[c] || [c, c, c];
      rows[0] += (glyph[0] || c) + ' ';
      rows[1] += (glyph[1] || c) + ' ';
      rows[2] += (glyph[2] || c) + ' ';
    });

    return rows.join('\n');
  };

  const handleRunAscii = () => {
    setAsciiOutput(generateAscii(asciiInput || 'RACHG'));
  };

  return (
    <div className="space-y-7 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-neutral-900 dark:text-white font-normal tracking-tight">
            Tools & Micro-Services
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            Independent Cloudflare Workers, experimental sandboxes, and utilities.
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-white dark:bg-[#16171b] border border-neutral-200/80 dark:border-white/10 rounded-xl p-1 shadow-xs">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            Worker Catalog
          </button>
          <button
            onClick={() => {
              setActiveTab('live-demo');
              if (!asciiOutput) handleRunAscii();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'live-demo'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            Interactive Sandbox
          </button>
        </div>
      </div>

      {/* Architecture note banner highlighting user's core principle */}
      <div className="bg-neutral-100/70 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/5 rounded-2xl p-5 flex items-start gap-4">
        <Cpu className="w-5 h-5 text-neutral-600 dark:text-neutral-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <h4 className="font-medium text-neutral-900 dark:text-white">
            Architecture: Central Control Plane + Autonomous Workers
          </h4>
          <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
            The workspace acts as an orchestration hub (<span className="font-mono text-[11px]">rachg.com</span>). Each tool operates as an isolated Cloudflare Worker (<span className="font-mono text-[11px]">tool-*.worker</span>) with independent scaling, edge bindings, and zero mutual coupling.
          </p>
        </div>
      </div>

      {activeTab === 'catalog' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {tools.map((tool) => (
            <div
              key={tool.id}
              onClick={() => onSelectTool(tool)}
              className="bg-white dark:bg-[#16171b] rounded-2xl p-5 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs hover:shadow-md hover:border-neutral-300 dark:hover:border-white/15 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <ArtThumbnail
                      id={tool.id}
                      name={tool.name}
                      gradient={tool.thumbnailGradient}
                      className="w-12 h-12 rounded-xl"
                    />
                    <div>
                      <h3 className="text-sm font-medium text-neutral-900 dark:text-white group-hover:text-black dark:group-hover:text-white">
                        {tool.name}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {tool.tagline}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-neutral-400 px-2 py-0.5 rounded bg-neutral-100 dark:bg-white/5">
                    {tool.status}
                  </span>
                </div>

                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-4 leading-relaxed">
                  {tool.description}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-white/[0.05] flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                <span className="truncate max-w-[200px]">
                  {tool.workerEndpoint}
                </span>

                <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                  <span>Inspect</span>
                  <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Live Sandbox Demo */
        <div className="bg-white dark:bg-[#16171b] rounded-2xl p-7 border border-neutral-200/80 dark:border-white/[0.07] shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-neutral-500" />
              <span>Interactive Edge Worker: ASCII Studio</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Live edge computation test. Generates procedural typography directly in browser memory.
            </p>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={asciiInput}
              onChange={(e) => setAsciiInput(e.target.value)}
              placeholder="Type word to transform (e.g. RACHG)..."
              className="flex-1 px-4 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white uppercase font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <button
              onClick={handleRunAscii}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-black hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Generate</span>
            </button>
          </div>

          <div className="relative bg-neutral-950 rounded-xl p-5 border border-white/10 font-mono text-emerald-400 text-xs overflow-x-auto shadow-inner">
            <pre className="select-all leading-tight">
              {asciiOutput || generateAscii('RACHG')}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(asciiOutput || generateAscii('RACHG'));
                setCopiedAscii(true);
                setTimeout(() => setCopiedAscii(false), 2000);
              }}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Copy Output"
            >
              {copiedAscii ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
