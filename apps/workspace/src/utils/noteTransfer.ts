import type { NoteItem } from '../types';

export const NOTE_ARCHIVE_BYTES = 20 * 1024 * 1024;
export const NOTE_ARCHIVE_COUNT = 1000;
export interface ImportNote { id: string; title: string; content: string; categoryName?: string | null; pinned?: boolean }
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

function validate(value: unknown): Omit<ImportNote, 'id'> {
  if (!value || typeof value !== 'object') throw new Error('Each note must contain a title and content.');
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.trim().length > 200 || typeof item.content !== 'string') throw new Error('Each note needs a title of 1–200 characters and text content.');
  if (bytes(item.content) > 1_000_000) throw new Error(`“${item.title.slice(0, 60)}” exceeds the 1 MB note limit.`);
  const name = typeof item.categoryName === 'string' ? item.categoryName.normalize('NFKC').trim() : null;
  if (item.categoryName != null && (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name))) throw new Error('Category names must be 1–40 characters without control characters.');
  if (item.pinned !== undefined && typeof item.pinned !== 'boolean') throw new Error('Invalid note pin state.');
  return { title: item.title.trim(), content: item.content, categoryName: name, pinned: item.pinned === true };
}

/** Parse locally. Backup IDs and timestamps never overwrite existing notes. */
export async function parseNoteFiles(files: File[]): Promise<ImportNote[]> {
  if (!files.length || files.length > NOTE_ARCHIVE_COUNT) throw new Error('Choose between 1 and 1,000 files.');
  if (files.reduce((total, file) => total + file.size, 0) > NOTE_ARCHIVE_BYTES) throw new Error('Choose up to 20 MB per import.');
  const notes: ImportNote[] = [];
  for (const file of files) {
    if (!/\.(md|markdown|txt|json)$/i.test(file.name)) throw new Error('Choose Markdown, TXT or JSON files. Extract ZIP archives first.');
    const text = (await file.text()).replace(/^\uFEFF/, '');
    let values: unknown[];
    if (/\.json$/i.test(file.name)) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error(`“${file.name}” is not valid JSON.`); }
      if (Array.isArray(parsed)) values = parsed;
      else if (parsed?.format === 'rachg-notes' && [1, 2].includes(parsed.version) && Array.isArray(parsed.notes)) values = parsed.notes;
      else throw new Error('This JSON is not a supported rachg notes backup.');
    } else values = [{ title: file.name.replace(/\.(md|markdown|txt)$/i, ''), content: text }];
    if (notes.length + values.length > NOTE_ARCHIVE_COUNT) throw new Error('Import up to 1,000 notes at a time.');
    for (const value of values) {
      const note = { id: `import-${crypto.randomUUID()}`, ...validate(value) };
      if (bytes(JSON.stringify(note)) > 2 * 1024 * 1024) throw new Error(`“${note.title.slice(0, 60)}” is too large after encoding.`);
      notes.push(note);
    }
  }
  if (!notes.length) throw new Error('This backup contains no notes.');
  return notes;
}

export function markdownFilename(title: string, prefix = ''): string {
  let safe = title.replace(/[\x00-\x1f\x7f/\\?%*:|"<>]/g, '_').slice(0, 100).replace(/[. ]+$/g, '') || 'untitled';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return `${prefix ? `${prefix}-` : ''}${safe}.md`;
}

export function downloadNoteFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function noteBackup(notes: NoteItem[]): string {
  if (notes.length > NOTE_ARCHIVE_COUNT) throw new Error('A backup can contain up to 1,000 notes.');
  const result = JSON.stringify({ format: 'rachg-notes', version: 2, exportedAt: new Date().toISOString(), notes: notes.map(note => ({ ...validate(note), updatedTimestamp: note.updatedTimestamp })) }, null, 2);
  if (bytes(result) > NOTE_ARCHIVE_BYTES) throw new Error('The backup exceeds 20 MB. Export large notes individually instead.');
  return result;
}

export async function markdownArchive(notes: NoteItem[]): Promise<Blob> {
  const { zip, strToU8 } = await import('fflate');
  const entries: Record<string, Uint8Array> = Object.create(null);
  entries['notes.json'] = strToU8(noteBackup(notes));
  notes.forEach((note, index) => { entries[markdownFilename(note.title, String(index + 1).padStart(4, '0'))] = strToU8(note.content); });
  // Store entries without parallel compression workers; the archive is bounded
  // to 20 MB of notes and should remain usable on low-memory devices.
  return new Promise((resolve, reject) => zip(entries, { level: 0 }, (error, data) => {
    if (error) reject(error);
    else resolve(new Blob([Uint8Array.from(data).buffer], { type: 'application/zip' }));
  }));
}
