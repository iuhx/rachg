import React, { useRef, useState } from 'react';
import { checkTextSize, plainTextHtml, richTextToMarkdown } from '../utils/richText';

interface Props { onResult: (markdown: string, error: string) => void; disabled?: boolean }
export const RichTextInput: React.FC<Props> = ({ onResult, disabled = false }) => {
  const editor = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const read = () => {
    const html = editor.current?.innerHTML || '';
    setEmpty(!editor.current?.textContent?.trim());
    try { onResult(richTextToMarkdown(html).markdown, ''); }
    catch (error) { onResult('', error instanceof Error ? error.message : 'Unable to convert this content.'); }
  };
  const insert = (html: string, text: string) => {
    if (!editor.current || disabled) return;
    try {
      const safe = richTextToMarkdown(html || plainTextHtml(text)).html;
      checkTextSize(editor.current.innerHTML + safe);
      // Only serialized, allowlisted HTML is inserted; it contains no image/media sources.
      const template = document.createElement('template'); template.innerHTML = safe;
      const last = template.content.lastChild;
      editor.current.focus();
      const selection = window.getSelection();
      const range = selection?.rangeCount && editor.current.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0) : document.createRange();
      if (!editor.current.contains(range.commonAncestorContainer)) { range.selectNodeContents(editor.current); range.collapse(false); }
      range.deleteContents(); range.insertNode(template.content);
      if (last) { range.setStartAfter(last); range.collapse(true); selection?.removeAllRanges(); selection?.addRange(range); }
      read();
    } catch (error) { onResult('', error instanceof Error ? error.message : 'Unable to paste this content.'); }
  };
  return <div className="space-y-2">
    <div className="flex justify-between items-center gap-2"><span className="type-label">Rich text</span><button type="button" disabled={disabled} className="type-caption underline underline-offset-2" onClick={() => { editor.current?.replaceChildren(); setEmpty(true); onResult('', ''); }}>Clear input</button></div>
    <div className="relative">
      {empty && <p className="type-secondary absolute top-3 left-3 right-3 pointer-events-none">Copy formatted text from a page or document, then paste here.</p>}
      <div ref={editor} role="textbox" aria-label="Rich text input" aria-multiline="true" aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning
        className="workspace-input tool-markdown-input rich-text-input overflow-auto" onInput={read}
        onPaste={event => { event.preventDefault(); insert(event.clipboardData.getData('text/html'), event.clipboardData.getData('text/plain')); }}
        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); insert(event.dataTransfer.getData('text/html'), event.dataTransfer.getData('text/plain')); }}
        onClick={event => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); }} />
    </div>
    <p className="type-caption">Images become links. Embedded images and unsupported formatting are omitted.</p>
  </div>;
};
