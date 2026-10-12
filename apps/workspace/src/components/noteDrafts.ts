import type { NoteItem } from '../types';

// Session storage is scoped to this browser tab; it is never sent to another origin.
const memory = new Map<string, NoteItem>();
const key = (id: string) => `rachg.note-draft.${id}`;
export function rememberDraft(note: NoteItem): boolean {
  memory.set(note.id, note);
  try { window.sessionStorage.setItem(key(note.id), JSON.stringify(note)); return true; }
  catch { return false; }
}
export function recoverDraft(id: string): NoteItem | null {
  if (memory.has(id)) return memory.get(id)!;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key(id)) || 'null') as NoteItem | null;
    if (value?.id === id && typeof value.title === 'string' && typeof value.content === 'string') return value;
  } catch { /* A blocked or corrupt draft store must not replace server data. */ }
  return null;
}
export function discardSavedDraft(saved: NoteItem): void {
  const current = recoverDraft(saved.id);
  if (!current || current.title.trim() !== saved.title || current.content !== saved.content) return;
  memory.delete(saved.id);
  try { window.sessionStorage.removeItem(key(saved.id)); } catch { /* In-memory backup is already cleared. */ }
}
export function discardDeletedDraft(id: string): void {
  memory.delete(id);
  try { window.sessionStorage.removeItem(key(id)); } catch { /* Best effort for an explicitly deleted note. */ }
}
