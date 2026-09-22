import type {
  UploadResponse,
  FileListResponse,
  FileDetailResponse,
  FileDeleteResponse,
  ApiErrorResponse,
} from '@rachg/shared';
import {
  ensureSchema,
  insertFileRecord,
  getFileRecordById,
  listActiveFiles,
  incrementDownloadCount,
  markFileDeleted,
  mapRecordToFileItem,
  type FileRecord,
} from './db';
import { buildR2Key, uploadToR2, getFromR2, deleteFromR2 } from './storage';
import { checkStorageQuota, getActiveStorageUsage } from './quota';
import { isAuthenticated, resolveAuth } from './auth';

export interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  MAX_STORAGE_BYTES?: string; // Default 4GB (4294967296)
  ALLOWED_ORIGINS?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  ACCESS_ADMIN_EMAIL?: string;
}

function getAllowedOrigin(request: Request, env: Env): string {
  const requestOrigin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || 'https://rachg.com')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : (allowed[0] || 'https://rachg.com');
}

function jsonResponse<T>(data: T, status: number = 200, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
    },
  });
}

function generateCode(length: number = 6): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let res = '';
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < length; i++) {
    res += chars[randomBytes[i] % chars.length];
  }
  return res;
}

function parseExpiryHours(str: string | null): number {
  if (!str) return 48; // default 48h
  const lower = str.toLowerCase();
  if (lower.includes('1 hour') || lower === '1h') return 1;
  if (lower.includes('24 hour') || lower === '24h' || lower === '1 day') return 24;
  if (lower.includes('48 hour') || lower === '48h' || lower === '2 days') return 48;
  if (lower.includes('7 day') || lower === '7d' || lower === '168h') return 168;
  const num = parseInt(str, 10);
  return isNaN(num) ? 48 : Math.max(1, Math.min(168, num));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = getAllowedOrigin(request, env);
    const baseUrl = `${url.protocol}//${url.host}`;
    const maxStorageLimit = parseInt(env.MAX_STORAGE_BYTES || '4294967296', 10);

    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }

    try {
      const auth = await resolveAuth(request, env);
      if (!isAuthenticated(auth)) {
        return jsonResponse<ApiErrorResponse>(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED', status: 401 },
          401,
          origin
        );
      }
      // -------------------------------------------------------------
      // Health check & Service status
      // -------------------------------------------------------------
      if (url.pathname === '/' || url.pathname === '/health') {
        await ensureSchema(env.DB);
        const usage = await getActiveStorageUsage(env.DB).catch(() => 0);
        return jsonResponse(
          {
            service: 'rachg-file-service',
            version: '1.0.0',
            status: 'healthy',
            schema: 'ready',
            quota: {
              usedBytes: usage,
              maxBytes: maxStorageLimit,
              availableBytes: Math.max(0, maxStorageLimit - usage),
            },
            timestamp: Date.now(),
          },
          200,
          origin
        );
      }

      // -------------------------------------------------------------
      // Route: POST /v1/files/upload
      // Supports multipart/form-data or binary stream
      // -------------------------------------------------------------
      if (request.method === 'POST' && url.pathname === '/v1/files/upload') {
        const contentType = request.headers.get('content-type') || '';

        let fileStream: ReadableStream | ArrayBuffer;
        let filename = 'untitled-file';
        let mimeType = 'application/octet-stream';
        let sizeBytes = 0;
        let expiryParam = '48 hours';

        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const formFile = formData.get('file');
          if (!formFile || typeof formFile === 'string') {
            return jsonResponse<ApiErrorResponse>(
              { success: false, error: 'No file provided in form-data field "file"', code: 'MISSING_FILE', status: 400 },
              400,
              origin
            );
          }
          const fileObj = formFile as unknown as File;
          filename = fileObj.name || 'uploaded-file';
          mimeType = fileObj.type || 'application/octet-stream';
          sizeBytes = fileObj.size;
          fileStream = fileObj.stream();
          expiryParam = (formData.get('expiry') as string) || expiryParam;
        } else {
          // Direct octet-stream upload
          filename = request.headers.get('x-filename') || 'uploaded-file';
          mimeType = contentType || 'application/octet-stream';
          const contentLength = request.headers.get('content-length');
          sizeBytes = contentLength ? parseInt(contentLength, 10) : 0;
          expiryParam = request.headers.get('x-expiry') || expiryParam;

          if (!request.body) {
            return jsonResponse<ApiErrorResponse>(
              { success: false, error: 'Empty request body', code: 'EMPTY_BODY', status: 400 },
              400,
              origin
            );
          }
          fileStream = request.body;
        }

        // 4GB Quota check
        const quota = await checkStorageQuota(env.DB, sizeBytes, maxStorageLimit);
        if (!quota.allowed) {
          return jsonResponse<ApiErrorResponse>(
            {
              success: false,
              error: `Storage quota exceeded. Max allowed is 4GB (used: ${(quota.currentTotal / (1024 * 1024)).toFixed(1)}MB, requested: ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB). Please delete existing files or wait for expiration.`,
              code: 'QUOTA_EXCEEDED',
              status: 413,
            },
            413,
            origin
          );
        }

        // Generate identifiers
        const id = generateCode(6);
        const deleteToken = generateCode(24);
        const r2Key = buildR2Key(id, filename);

        const now = Date.now();
        const expiryHours = parseExpiryHours(expiryParam);
        const expiresAt = now + expiryHours * 3600 * 1000;

        // 1. Upload to R2 under transfers/ prefix
        await uploadToR2(env.FILES_BUCKET, r2Key, fileStream, mimeType, {
          fileId: id,
          filename,
          deleteToken,
          expiresAt: expiresAt.toString(),
        });

        // 2. Insert metadata into D1
        const record: FileRecord = {
          id,
          filename,
          size_bytes: sizeBytes,
          mime_type: mimeType,
          r2_key: r2Key,
          created_at: now,
          expires_at: expiresAt,
          download_count: 0,
          delete_token: deleteToken,
          owner_id: auth.userId || null,
          status: 'active',
        };

        await insertFileRecord(env.DB, record);

        const fileItem = mapRecordToFileItem(record, baseUrl);

        return jsonResponse<UploadResponse>(
          {
            success: true,
            file: fileItem,
            shareUrl: fileItem.shareUrl || `${baseUrl}/f/${id}`,
          },
          201,
          origin
        );
      }

      // -------------------------------------------------------------
      // Route: GET /v1/files (List active non-expired files)
      // -------------------------------------------------------------
      if (request.method === 'GET' && url.pathname === '/v1/files') {
        const records = await listActiveFiles(env.DB);
        const files = records.map((r) => mapRecordToFileItem(r, baseUrl));
        const totalSize = records.reduce((acc, r) => acc + r.size_bytes, 0);

        return jsonResponse<FileListResponse>(
          {
            success: true,
            files,
            totalSizeBytes: totalSize,
            maxSizeBytes: maxStorageLimit,
            usagePercent: Math.min(100, (totalSize / maxStorageLimit) * 100),
          },
          200,
          origin
        );
      }

      // -------------------------------------------------------------
      // Route: GET /v1/files/:id (Get file metadata)
      // -------------------------------------------------------------
      const v1FileDetailMatch = url.pathname.match(/^\/v1\/files\/([a-zA-Z0-9_-]+)$/);
      if (request.method === 'GET' && v1FileDetailMatch) {
        const id = v1FileDetailMatch[1];
        const record = await getFileRecordById(env.DB, id);

        if (!record || record.status === 'deleted') {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'File not found', code: 'NOT_FOUND', status: 404 },
            404,
            origin
          );
        }

        if (record.status === 'expired' || record.expires_at <= Date.now()) {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'File has expired', code: 'EXPIRED', status: 410 },
            410,
            origin
          );
        }

        return jsonResponse<FileDetailResponse>(
          {
            success: true,
            file: mapRecordToFileItem(record, baseUrl),
          },
          200,
          origin
        );
      }

      // -------------------------------------------------------------
      // Route: DELETE /v1/files/:id (Delete/Revoke file)
      // Requires a verified Cloudflare Access administrator identity
      // -------------------------------------------------------------
      if (request.method === 'DELETE' && v1FileDetailMatch) {
        const id = v1FileDetailMatch[1];
        const record = await getFileRecordById(env.DB, id);

        if (!record || record.status === 'deleted') {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'File not found', code: 'NOT_FOUND', status: 404 },
            404,
            origin
          );
        }

        // Delete from R2 (transfers/ prefix only)
        await deleteFromR2(env.FILES_BUCKET, record.r2_key).catch(() => {});

        // Mark deleted in D1
        await markFileDeleted(env.DB, id);

        return jsonResponse<FileDeleteResponse>(
          {
            success: true,
            message: 'File deleted successfully',
            id,
          },
          200,
          origin
        );
      }

      // -------------------------------------------------------------
      // Route: GET /f/:id (Clean download link for users)
      // Streams file from R2 directly with download header
      // -------------------------------------------------------------
      const downloadMatch = url.pathname.match(/^\/f\/([a-zA-Z0-9_-]+)$/);
      if (request.method === 'GET' && downloadMatch) {
        const id = downloadMatch[1];
        const record = await getFileRecordById(env.DB, id);

        if (!record || record.status === 'deleted') {
          return new Response('File not found or has been revoked.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        if (record.status === 'expired' || record.expires_at <= Date.now()) {
          return new Response('This shared file has expired and is no longer available.', {
            status: 410,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        // Fetch from R2
        const r2Object = await getFromR2(env.FILES_BUCKET, record.r2_key);
        if (!r2Object) {
          return new Response('File storage object missing.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        // Increment download counter asynchronously in ctx
        ctx.waitUntil(incrementDownloadCount(env.DB, id));

        // Prepare streaming download headers
        const headers = new Headers();
        r2Object.writeHttpMetadata(headers);
        headers.set('etag', r2Object.httpEtag);
        headers.set(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(record.filename)}"`
        );
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Credentials', 'true');
        headers.set('Vary', 'Origin');

        return new Response(r2Object.body, {
          status: 200,
          headers,
        });
      }

      // Unmatched route
      return jsonResponse<ApiErrorResponse>(
        { success: false, error: 'Endpoint not found', code: 'NOT_FOUND', status: 404 },
        404,
        origin
      );
    } catch (err: any) {
      console.error('File service error:', err);
      if (err?.message?.includes('Access JWT') || err?.message?.includes('Cloudflare Access')) {
        return jsonResponse<ApiErrorResponse>(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED', status: 401 },
          401,
          origin
        );
      }
      return jsonResponse<ApiErrorResponse>(
        {
          success: false,
          error: err?.message || 'Internal Server Error',
          code: 'INTERNAL_ERROR',
          status: 500,
        },
        500,
        origin
      );
    }
  },
};
