import type { FileItem, UploadResponse, FileListResponse, ApiErrorResponse } from '../types';

const API_BASE_URL = import.meta.env.PUBLIC_FILE_SERVICE_URL || 'https://files.rachg.com';

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Authentication required. Sign in with Cloudflare Access to continue.');
    this.name = 'AuthenticationRequiredError';
  }
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401) throw new AuthenticationRequiredError();
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(body?.error || `${fallback} (HTTP ${response.status})`);
}

export async function fetchActiveFiles(): Promise<FileItem[]> {
  const response = await fetch(`${API_BASE_URL}/v1/files`, {
    headers: { Accept: 'application/json' }, credentials: 'include',
  });
  if (!response.ok) await throwApiError(response, 'Unable to load files');
  const data = await response.json() as FileListResponse;
  if (!data.success || !Array.isArray(data.files)) throw new Error('Malformed file list response');
  return data.files;
}

export async function uploadFileService(file: File, expiry: string = '48 hours'):
  Promise<{ file: FileItem; isLive: boolean }> {
  const formData = new FormData();
  formData.append('file', file); formData.append('expiry', expiry);
  const response = await fetch(`${API_BASE_URL}/v1/files/upload`, {
    method: 'POST', body: formData, credentials: 'include',
  });
  if (!response.ok) await throwApiError(response, 'Upload failed');
  const data = await response.json() as UploadResponse;
  if (!data.success || !data.file) throw new Error('Malformed upload response');
  return { file: data.file, isLive: true };
}

export async function deleteFileService(id: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/v1/files/${id}`, {
    method: 'DELETE', credentials: 'include',
  });
  if (!response.ok) await throwApiError(response, 'Delete failed');
  return true;
}
