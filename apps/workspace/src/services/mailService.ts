import type { ApiErrorResponse, MailItem, MailListResponse, MailMessage, MailResponse } from '../types';
import { AuthenticationRequiredError } from './fileService';

const API_BASE_URL = 'https://files.rachg.com';

async function throwMailError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401 || response.redirected || response.url.includes('/cdn-cgi/access/login')) {
    throw new AuthenticationRequiredError();
  }
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(body?.error || `${fallback} (HTTP ${response.status})`);
}

export async function fetchMail(): Promise<MailItem[]> {
  const response = await fetch(`${API_BASE_URL}/v1/mail`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to load mail');
  const data = await response.json() as MailListResponse;
  if (!data.success || !Array.isArray(data.messages)) throw new Error('Malformed mail list response');
  return data.messages;
}

export async function fetchMailMessage(id: string): Promise<MailMessage> {
  const response = await fetch(`${API_BASE_URL}/v1/mail/${encodeURIComponent(id)}`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to open email');
  const data = await response.json() as MailResponse;
  if (!data.success || !data.message) throw new Error('Malformed email response');
  return data.message;
}

export async function deleteMailMessage(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/mail/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to delete email');
}
