import type { ApiErrorResponse, MailItem, MailListResponse, MailMessage, MailResponse, MailSendRequest, MailSendResponse, SentMailItem, SentMailListResponse, SentMailMessage, SentMailResponse } from '../types';
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

export async function fetchSentMail(): Promise<SentMailItem[]> {
  const response = await fetch(`${API_BASE_URL}/v1/mail/sent`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to load sent mail');
  const data = await response.json() as SentMailListResponse;
  if (!data.success || !Array.isArray(data.messages)) throw new Error('Malformed sent mail response');
  return data.messages;
}

export async function fetchMailMessage(id: string): Promise<MailMessage> {
  const response = await fetch(`${API_BASE_URL}/v1/mail/${encodeURIComponent(id)}`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to open email');
  const data = await response.json() as MailResponse;
  if (!data.success || !data.message) throw new Error('Malformed email response');
  return data.message;
}

export async function fetchSentMailMessage(id: string): Promise<SentMailMessage> {
  const response = await fetch(`${API_BASE_URL}/v1/mail/sent/${encodeURIComponent(id)}`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to open sent email');
  const data = await response.json() as SentMailResponse;
  if (!data.success || !data.message) throw new Error('Malformed sent email response');
  return data.message;
}

export async function deleteMailMessage(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/mail/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to delete email');
}

export async function sendMail(payload: MailSendRequest): Promise<MailSendResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/mail/send`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok || response.redirected || response.url.includes('/cdn-cgi/access/login')) await throwMailError(response, 'Unable to send email');
  const data = await response.json() as MailSendResponse;
  if (!data.success || !data.id || !data.resendId) throw new Error('Malformed send response');
  return data;
}
