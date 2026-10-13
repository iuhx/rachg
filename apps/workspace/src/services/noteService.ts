import type {
  ApiErrorResponse,
  NoteItem,
  NoteListResponse,
  NoteResponse,
} from '../types';
import { AuthenticationRequiredError } from './fileService';

import { API_BASE_URL } from '../config/api';

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
  const response = await fetch(`${API_BASE_URL}/v1/notes`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  if (response.type === 'opaqueredirect' || response.status === 302 || response.redirected) throw new AuthenticationRequiredError();
  if (!response.ok) await throwNoteApiError(response, 'Unable to load notes');
  const data = await response.json().catch(() => null) as NoteListResponse | null;
  if (!data) throw new Error('Notes could not be loaded. Reconnect your workspace and try again.');
  if (!data.success || !Array.isArray(data.notes)) throw new Error('Malformed notes response');
  return data.notes;
}

export async function createNote(title: string, content: string): Promise<NoteItem> {
  const response = await fetch(`${API_BASE_URL}/v1/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ title, content }),
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
