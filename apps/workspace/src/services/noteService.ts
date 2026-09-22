import type {
  ApiErrorResponse,
  NoteItem,
  NoteListResponse,
  NoteResponse,
} from '../types';
import { AuthenticationRequiredError } from './fileService';

const API_BASE_URL = import.meta.env.PUBLIC_FILE_SERVICE_URL || 'https://files.rachg.com';

async function throwNoteApiError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401) throw new AuthenticationRequiredError();
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(body?.error || `${fallback} (HTTP ${response.status})`);
}

export async function fetchNotes(): Promise<NoteItem[]> {
  const response = await fetch(`${API_BASE_URL}/v1/notes`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) await throwNoteApiError(response, 'Unable to load notes');
  const data = await response.json() as NoteListResponse;
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
