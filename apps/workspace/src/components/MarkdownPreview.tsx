import React from 'react';

interface MarkdownPreviewProps {
  content: string;
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*]+\*|https?:\/\/[^\s]+)/g);
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={index} className="type-mono px-1 py-0.5 rounded bg-neutral-100 dark:bg-white/10">{token.slice(1, -1)}</code>;
    }
    if (token.startsWith('~~') && token.endsWith('~~')) {
      return <del key={index}>{token.slice(2, -2)}</del>;
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={index}>{token.slice(1, -1)}</em>;
    }
    if (/^https?:\/\//.test(token)) {
      return <a key={index} href={token} target="_blank" rel="noreferrer" className="underline underline-offset-2">{token}</a>;
    }
    return <React.Fragment key={index}>{token}</React.Fragment>;
  });
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let codeLines: string[] | null = null;

  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (codeLines === null) codeLines = [];
      else {
        blocks.push(<pre key={`code-${index}`} className="type-mono overflow-x-auto rounded-lg bg-neutral-950 px-4 py-3 text-neutral-200"><code>{codeLines.join('\n')}</code></pre>);
        codeLines = null;
      }
      return;
    }
    if (codeLines !== null) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) {
      blocks.push(<div key={`space-${index}`} className="h-2" />);
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      blocks.push(<Tag key={index} className={level === 1 ? 'type-modal-heading' : level === 2 ? 'type-section-heading' : 'type-body font-semibold'}>{renderInline(heading[2])}</Tag>);
      return;
    }
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      blocks.push(<div key={index} className="flex gap-2"><span className="text-neutral-400">•</span><span>{renderInline(listItem[1])}</span></div>);
      return;
    }
    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      blocks.push(<div key={index} className="flex gap-2"><span className="text-neutral-400">{line.match(/^\s*(\d+)/)?.[1]}.</span><span>{renderInline(orderedItem[1])}</span></div>);
      return;
    }
    if (/^\s*(\*\s*){3,}$/.test(line) || /^\s*(-\s*){3,}$/.test(line)) {
      blocks.push(<hr key={index} className="border-neutral-200 dark:border-white/10" />);
      return;
    }
    if (line.startsWith('> ')) {
      blocks.push(<blockquote key={index} className="border-l-2 border-neutral-300 dark:border-white/20 pl-3 text-neutral-500 dark:text-neutral-400">{renderInline(line.slice(2))}</blockquote>);
      return;
    }
    blocks.push(<p key={index}>{renderInline(line)}</p>);
  });

  if (codeLines !== null) {
    blocks.push(<pre key="code-open" className="type-mono overflow-x-auto rounded-lg bg-neutral-950 px-4 py-3 text-neutral-200"><code>{codeLines.join('\n')}</code></pre>);
  }

  return <div className="space-y-2">{blocks}</div>;
};
