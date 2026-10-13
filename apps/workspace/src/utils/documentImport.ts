import mammoth from 'mammoth';
import { unzipSync } from 'fflate';
import { checkTextSize, richTextToMarkdown } from './richText';
import { DOCUMENT_FILE_BYTES, type ImportedDocument } from './documentFormats';

function validateDocx(data: ArrayBuffer) {
  let count = 0, total = 0;
  const entries = unzipSync(new Uint8Array(data), { filter(entry) {
    total += entry.originalSize;
    if (++count > 500 || total > 60_000_000) throw new Error('This Word document is too large when unpacked. Use a smaller document.');
    return entry.name === '[Content_Types].xml' || entry.name === 'word/document.xml';
  } });
  if (!entries['[Content_Types].xml'] || !entries['word/document.xml']) throw new Error('This file is not a valid DOCX document. Save it as .docx in Word and retry.');
}

export async function importDocument(file: File): Promise<ImportedDocument> {
  if (!file.size || file.size > DOCUMENT_FILE_BYTES) throw new Error('Choose a non-empty document up to 30 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['docx', 'md', 'markdown', 'txt', 'html', 'htm'].includes(extension)) throw new Error('Choose DOCX, Markdown, TXT or HTML. Save older .doc files as .docx first.');
  const data = await file.arrayBuffer();
  let markdown: string, warning = '';
  if (extension === 'docx') {
    validateDocx(data);
    let images = 0;
    const result = await mammoth.convertToHtml({ arrayBuffer: data }, {
      externalFileAccess: false, includeEmbeddedStyleMap: false,
      convertImage: mammoth.images.imgElement(async () => { images++; return { src: '' }; }),
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='标题 1'] => h1:fresh", "p[style-name='标题 2'] => h2:fresh", "p[style-name='标题 3'] => h3:fresh", "p[style-name='Code Block'] => pre:fresh", "r[style-name='Inline Code'] => code"],
    });
    if (result.messages.some(message => message.type === 'error')) throw new Error('Some document content could not be read. Save a fresh DOCX copy and retry.');
    markdown = richTextToMarkdown(result.value, DOCUMENT_FILE_BYTES).markdown;
    warning = [images ? 'Embedded images were replaced with text placeholders.' : '', /<ol(?:\s|>)/.test(result.value) ? 'Word list numbering may restart at 1. Check numbered lists before saving.' : '', result.messages.length ? 'Some Word formatting was simplified.' : ''].filter(Boolean).join(' ');
  } else {
    const bytes = new Uint8Array(data);
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    let text: string;
    try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n'); }
    catch { throw new Error('Save this text document as UTF-8 or UTF-16 and retry.'); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('This file contains binary data. Choose a text document or DOCX.');
    checkTextSize(text, DOCUMENT_FILE_BYTES);
    markdown = extension === 'html' || extension === 'htm' ? richTextToMarkdown(text, DOCUMENT_FILE_BYTES).markdown
      // Escape literal Markdown punctuation directly, avoiding a huge intermediate HTML tree.
      : extension === 'txt' ? text.replace(/([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '\\$1').replace(/\n/g, '\n\n').trimEnd() : text;
  }
  checkTextSize(markdown, DOCUMENT_FILE_BYTES);
  if (!markdown.trim()) throw new Error('No readable text was found in this document.');
  return { markdown, name: file.name, warning };
}
