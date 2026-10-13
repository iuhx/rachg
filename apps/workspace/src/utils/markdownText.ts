import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { byteLength } from './qr';

export const MARKDOWN_TEXT_BYTES = 10_000_000;
interface TextNode {
  type: string; value?: string; children?: TextNode[]; url?: string; alt?: string | null;
  identifier?: string; ordered?: boolean | null; start?: number | null; checked?: boolean | null;
}

function boundedMap<T>(items: readonly T[], render: (item: T, index: number) => string, separator = ''): string {
  const parts: string[] = [];
  let bytes = 0;
  for (let index = 0; index < items.length; index++) {
    const part = (index ? separator : '') + render(items[index], index);
    bytes += byteLength(part);
    // Block separators are removed at the end; accept the exact 10 MB boundary.
    if (bytes > MARKDOWN_TEXT_BYTES + 2) throw new Error('Converted text exceeds 10 MB. Convert a smaller section at a time.');
    parts.push(part);
  }
  return parts.join('');
}

/** Parse text as data with a state-machine parser, including multi-megabyte paragraphs. */
export function markdownToText(markdown: string): string {
  if (markdown.length > MARKDOWN_TEXT_BYTES || byteLength(markdown) > MARKDOWN_TEXT_BYTES) {
    throw new Error('Use Markdown up to 10 MB at a time. Your input has been kept.');
  }
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const definitions = new Map<string, string>();
  const collect = (node: TextNode, depth = 0) => {
    if (depth > 64) throw new Error('This document is nested too deeply. Simplify it to continue.');
    if (node.type === 'definition' && node.identifier && !definitions.has(node.identifier.toUpperCase())) definitions.set(node.identifier.toUpperCase(), node.url || '');
    for (const child of node.children || []) collect(child, depth + 1);
  };
  collect(tree);
  const render = (node: TextNode, depth = 0, inline = false): string => {
    if (depth > 64) throw new Error('This document is nested too deeply. Simplify it to continue.');
    const children = (separator = '') => boundedMap(node.children || [], child => render(child, depth + 1, !['root', 'blockquote', 'listItem'].includes(node.type)), separator);
    switch (node.type) {
      case 'definition': return '';
      case 'footnoteReference': return `[^${node.identifier}]`;
      case 'footnoteDefinition': return `[^${node.identifier}]: ${children().trimEnd()}\n\n`;
      case 'text': case 'inlineCode': return node.value || '';
      case 'break': return '\n';
      case 'link': case 'image': case 'linkReference': case 'imageReference': {
        const label = node.alt ?? children();
        const href = node.url ?? definitions.get(node.identifier?.toUpperCase() || '') ?? '';
        return !label || label === href ? href : href ? `${label} (${href})` : label;
      }
      case 'paragraph': case 'heading': return children() + '\n\n';
      case 'code': return (node.value || '') + '\n\n';
      case 'html': return (node.value || '') + (inline ? '' : '\n\n');
      case 'thematicBreak': return '---\n\n';
      case 'list': return boundedMap(node.children || [], (item, index) => {
        const prefix = (node.ordered ? `${(node.start ?? 1) + index}. ` : '- ') + (typeof item.checked === 'boolean' ? (item.checked ? '[x] ' : '[ ] ') : '');
        const body = render(item, depth + 1).replace(/\n+$/, '');
        return prefix + body.split('\n').join('\n' + ' '.repeat(prefix.length));
      }, '\n') + '\n\n';
      case 'table': return children('\n') + '\n\n';
      case 'tableRow': return children(' | ');
      default: return children();
    }
  };
  const result = render(tree).replace(/\n+$/, '');
  if (byteLength(result) > MARKDOWN_TEXT_BYTES) throw new Error('Converted text exceeds 10 MB. Convert a smaller section at a time.');
  return result;
}
