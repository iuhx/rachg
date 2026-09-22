import type { ApiErrorResponse, ScratchpadItem, ScratchpadResponse } from '../types';
import { AuthenticationRequiredError } from './fileService';

const API_BASE_URL = 'https://files.rachg.com';

async function throwScratchpadError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401) throw new AuthenticationRequiredError();
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(body?.error || `${fallback} (HTTP ${response.status})`);
}

export async function fetchScratchpad(): Promise<ScratchpadItem> {
  const response = await fetch(`${API_BASE_URL}/v1/scratchpad`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) await throwScratchpadError(response, 'Unable to load scratchpad');
  const data = await response.json() as ScratchpadResponse;
  if (!data.success || !data.scratchpad) throw new Error('Malformed scratchpad response');
  return data.scratchpad;
}

export async function saveScratchpad(content: string, image?: File | null): Promise<ScratchpadItem> {
  const form = new FormData();
  form.set('content', content);
  if (image) form.set('image', image);
  const response = await fetch(`${API_BASE_URL}/v1/scratchpad`, { method: 'PUT', credentials: 'include', body: form });
  if (!response.ok) await throwScratchpadError(response, 'Unable to save scratchpad');
  const data = await response.json() as ScratchpadResponse;
  if (!data.success || !data.scratchpad) throw new Error('Malformed scratchpad response');
  return data.scratchpad;
}

export async function clearScratchpad(): Promise<ScratchpadItem> {
  const response = await fetch(`${API_BASE_URL}/v1/scratchpad`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok) await throwScratchpadError(response, 'Unable to clear scratchpad');
  const data = await response.json() as ScratchpadResponse;
  if (!data.success || !data.scratchpad) throw new Error('Malformed scratchpad response');
  return data.scratchpad;
}
