import type {
  ApiErrorResponse,
  NoteItem,
  NoteCategory,
  NoteResponse,
} from '../types';
import { AuthenticationRequiredError } from './fileService';

import { API_BASE_URL } from '../config/api';
import { NOTE_ARCHIVE_BYTES, NOTE_ARCHIVE_COUNT, type ImportNote } from '../utils/noteTransfer';

export interface NoteShare {
  token: string;
  url: string;
  title: string;
  content: string;
  createdTimestamp: number;
  expiresTimestamp: number;
}

async function shareRequest(id: string, method: string, payload?: unknown): Promise<{ share: NoteShare | null; enabled?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/v1/notes/${encodeURIComponent(id)}/share`, {
    method, credentials: 'include', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  if (response.status === 404) throw new Error('Note sharing is not available yet. The server needs to be updated.');
  if (!response.ok) await throwNoteApiError(response, 'Unable to manage note sharing');
  const data = await response.json().catch(() => null);
  if (!data?.success || !('share' in data)) throw new Error('Invalid note sharing response. Please sign in again.');
  if (data.share !== null) {
    const share = data.share;
    if (typeof share.token !== 'string' || !/^[a-f0-9]{64}$/.test(share.token) ||
        share.url !== `${API_BASE_URL}/s/${share.token}` || typeof share.title !== 'string' || typeof share.content !== 'string' ||
        !Number.isSafeInteger(share.createdTimestamp) || !Number.isSafeInteger(share.expiresTimestamp) ||
        share.expiresTimestamp <= share.createdTimestamp || share.expiresTimestamp > 8_640_000_000_000_000) {
      throw new Error('Invalid note sharing response. Reload before sharing.');
    }
  }
  return data;
}

export const getNoteShare = (id: string) => shareRequest(id, 'GET');
export const revokeNoteShare = (id: string, token: string) => shareRequest(id, 'DELETE', { token });
export async function createNoteShare(note: NoteItem): Promise<NoteShare> {
  const { share } = await shareRequest(note.id, 'POST', { title: note.title, content: note.content, updatedTimestamp: note.updatedTimestamp });
  if (!share) throw new Error('No share link was returned. Reopen Share to check its status.');
  return share;
}

/** Test the public path without using the administrator's Access cookie. */
export async function isPublicNoteSharingReady(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/s/status`, {
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    const data = response.ok ? await response.json() : null;
    return data?.service === 'rachg-note-share' && data.ready === true;
  } catch { return false; }
}

async function throwNoteApiError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401 || response.status === 403) throw new AuthenticationRequiredError();
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(body?.error || `${fallback} (HTTP ${response.status})`);
}

export async function fetchNotes(): Promise<NoteItem[]> {
  // Imported notes must not disappear on reload once the notebook exceeds 200.
  const notes = await readAllNotes(false);
  return notes.sort((a, b) => b.updatedTimestamp - a.updatedTimestamp);
}

export function fetchNotesForExport(): Promise<NoteItem[]> {
  return readAllNotes(true);
}

/** Retry only this read, never a note creation, update, import or deletion. */
async function readNotesPage(after: string): Promise<Response> {
  const deadline = Date.now() + 30_000;
  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Loading notes timed out. Please retry.');
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/v1/notes/export${after ? `?after=${encodeURIComponent(after)}` : ''}`, {
        credentials: 'include', redirect: 'manual', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(remaining),
      });
    } catch (error) {
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new Error('Loading notes timed out. Please retry.');
      }
      if (attempt === 0) { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
      throw new Error('Unable to reach the notes service. Retry, or reconnect your workspace if this continues.');
    }
    if (attempt === 0 && [408, 500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
    return response;
  }
}

async function readAllNotes(enforceArchiveLimits: boolean): Promise<NoteItem[]> {
  const notes: NoteItem[] = [];
  let after = '', totalBytes = 0;
  do {
    const response = await readNotesPage(after);
    if (response.type === 'opaqueredirect' || response.status === 302 || response.redirected) throw new AuthenticationRequiredError();
    if (!response.ok) await throwNoteApiError(response, enforceArchiveLimits ? 'Unable to export notes' : 'Unable to load notes');
    const data = await response.json().catch(() => null);
    if (!data) throw new Error('Notes could not be loaded. Reconnect your workspace and try again.');
    if (!data?.success || !Array.isArray(data.notes) || (data.nextCursor !== null && (typeof data.nextCursor !== 'string' || data.nextCursor <= after))) throw new Error('Invalid note export response. No partial backup was downloaded.');
    totalBytes += new TextEncoder().encode(JSON.stringify(data.notes)).byteLength;
    notes.push(...data.notes);
    if (enforceArchiveLimits && (notes.length > NOTE_ARCHIVE_COUNT || totalBytes > NOTE_ARCHIVE_BYTES)) throw new Error('The backup exceeds 1,000 notes or 20 MB. Export large notes individually instead.');
    after = data.nextCursor || '';
  } while (after);
  return notes;
}

export async function importNote(note: ImportNote): Promise<{ note: NoteItem; imported: boolean }> {
  const response = await fetch(`${API_BASE_URL}/v1/notes/import`, {
    method: 'POST', credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(note),
  });
  if (response.type === 'opaqueredirect' || response.status === 302 || response.redirected) throw new AuthenticationRequiredError();
  if (!response.ok) await throwNoteApiError(response, 'Unable to import this note');
  const data = await response.json().catch(() => null);
  if (!data?.success || !data.note || typeof data.note.id !== 'string' || data.note.title !== note.title || data.note.content !== note.content || typeof data.imported !== 'boolean') throw new Error('Unable to confirm this import. Retry safely to check its status.');
  return data;
}

export async function createNote(title: string, content: string, categoryId: string | null = null): Promise<NoteItem> {
  const response = await fetch(`${API_BASE_URL}/v1/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ title, content, categoryId }),
  });
  if (!response.ok) await throwNoteApiError(response, 'Unable to create note');
  const data = await response.json() as NoteResponse;
  if (!data.success || !data.note) throw new Error('Malformed note response');
  return data.note;
}

export async function updateNote(note: NoteItem): Promise<NoteItem> {
  const response = await fetch(`${API_BASE_URL}/v1/notes/${encodeURIComponent(note.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ title: note.title, content: note.content }),
  });
  if (!response.ok) await throwNoteApiError(response, 'Unable to save note');
  const data = await response.json() as NoteResponse;
  if (!data.success || !data.note) throw new Error('Malformed note response');
  return data.note;
}

export async function deleteNote(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) await throwNoteApiError(response, 'Unable to delete note');
}

async function organizationRequest(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${API_BASE_URL}/v1/${path}`, {
    method, credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(30_000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.type === 'opaqueredirect' || response.status === 302 || response.redirected) throw new AuthenticationRequiredError();
  if (!response.ok) await throwNoteApiError(response, 'Unable to update note organization');
  const data = await response.json().catch(() => null);
  if (!data?.success) throw new Error('Unable to load note organization. Reconnect and try again.');
  return data;
}
export async function fetchNoteCategories(): Promise<NoteCategory[]> {
  const data = await organizationRequest('note-categories');
  if (!Array.isArray(data.categories)) throw new Error('Invalid category response.');
  return data.categories;
}
export async function saveNoteCategory(category: { id: string; name: string; revision?: number }): Promise<NoteCategory[]> {
  const editing = category.revision !== undefined;
  return (await organizationRequest(`note-categories${editing ? `/${encodeURIComponent(category.id)}` : ''}`, editing ? 'PUT' : 'POST', category)).categories;
}
export async function deleteNoteCategory(category: NoteCategory): Promise<NoteCategory[]> {
  return (await organizationRequest(`note-categories/${encodeURIComponent(category.id)}`, 'DELETE', { revision: category.revision })).categories;
}
export async function organizeNote(note: NoteItem, categoryId: string | null, pinned: boolean): Promise<NoteItem> {
  const data = await organizationRequest(`notes/${encodeURIComponent(note.id)}/organization`, 'PUT', {
    categoryId, pinned, revision: note.organizationRevision ?? 0,
  });
  if (data.note?.id !== note.id || !Number.isSafeInteger(data.note.organizationRevision)) throw new Error('Unable to confirm organization. Refresh and try again.');
  return data.note;
}
