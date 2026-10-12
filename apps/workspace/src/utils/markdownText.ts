import { Lexer, type Token, type Tokens } from 'marked';
import { decodeHTML } from 'entities';
import { byteLength, TOOL_TEXT_BYTES } from './qr';

function boundedMap<T>(items: readonly T[], render: (item: T, index: number) => string, separator = ''): string {
  const parts: string[] = [];
  let bytes = 0;
  for (let index = 0; index < items.length; index++) {
    const part = (index ? separator : '') + render(items[index], index);
    bytes += byteLength(part);
    if (bytes > TOOL_TEXT_BYTES) throw new Error('Converted text exceeds 200 KB. Convert a smaller section at a time.');
    parts.push(part);
  }
  return parts.join('');
}

// Read tokens only: no generated HTML, DOM insertion, remote images or network calls.
export function markdownToText(markdown: string): string {
  if (markdown.length > TOOL_TEXT_BYTES || byteLength(markdown) > TOOL_TEXT_BYTES) {
    throw new Error('Use Markdown up to 200 KB at a time. Your input has been kept.');
  }
  const inline = (tokens: Token[], depth: number): string => {
    if (depth > 64) throw new Error('This document is nested too deeply. Simplify it to continue.');
    return boundedMap(tokens, token => {
      switch (token.type) {
        case 'checkbox': return '';
        case 'br': return '\n';
        case 'codespan': return (token as Tokens.Codespan).text;
        case 'link': case 'image': {
          const link = token as Tokens.Link | Tokens.Image;
          const label = link.tokens ? inline(link.tokens, depth + 1) : decodeHTML(link.text);
          const href = decodeHTML(link.href);
          return !label || label === href ? href : `${label} (${href})`;
        }
        case 'strong': case 'em': case 'del': return inline((token as Tokens.Strong).tokens, depth + 1);
        default: {
          const text = token as Tokens.Text;
          return text.tokens ? inline(text.tokens, depth + 1) : decodeHTML(text.text || token.raw);
        }
      }
    });
  };
  const blocks = (tokens: Token[], depth = 0): string => {
    if (depth > 64) throw new Error('This document is nested too deeply. Simplify it to continue.');
    return boundedMap(tokens, token => {
      switch (token.type) {
        case 'space': case 'def': case 'checkbox': return '';
        case 'heading': case 'paragraph': return inline((token as Tokens.Paragraph).tokens, depth + 1) + '\n\n';
        case 'code': return (token as Tokens.Code).text + '\n\n';
        case 'blockquote': return blocks((token as Tokens.Blockquote).tokens, depth + 1);
        case 'list': {
          const list = token as Tokens.List;
          return boundedMap(list.items, (item, index) => {
            const prefix = (list.ordered ? `${Number(list.start) + index}. ` : '- ') + (item.task ? (item.checked ? '[x] ' : '[ ] ') : '');
            const body = blocks(item.tokens, depth + 1).replace(/\n+$/, '');
            return prefix + body.split('\n').join('\n' + ' '.repeat(prefix.length));
          }, '\n') + '\n\n';
        }
        case 'table': {
          const table = token as Tokens.Table;
          return boundedMap([table.header, ...table.rows], row => boundedMap(row, cell => inline(cell.tokens, depth + 1), ' | '), '\n') + '\n\n';
        }
        case 'hr': return '---\n\n';
        case 'html': return token.raw + '\n\n'; // Literal text, never interpreted as HTML.
        default: return inline([token], depth + 1) + '\n';
      }
    });
  };
  return blocks(Lexer.lex(markdown, { gfm: true })).replace(/\n+$/, '');
}
