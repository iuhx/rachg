import { Lexer, type Token, type Tokens } from 'marked';
import { decodeHTML } from 'entities';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

/** Only our own HTML tags are emitted. Images are links, never remote requests. */
export function renderSharedMarkdown(content: string): string {
  const plain = () => `<pre>${escapeHtml(content)}</pre>`;
  if (content.length > 200_000) return plain();
  let count = 0, size = 0;
  const text = (value: string) => {
    size += value.length;
    if (size > 400_000) throw new Error('Preview too large');
    return escapeHtml(value);
  };
  const render = (tokens: Token[], depth = 0): string => {
    if (depth > 64) throw new Error('Preview too deep');
    return tokens.map(token => {
      if (++count > 15000) throw new Error('Too many preview nodes');
      const nested = (children: Token[]) => render(children, depth + 1);
      switch (token.type) {
        case 'space': case 'def': return '';
        case 'heading': {
          const heading = token as Tokens.Heading;
          const level = Math.min(6, Math.max(1, heading.depth));
          return `<h${level}>${nested(heading.tokens)}</h${level}>`;
        }
        case 'paragraph': return `<p>${nested((token as Tokens.Paragraph).tokens)}</p>`;
        case 'strong': return `<strong>${nested((token as Tokens.Strong).tokens)}</strong>`;
        case 'em': return `<em>${nested((token as Tokens.Em).tokens)}</em>`;
        case 'del': return `<del>${nested((token as Tokens.Del).tokens)}</del>`;
        case 'br': return '<br>';
        case 'hr': return '<hr>';
        case 'codespan': return `<code>${text((token as Tokens.Codespan).text)}</code>`;
        case 'code': return `<pre><code>${text((token as Tokens.Code).text)}</code></pre>`;
        case 'blockquote': return `<blockquote>${nested((token as Tokens.Blockquote).tokens)}</blockquote>`;
        case 'link': case 'image': {
          const link = token as Tokens.Link | Tokens.Image;
          const label = link.tokens ? nested(link.tokens) : text(decodeHTML(link.text));
          const href = decodeHTML(link.href);
          if (!/[\x00-\x1f\x7f]/.test(href)) {
            try {
              const url = new URL(href);
              if (['http:', 'https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password) {
                return `<a href="${text(url.href)}" target="_blank" rel="noopener noreferrer nofollow">${label || 'Image'}</a>`;
              }
            } catch { /* Unsupported URLs remain text. */ }
          }
          return label;
        }
        case 'list': {
          const list = token as Tokens.List;
          const tag = list.ordered ? 'ol' : 'ul';
          return `<${tag}${list.ordered ? ` start="${Number(list.start) || 1}"` : ''}>${list.items.map(item => {
            if (++count > 15000) throw new Error('Too many preview nodes');
            return `<li>${item.task ? (item.checked ? '☑ ' : '☐ ') : ''}${nested(item.tokens)}</li>`;
          }).join('')}</${tag}>`;
        }
        case 'table': {
          const table = token as Tokens.Table;
          const cells = (row: Tokens.TableCell[], tag: string) => row.map(cell => {
            if (++count > 15000) throw new Error('Too many preview nodes');
            return `<${tag}>${nested(cell.tokens)}</${tag}>`;
          }).join('');
          return `<div class="table-wrap"><table><thead><tr>${cells(table.header, 'th')}</tr></thead><tbody>${table.rows.map(row => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table></div>`;
        }
        case 'html': return text(token.raw);
        default: {
          const value = token as Tokens.Text;
          return value.tokens ? nested(value.tokens) : text(decodeHTML(value.text || token.raw));
        }
      }
    }).join('');
  };
  try { return render(Lexer.lex(content, { gfm: true })); }
  catch { return plain(); }
}

export function publicShareHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
}

export function noteSharePage(title: string, content: string, expiresAt: number): Response {
  const headers = publicShareHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)} · rachg</title><style>
    :root{color-scheme:light dark}*{box-sizing:border-box}body{font:16px/1.75 system-ui,sans-serif;max-width:860px;margin:48px auto;padding:0 24px;background:#fafaf9;color:#292524}header{border-bottom:1px solid #d6d3d1;padding-bottom:24px;margin-bottom:28px}header p{font-size:13px;color:#78716c}h1{font-size:32px;line-height:1.25}h1,h2,h3,p,li{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0eeeb;padding:16px;border-radius:10px}code{font-size:14px}blockquote{border-left:3px solid #a8a29e;margin-left:0;padding-left:20px;color:#78716c}a{color:inherit;text-underline-offset:3px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d6d3d1;padding:8px;text-align:left}@media(prefers-color-scheme:dark){body{background:#18181b;color:#e7e5e4}header,th,td{border-color:#44403c}pre{background:#27272a}header p,blockquote{color:#a8a29e}}
  </style></head><body><header><p>rachg · Shared note · Read only</p><h1>${escapeHtml(title)}</h1><p>A saved snapshot · Available until ${new Date(expiresAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</p></header><main>${renderSharedMarkdown(content)}</main></body></html>`, { headers });
}
