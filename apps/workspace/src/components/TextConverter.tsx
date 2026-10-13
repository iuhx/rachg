import React, { useMemo, useState } from 'react';
import { ArrowRight, Copy, Download, Save } from 'lucide-react';
import { markdownToText } from '../utils/markdownText';
import { downloadBlob } from '../utils/qr';
import { NewItemModal } from './NewItemModal';
import { RichTextInput } from './RichTextInput';
import type { NoteItem } from '../types';

interface Props {
  canSave: boolean; isActive: boolean;
  onSaveNote: (note: Partial<NoteItem>) => Promise<void>;
  onOpenNotes: () => void;
  onToQr: (text: string) => void;
}
export const TextConverter: React.FC<Props> = ({ canSave, isActive, onSaveNote, onOpenNotes, onToQr }) => {
  const [direction, setDirection] = useState<'plain' | 'markdown'>('plain');
  const [markdown, setMarkdown] = useState('');
  const [rich, setRich] = useState({ markdown: '', error: '' });
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<{ title: string; content: string; source: string; direction: 'plain' | 'markdown' } | null>(null);
  const [savedSources, setSavedSources] = useState({ plain: '', markdown: '' });
  const plain = useMemo(() => {
    try { return { text: markdownToText(markdown), error: '' }; }
    catch (error) { return { text: '', error: error instanceof Error ? error.message : 'Unable to convert this Markdown.' }; }
  }, [markdown]);
  const output = direction === 'plain' ? plain.text : rich.markdown;
  const error = direction === 'plain' ? plain.error : rich.error;
  const snapshot = `${direction}\n${output}`;
  const saved = Boolean(output && snapshot === savedSources[direction]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(output); setNotice('Copied to clipboard.'); }
    catch { setNotice('Clipboard access was denied. Select the result to copy it, or download it.'); }
  };
  const openSave = () => {
    if (!output || error || !canSave || saved) return;
    const title = output.split('\n').find(line => line.trim())?.replace(/^\s{0,3}#{1,6}\s+/, '').trim().slice(0, 180).replace(/[\uD800-\uDBFF]$/, '') || 'Converted note';
    setDraft({ title, content: output, source: snapshot, direction });
  };
  return <section className="workspace-card p-5 sm:p-6 space-y-5" aria-label="Text converter">
    <div><h3 className="type-section-heading">One place for your words.</h3><p className="type-secondary mt-1">Convert locally, then copy, download or keep the result in Notes.</p></div>
    <div className="workspace-segment flex-wrap" role="group" aria-label="Conversion direction">
      <button aria-pressed={direction === 'plain'} className={`workspace-segment-item ${direction === 'plain' ? 'workspace-segment-item-active' : ''}`} onClick={() => { setDirection('plain'); setNotice(''); }}>Markdown → Plain text</button>
      <button aria-pressed={direction === 'markdown'} className={`workspace-segment-item ${direction === 'markdown' ? 'workspace-segment-item-active' : ''}`} onClick={() => { setDirection('markdown'); setNotice(''); }}>Rich text → Markdown</button>
    </div>
    <div className="grid md:grid-cols-2 gap-5">
      <div>
        <label hidden={direction !== 'plain'} className="type-label space-y-2"><span className="block">Markdown</span><textarea aria-label="Markdown input" value={markdown} onChange={event => { setMarkdown(event.target.value); setNotice(''); }} placeholder={'# Hello\n\n- A useful idea\n- [A link](https://example.com)'} className="workspace-input workspace-input-mono tool-markdown-input block resize-y" /></label>
        <div hidden={direction !== 'markdown'}><RichTextInput onResult={(value, failure) => { setRich({ markdown: value, error: failure }); setNotice(''); }} /></div>
      </div>
      <label className="type-label space-y-2"><span className="block">{direction === 'plain' ? 'Plain text' : 'Markdown'}</span><textarea aria-label={direction === 'plain' ? 'Plain text preview' : 'Markdown preview'} value={output} readOnly placeholder="Your converted text appears here…" className={`workspace-input tool-markdown-input block resize-y ${direction === 'markdown' ? 'workspace-input-mono' : ''}`} /></label>
    </div>
    {error && <p role="alert" className="type-secondary text-red-600 dark:text-red-300">{error}</p>}
    <div className="flex flex-wrap justify-between items-center gap-3">
      <p className="type-caption">{output.length.toLocaleString()} characters · Local conversion · Up to 200 KB</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={!output || Boolean(error)} onClick={() => void copy()} className="workspace-button workspace-button-secondary"><Copy className="w-4 h-4" />Copy {direction === 'plain' ? 'text' : 'Markdown'}</button>
        <button disabled={!output || Boolean(error)} onClick={() => downloadBlob(new Blob([output], { type: direction === 'plain' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8' }), direction === 'plain' ? 'plain-text.txt' : 'converted.md')} className="workspace-button workspace-button-secondary"><Download className="w-4 h-4" />Download {direction === 'plain' ? 'TXT' : 'MD'}</button>
        <button disabled={!output || Boolean(error)} onClick={() => onToQr(output)} className="workspace-button workspace-button-secondary">Turn into QR<ArrowRight className="w-4 h-4" /></button>
        <button disabled={!output || Boolean(error) || !canSave || saved} onClick={openSave} className="workspace-button workspace-button-primary"><Save className="w-4 h-4" />{saved ? 'Saved to Notes' : 'Save to Notes'}</button>
      </div>
    </div>
    {!canSave && <p className="type-caption">Sign in to save a note. Conversion, copying and downloads stay available.</p>}
    {(notice || saved) && <p role="status" className="type-secondary">{notice || 'The converted result is saved in Notes.'} {saved && <button className="underline underline-offset-2" onClick={onOpenNotes}>Open Notes</button>}</p>}
    {draft && <NewItemModal isOpen isActive={isActive} type="note" initialNote={draft} onClose={() => setDraft(null)}
      onCreateNote={async note => { await onSaveNote(note); setSavedSources(current => ({ ...current, [draft.direction]: draft.source })); setNotice(''); }}
      onCreateTransfer={async () => { throw new Error('Choose Save to Notes for converted text.'); }} />}
  </section>;
};
