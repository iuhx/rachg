import type { FileItem, UploadResponse, FileListResponse } from '@rachg/shared';
import { INITIAL_TRANSFERS, INITIAL_FILES } from '../data/mockData';

// Worker API base URL (can be customized via import.meta.env.PUBLIC_FILE_SERVICE_URL)
const API_BASE_URL =
  import.meta.env.PUBLIC_FILE_SERVICE_URL || 'http://localhost:8787';

/**
 * Fetch active files from Cloudflare Worker API.
 * Gracefully falls back to local data if the Worker is not currently online.
 */
export async function fetchActiveFiles(): Promise<FileItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/files`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: FileListResponse = await res.json();
    if (data.success && Array.isArray(data.files)) {
      return data.files;
    }
    return INITIAL_TRANSFERS;
  } catch (err) {
    // Graceful offline fallback: use local state
    return INITIAL_TRANSFERS;
  }
}

/**
 * Upload a real file to Cloudflare Worker (R2 + D1).
 * Falls back to local creation if offline.
 */
export async function uploadFileService(
  file: File,
  expiry: string = '48 hours'
): Promise<{ file: FileItem; isLive: boolean }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('expiry', expiry);

    const res = await fetch(`${API_BASE_URL}/v1/files/upload`, {
      method: 'POST',
      body: formData,
    });

    if (res.status === 413) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Temporary storage quota (4GB) exceeded.');
    }

    if (!res.ok) {
      throw new Error(`Upload failed with HTTP ${res.status}`);
    }

    const data: UploadResponse = await res.json();
    if (data.success && data.file) {
      return { file: data.file, isLive: true };
    }
    throw new Error('Malformed upload response');
  } catch (err: any) {
    // If quota exceeded, rethrow real error
    if (err.message && err.message.includes('quota')) {
      throw err;
    }

    // Otherwise, graceful local demo fallback
    const id = `tr-${Date.now()}`;
    const code = Math.random().toString(36).substring(2, 8);
    const sizeStr =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const fallbackFile: FileItem = {
      id,
      name: file.name,
      size: sizeStr,
      sizeBytes: file.size,
      updatedAt: 'Just now',
      expiresIn: expiry,
      expiresTimestamp: Date.now() + 48 * 3600 * 1000,
      shareUrl: `https://rachg.fyi/d/${code}`,
      type: 'archive',
      downloads: 0,
      status: 'active',
    };

    return { file: fallbackFile, isLive: false };
  }
}

/**
 * Revoke/delete a file from Cloudflare Worker.
 */
export async function deleteFileService(id: string, deleteToken?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (deleteToken) {
      headers['X-Delete-Token'] = deleteToken;
    }

    const res = await fetch(`${API_BASE_URL}/v1/files/${id}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch (err) {
    return true; // Local optimistic delete
  }
}
