import { marked } from 'marked';
import { checkTextSize, richTextToMarkdown } from './richText';

export const DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = '.docx,.md,.markdown,.txt,.html,.htm';
export interface ImportedDocument { markdown: string; name: string; warning: string }

export function documentName(name: string, extension: string): string {
  const stem = name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').slice(0, 100) || 'converted';
  return `${stem}.${extension}`;
}

export function safeDocumentLink(value: string): string | undefined {
  if (/[\x00-\x1f\x7f]/.test(value)) return;
  try { const url = new URL(value); if (['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch { /* Unsupported links remain text. */ }
}

export function markdownDocumentHtml(markdown: string): string {
  checkTextSize(markdown);
  // Parse and sanitize as data. No document DOM or remote resources are loaded.
  return richTextToMarkdown(marked.parse(markdown, { async: false, gfm: true })).html;
}

export function htmlDocument(markdown: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Converted document</title><style>body{max-width:760px;margin:40px auto;padding:0 24px;font:16px/1.6 Arial,sans-serif;color:#17181b}h1,h2,h3,h4,h5,h6{line-height:1.25;color:#000}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:16px}code{font-family:Consolas,monospace}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #d9d9d9;padding:8px;text-align:left;overflow-wrap:anywhere}th{background:#f1f2f4}blockquote{margin-left:0;padding-left:20px;border-left:2px solid #ccc}a{overflow-wrap:anywhere}@media print{body{margin:0;max-width:none}}</style></head><body>${markdownDocumentHtml(markdown)}</body></html>`;
}
