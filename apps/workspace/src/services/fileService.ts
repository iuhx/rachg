import type { FileItem, UploadResponse, FileListResponse, ApiErrorResponse } from '../types';
import { FILE_UPLOAD_BYTES, type StorageBackend } from '@rachg/shared';

import { API_BASE_URL } from '../config/api';
import { AuthenticationRequiredError, readApiJson } from './apiRead';
export { AuthenticationRequiredError } from './apiRead';

async function throwApiError(response: Response, fallback: string): Promise<never> {
  if (response.status === 401) throw new AuthenticationRequiredError();
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(body?.error || `${fallback} (HTTP ${response.status})`);
}

export async function fetchActiveFiles(): Promise<FileItem[]> {
  const data = await readApiJson<FileListResponse>(`${API_BASE_URL}/v1/files`, 'files');
  if (!data.success || !Array.isArray(data.files)) throw new Error('Malformed file list response');
  return data.files;
}

export async function uploadFileService(file: File, expiry: string = '48 hours', storageBackend: StorageBackend = 'r2'):
  Promise<{ file: FileItem; isLive: boolean }> {
  if (file.size > FILE_UPLOAD_BYTES) throw new Error('Files must be 99 MB or smaller.');
  const params = new URLSearchParams({ size: String(file.size), filename: file.name, expiry, storageBackend, mime: file.type || 'application/octet-stream' });
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/v1/files/upload?${params}`, {
      // A simple content type avoids an Access preflight. Actual MIME is metadata.
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: file, credentials: 'include',
    });
  } catch {
    throw new AuthenticationRequiredError();
  }
  if (!response.ok) await throwApiError(response, 'Upload failed');
  const data = await response.json() as UploadResponse;
  if (!data.success || !data.file) throw new Error('Malformed upload response');
  return { file: data.file, isLive: true };
}

export async function deleteFileService(id: string, deleteRemote = false): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/v1/files/${encodeURIComponent(id)}${deleteRemote === true ? '?deleteRemote=true' : ''}`, {
      method: 'DELETE', credentials: 'include',
    });
  } catch {
    throw new AuthenticationRequiredError();
  }
  if (!response.ok) await throwApiError(response, 'Delete failed');
  return true;
}
