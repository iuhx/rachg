import { fromHtml } from 'hast-util-from-html';
import { sanitize, defaultSchema } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import { toMdast } from 'hast-util-to-mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { byteLength, TOOL_TEXT_BYTES } from './qr';

type Root = ReturnType<typeof fromHtml>;
type Node = Root['children'][number];
type Element = Extract<Node, { type: 'element' }>;
const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'head', 'link', 'meta', 'input', 'button', 'select', 'textarea', 'video', 'audio', 'source']);
const schema: NonNullable<Parameters<typeof sanitize>[1]> = {
  ...defaultSchema,
  tagNames: ['p','div','span','br','strong','b','em','i','del','s','strike','blockquote','ul','ol','li','pre','code','a','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tfoot','tr','th','td'],
  attributes: { a: ['href','title'], ol: ['start'], li: ['value'], code: [['className', /^language-[\w-]+$/]], th: ['align'], td: ['align'] },
  protocols: { href: ['http','https','mailto'] },
  strip: [...blocked],
};

export function checkTextSize(value: string, maximum = TOOL_TEXT_BYTES) {
  if (value.length > maximum || byteLength(value) > maximum) throw new Error(`Use up to ${maximum >= 1_000_000 ? `${maximum / 1_000_000} MB` : `${maximum / 1000} KB`} at a time. Your existing input has been kept.`);
}
function safeLink(value: unknown, image = false): string | undefined {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) return;
  const text = value.trim();
  if (!image && text.startsWith('#')) return text;
  try { const url = new URL(text); if ((image ? ['http:','https:'] : ['http:','https:','mailto:']).includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Relative URLs have no reliable source origin in clipboard fragments. */ }
}
const wrapper = (tagName: string, children: Element['children']): Element => ({ type: 'element', tagName, properties: {}, children });

/** Pure AST parsing: untrusted HTML never enters a browser DOM or fetches resources. */
export function richTextToMarkdown(html: string, maximum = TOOL_TEXT_BYTES): { html: string; markdown: string } {
  checkTextSize(html, maximum);
  const tree = fromHtml(html, { fragment: true });
  let nodes = 0;
  const normalize = (node: Node, depth: number): Node[] => {
    if (++nodes > 15000 || depth > 64) throw new Error('This content is too complex. Paste a smaller section.');
    if (node.type === 'comment' || node.type === 'doctype') return [];
    if (node.type !== 'element') return [node];
    const style = typeof node.properties.style === 'string' ? node.properties.style : '';
    if (blocked.has(node.tagName) || node.properties.hidden || node.properties.ariaHidden === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(style)) return [];
    if (node.tagName === 'img') {
      const url = safeLink(node.properties.src, true);
      const alt = typeof node.properties.alt === 'string' && node.properties.alt.trim() ? node.properties.alt : 'Image';
      return [{ ...wrapper(url ? 'a' : 'span', [{ type: 'text', value: url ? alt : `${alt} (embedded image omitted)` }]), properties: url ? { href: url } : {} }];
    }
    node.children = node.children.flatMap(child => normalize(child, depth + 1)) as Element['children'];
    if (node.tagName === 'a') {
      const url = safeLink(node.properties.href);
      if (url) node.properties.href = url; else delete node.properties.href;
    }
    // Common browser/Word/Google Docs clipboard formatting is carried by spans.
    if ((node.tagName === 'b' || node.tagName === 'strong') && /font-weight\s*:\s*(?:normal|400)\b/i.test(style)) node.tagName = 'span';
    const tags = [
      /font-weight\s*:\s*(?:bold|[6-9]00)\b/i.test(style) ? 'strong' : '',
      /font-style\s*:\s*italic\b/i.test(style) ? 'em' : '',
      /text-decoration(?:-line)?\s*:[^;]*\bline-through\b/i.test(style) ? 'del' : '',
    ].filter(tag => tag && !(tag === 'strong' ? ['strong','b'] : tag === 'em' ? ['em','i'] : ['del','s','strike']).includes(node.tagName));
    for (const tag of tags) node.children = [wrapper(tag, node.children)];
    return [node];
  };
  tree.children = tree.children.flatMap(node => normalize(node, 0));
  const clean = sanitize(tree, schema);
  const safeHtml = toHtml(clean);
  const markdown = toMarkdown(toMdast(clean), { extensions: [gfmToMarkdown()], bullet: '-', fences: true, emphasis: '*', strong: '*' }).trimEnd();
  checkTextSize(safeHtml, maximum); checkTextSize(markdown, maximum);
  return { html: safeHtml, markdown };
}

export function plainTextHtml(text: string): string {
  checkTextSize(text);
  return toHtml({ type: 'root', children: text.replace(/\r\n?/g, '\n').split('\n').map(line => wrapper('p', line ? [{ type: 'text', value: line }] : [wrapper('br', [])])) });
}
