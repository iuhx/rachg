import type { NoteItem } from '../types';

/** Metadata can arrive after a body autosave, or the reverse. Merge independently. */
export function mergeNoteOrganization(note: NoteItem, incoming: NoteItem): NoteItem {
  if ((incoming.organizationRevision ?? 0) < (note.organizationRevision ?? 0)) return note;
  return { ...note, categoryId: incoming.categoryId ?? null, categoryName: incoming.categoryName ?? null,
    pinned: Boolean(incoming.pinned), organizationRevision: incoming.organizationRevision ?? 0 };
}

export function filterOrganizedNotes(notes: NoteItem[], category: string, query: string, allCategories: boolean): NoteItem[] {
  const text = query.trim().toLowerCase();
  return notes.filter(note => (category === 'all' || (text && allCategories) || (note.categoryId ?? '') === category)
    && (!text || `${note.title}\n${note.content}`.toLowerCase().includes(text)))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedTimestamp - a.updatedTimestamp || a.id.localeCompare(b.id));
}
