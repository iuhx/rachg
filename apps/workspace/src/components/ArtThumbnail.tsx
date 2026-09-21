import React from 'react';

interface ArtThumbnailProps {
  id: string;
  name: string;
  gradient?: string;
  styleVariant?: 'gradient' | 'plant' | 'minimal' | 'monochrome';
  className?: string;
}

export const ArtThumbnail: React.FC<ArtThumbnailProps> = ({
  id,
  name,
  gradient,
  styleVariant = 'gradient',
  className = 'w-14 h-14 rounded-xl',
}) => {
  // If it's Lens or has botanical styling
  if (id === 'lens' || styleVariant === 'plant') {
    return (
      <div
        className={`relative overflow-hidden bg-[#16171a] flex-shrink-0 shadow-inner border border-white/5 ${className}`}
        style={{
          background: 'radial-gradient(circle at 60% 40%, #2e323b 0%, #17181c 65%, #0e0f12 100%)',
        }}
      >
        {/* Artistic botanical branch SVG overlay matching the Lens card in screenshot */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full opacity-65 mix-blend-screen select-none pointer-events-none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M20 95 C 35 70, 45 45, 75 15"
            stroke="rgba(240, 240, 245, 0.4)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Leaves */}
          <path d="M42 58 C 45 50, 56 50, 58 58 C 50 63, 44 63, 42 58 Z" fill="rgba(240, 240, 245, 0.35)" />
          <path d="M30 72 C 34 65, 43 66, 45 73 C 38 77, 32 76, 30 72 Z" fill="rgba(240, 240, 245, 0.3)" />
          <path d="M54 44 C 57 36, 68 37, 70 44 C 62 49, 56 49, 54 44 Z" fill="rgba(240, 240, 245, 0.35)" />
          <path d="M68 28 C 72 20, 82 22, 84 29 C 76 34, 70 33, 68 28 Z" fill="rgba(240, 240, 245, 0.4)" />
        </svg>
      </div>
    );
  }

  // If it's Quiet or monochrome landscape
  if (id === 'quiet') {
    return (
      <div
        className={`relative overflow-hidden flex-shrink-0 shadow-inner border border-white/5 ${className}`}
        style={{
          background: 'linear-gradient(180deg, #3d414a 0%, #202227 45%, #101114 100%)',
        }}
      >
        {/* Subtle horizon mist layer */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-white/10 blur-[2px] rounded-full" />
      </div>
    );
  }

  // If it's ASCII Studio
  if (id === 'ascii-studio') {
    return (
      <div
        className={`relative overflow-hidden bg-[#111215] flex-shrink-0 flex items-center justify-center font-mono text-[9px] text-white/40 tracking-widest leading-none select-none border border-white/5 ${className}`}
        style={{
          background: 'radial-gradient(circle at 50% 50%, #232731 0%, #121419 75%, #0a0b0e 100%)',
        }}
      >
        <div className="grid grid-cols-4 gap-1 opacity-50 font-bold">
          <span>/</span><span>\</span><span>*</span><span>+</span>
          <span>:</span><span>.</span><span>#</span><span>@</span>
          <span>~</span><span>^</span><span>=</span><span>%</span>
        </div>
      </div>
    );
  }

  // If it's Blur
  if (id === 'blur') {
    return (
      <div
        className={`relative overflow-hidden flex-shrink-0 border border-white/5 ${className}`}
        style={{
          background: 'radial-gradient(circle at 40% 40%, #505562 0%, #272a32 55%, #111215 100%)',
        }}
      >
        <div className="absolute -top-2 -left-2 w-8 h-8 rounded-full bg-white/15 blur-[6px]" />
        <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-slate-300/10 blur-[4px]" />
      </div>
    );
  }

  // Default gradient thumbnail (Palette, Micro Web, Playground, etc.)
  return (
    <div
      className={`relative overflow-hidden flex-shrink-0 border border-white/5 ${className}`}
      style={{
        background:
          gradient ||
          'radial-gradient(circle at 60% 35%, #3e434f 0%, #1c1e24 60%, #0d0e12 100%)',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10" />
    </div>
  );
};
