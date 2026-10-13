import React from 'react';
import { Lexer, type Token, type Tokens } from 'marked';
import { decodeHTML } from 'entities';

interface MarkdownPreviewProps { content: string }
function safeHref(value: string): string | undefined {
  if (/[\x00-\x1f\x7f]/.test(value)) return;
  if (value.startsWith('#')) return value;
  try { const url = new URL(value); if (['http:','https:','mailto:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Unsupported links remain text. */ }
}

/** Render Markdown tokens as React elements; never insert HTML or fetch images. */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  const plain = <pre className="type-body whitespace-pre-wrap break-words font-sans">{content}</pre>;
  if (content.length > 200_000) return plain;
  let count = 0, textSize = 0;
  const text = (value: string) => {
    textSize += value.length;
    if (textSize > 400_000) throw new Error('Preview expansion limit');
    return value;
  };
  const render = (tokens: Token[], depth = 0): React.ReactNode[] => {
    if (depth > 64) throw new Error('Preview nesting limit');
    return tokens.map((token, index) => {
      if (++count > 15000) throw new Error('Preview node limit');
      const nested = (children: Token[]) => render(children, depth + 1);
      switch (token.type) {
        case 'space': case 'def': return null;
        case 'heading': {
          const heading = token as Tokens.Heading;
          const Tag = `h${Math.min(6, Math.max(1, heading.depth))}` as 'h1';
          return <Tag key={index} className={heading.depth === 1 ? 'type-modal-heading' : heading.depth === 2 ? 'type-section-heading' : 'type-body font-semibold'}>{nested(heading.tokens)}</Tag>;
        }
        case 'paragraph': return <p key={index}>{nested((token as Tokens.Paragraph).tokens)}</p>;
        case 'strong': return <strong key={index}>{nested((token as Tokens.Strong).tokens)}</strong>;
        case 'em': return <em key={index}>{nested((token as Tokens.Em).tokens)}</em>;
        case 'del': return <del key={index}>{nested((token as Tokens.Del).tokens)}</del>;
        case 'br': return <br key={index} />;
        case 'hr': return <hr key={index} className="border-neutral-200 dark:border-white/10" />;
        case 'codespan': return <code key={index} className="type-mono px-1 py-0.5 rounded bg-neutral-100 dark:bg-white/10">{text((token as Tokens.Codespan).text)}</code>;
        case 'code': return <pre key={index} className="type-mono overflow-x-auto rounded-lg bg-neutral-950 px-4 py-3 text-neutral-200"><code>{text((token as Tokens.Code).text)}</code></pre>;
        case 'blockquote': return <blockquote key={index} className="border-l-2 border-neutral-300 dark:border-white/20 pl-3 text-neutral-500 dark:text-neutral-400 space-y-2">{nested((token as Tokens.Blockquote).tokens)}</blockquote>;
        case 'link': case 'image': {
          const link = token as Tokens.Link | Tokens.Image;
          const href = safeHref(text(decodeHTML(link.href)));
          const children = link.tokens ? nested(link.tokens) : text(decodeHTML(link.text));
          return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{children || 'Image'}</a> : <React.Fragment key={index}>{children}</React.Fragment>;
        }
        case 'list': {
          const list = token as Tokens.List;
          count += list.items.length;
          if (count > 15000) throw new Error('Preview node limit');
          const Tag = list.ordered ? 'ol' : 'ul';
          return <Tag key={index} start={list.ordered ? Number(list.start) : undefined} className={`pl-5 space-y-1 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>{list.items.map((item, itemIndex) => <li key={itemIndex}>{item.task && <span aria-label={item.checked ? 'Completed' : 'Not completed'}>{item.checked ? '☑ ' : '☐ '}</span>}{nested(item.tokens)}</li>)}</Tag>;
        }
        case 'table': {
          const table = token as Tokens.Table;
          count += table.header.length + table.rows.reduce((sum, row) => sum + row.length + 1, 0);
          if (count > 15000) throw new Error('Preview node limit');
          return <div key={index} className="overflow-x-auto"><table className="w-full border-collapse text-left">
            <thead><tr>{table.header.map((cell, column) => <th key={column} className="border border-neutral-200 dark:border-white/10 p-2 font-medium" style={{ textAlign: table.align[column] || undefined }}>{nested(cell.tokens)}</th>)}</tr></thead>
            <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} className="border border-neutral-200 dark:border-white/10 p-2" style={{ textAlign: table.align[column] || undefined }}>{nested(cell.tokens)}</td>)}</tr>)}</tbody>
          </table></div>;
        }
        case 'html': return <React.Fragment key={index}>{text(token.raw)}</React.Fragment>;
        default: {
          const value = token as Tokens.Text;
          return <React.Fragment key={index}>{value.tokens ? nested(value.tokens) : text(decodeHTML(value.text || token.raw))}</React.Fragment>;
        }
      }
    });
  };
  try { return <div className="space-y-2 break-words">{render(Lexer.lex(content, { gfm: true }))}</div>; }
  catch { return plain; }
};
