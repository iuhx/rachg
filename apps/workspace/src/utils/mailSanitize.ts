import { fromHtml } from 'hast-util-from-html';
import { sanitize, defaultSchema } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';

const blockedTags = [
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea',
  'template', 'noscript', 'meta', 'base', 'applet'
];

const emailSchema: NonNullable<Parameters<typeof sanitize>[1]> = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'style', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img',
    'span', 'div', 'hr', 'center', 'font', 'section', 'article', 'main', 'header', 'footer'
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': ['style', 'className', 'class', 'align', 'valign', 'bgcolor', 'color', 'dir', 'width', 'height', 'title'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    table: ['border', 'cellpadding', 'cellspacing', 'width', 'align', 'bgcolor', 'style'],
    td: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'bgcolor', 'style'],
    th: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'bgcolor', 'style'],
    font: ['color', 'size', 'face']
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https', 'data', 'cid']
  },
  strip: blockedTags
};

/**
 * Sanitizes received email HTML to safely render rich text, inline styles,
 * tables, and images without permitting script execution, form submissions, or iframes.
 */
export function sanitizeEmailHtml(rawHtml: string, maxLen = 5_000_000): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  const input = rawHtml.length > maxLen ? rawHtml.slice(0, maxLen) : rawHtml;
  try {
    const tree = fromHtml(input, { fragment: true });
    const cleanTree = sanitize(tree, emailSchema);
    return toHtml(cleanTree);
  } catch {
    return '';
  }
}
