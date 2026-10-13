import type {
  UploadResponse,
  FileListResponse,
  FileDetailResponse,
  FileDeleteResponse,
  NoteListResponse,
  NoteResponse,
  NoteDeleteResponse,
  ApiErrorResponse,
  MailItem,
  MailMessage,
  MailListResponse,
  MailResponse,
  MailDeleteResponse,
  MailSendRequest,
  MailQuote,
  MailSendResponse,
  SentMailItem,
  SentMailMessage,
  SentMailListResponse,
  SentMailResponse,
} from '@rachg/shared';
import PostalMime from 'postal-mime';
import {
  ensureSchema,
  insertFileRecord,
  getFileRecordById,
  listActiveFiles,
  incrementDownloadCount,
  markFileDeleted,
  mapRecordToFileItem,
  type FileRecord,
  insertNoteRecord,
  getNoteRecordById,
  listNotes,
  updateNoteRecord,
  deleteNoteRecord,
  mapRecordToNoteItem,
  listMailRecords,
  getMailRecord,
  deleteMailRecord,
  insertSentMailRecord,
  updateSentMailStatus,
  listSentMailRecords,
  getSentMailRecord,
  type MailRecord,
  type SentMailRecord,
} from './db';
import { buildR2Key, uploadToR2, getFromR2, headFromR2, deleteFromR2, getMailObject, deleteMailObject } from './storage';
import { checkStorageQuota, getActiveStorageUsage } from './quota';
import { isAuthenticated, resolveAuth } from './auth';
import { getFileExpiry, isFileExpired } from './expiry';
import { cleanupStorage } from './cleanup';
import { parseByteRange } from './download';
import { textShareResponse } from './text-share';
import { cleanupNoteShares, manageNoteShare, publicNoteShare } from './note-shares';
import { publicShareHeaders } from './note-share-page';
import { formatOutgoingMail } from './mail-format';
import { routeProjects } from './projects';
import { routeNoteTransfer } from './note-transfer';
import { boundedForm, boundedJson, InputError, mailPlainText, MAX_FILE_BYTES, MAX_MAIL_BYTES, MAX_TEXT_BYTES, readBounded, utf8Size } from '../../common/content';

export interface Env {
  PUBLIC_NOTE_SHARES_ENABLED?: string;
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  MAX_STORAGE_BYTES?: string; // Default 4GB (4294967296)
  ALLOWED_ORIGINS?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  ACCESS_ADMIN_EMAIL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
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
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
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

function mapMailItem(record: MailRecord): MailItem {
  return {
    id: record.id,
    from: record.from_address,
    to: record.to_address,
    subject: record.subject,
    receivedAt: record.received_at,
    preview: record.preview,
  };
}

function mapSentMailItem(record: SentMailRecord): SentMailItem {
  return {
    id: record.id,
    resendId: record.resend_id,
    to: record.to_address,
    subject: record.subject,
    sentAt: record.sent_at,
    preview: record.preview,
    status: record.status,
  };
}

function htmlToPlainText(html: string): string {
  return mailPlainText(html);
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function parseMailSendPayload(request: Request): Promise<MailSendRequest | null> {
  const body = await boundedJson(request);
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.to !== 'string' || typeof candidate.subject !== 'string' || typeof candidate.text !== 'string') return null;
  const to = candidate.to.trim();
  const subject = candidate.subject.trim();
  const text = candidate.text;
  if (!isEmailAddress(to) || to.length > 254 || !subject || subject.length > 200 || /[\r\n]/.test(subject) || !text.trim() || utf8Size(text) > MAX_TEXT_BYTES) return null;
  const inReplyTo = typeof candidate.inReplyTo === 'string' ? candidate.inReplyTo.trim() : undefined;
  const references = typeof candidate.references === 'string' ? candidate.references.trim() : undefined;
  if ((inReplyTo && (inReplyTo.length > 998 || /[\r\n]/.test(inReplyTo))) ||
      (references && (references.length > 4000 || /[\r\n]/.test(references)))) return null;
  let quote: MailQuote | undefined;
  if (candidate.quote !== undefined) {
    if (!candidate.quote || typeof candidate.quote !== 'object' || Array.isArray(candidate.quote)) return null;
    const value = candidate.quote as Record<string, unknown>;
    if (typeof value.from !== 'string' || !value.from.trim() || value.from.length > 320 || /[\r\n]/.test(value.from) ||
        typeof value.subject !== 'string' || value.subject.length > 200 || /[\r\n]/.test(value.subject) ||
        typeof value.text !== 'string' || utf8Size(value.text) > 200_000 ||
        typeof value.receivedAt !== 'number' || !Number.isSafeInteger(value.receivedAt) || value.receivedAt < 0 || value.receivedAt > 8_640_000_000_000_000) return null;
    quote = { from: value.from.trim(), subject: value.subject, receivedAt: value.receivedAt, text: value.text };
  }
  return { to, subject, text, inReplyTo, references, quote };
}

interface NotePayload {
  title: string;
  content: string;
}

async function parseNotePayload(request: Request): Promise<NotePayload | null> {
  const body = await boundedJson(request);
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.title !== 'string' || typeof candidate.content !== 'string') return null;

  const title = candidate.title.trim();
  const content = candidate.content;
  if (!title || title.length > 200 || utf8Size(content) > MAX_TEXT_BYTES) return null;
  return { title, content };
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
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      });
    }

    try {
      // Access may bypass ONLY /s/*. All other routes retain administrator auth.
      if (url.pathname.startsWith('/s/')) {
        try {
          return await publicNoteShare(request, env.DB, env.PUBLIC_NOTE_SHARES_ENABLED === 'true', origin);
        } catch {
          return new Response('This note link is temporarily unavailable.', { status: 503, headers: publicShareHeaders() });
        }
      }
      const auth = await resolveAuth(request, env);
      if (!isAuthenticated(auth)) {
        return jsonResponse<ApiErrorResponse>(
          { success: false, error: 'Authentication required', code: 'UNAUTHORIZED', status: 401 },
          401,
          origin
        );
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        const source = request.headers.get('Origin');
        const allowed = (env.ALLOWED_ORIGINS || 'https://rachg.com').split(',').map((value) => value.trim());
        if (source && source !== url.origin && !allowed.includes(source)) {
          return jsonResponse<ApiErrorResponse>({ success: false, error: 'Request origin is not allowed', code: 'INVALID_ORIGIN', status: 403 }, 403, origin);
        }
      }
      // -------------------------------------------------------------
      // Health check & Service status
      // -------------------------------------------------------------
      if (request.method === 'GET' && url.pathname === '/auth/return') {
        // Access has established the API-domain cookie before this authenticated
        // navigation reaches us. Return only to the fixed workspace origin.
        return new Response(null, { status: 302, headers: {
          Location: 'https://rachg.com/', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
        } });
      }
      if (url.pathname === '/v1/projects' || url.pathname.startsWith('/v1/projects/')) {
        const result = await routeProjects(request, env.DB);
        return jsonResponse(result.body, result.status, origin);
      }
      if (url.pathname === '/' || url.pathname === '/health') {
        await ensureSchema(env.DB);
        const usage = await getActiveStorageUsage(env.DB);
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
      // Routes: private Markdown notes (D1)
      // -------------------------------------------------------------
      if (url.pathname === '/v1/notes/export' || url.pathname === '/v1/notes/import') {
        return jsonResponse(await routeNoteTransfer(request, env.DB), 200, origin);
      }
      const noteDetailMatch = url.pathname.match(/^\/v1\/notes\/([a-zA-Z0-9_-]+)$/);
      const noteShareMatch = url.pathname.match(/^\/v1\/notes\/([a-zA-Z0-9_-]+)\/share$/);
      if (noteShareMatch) {
        const result = await manageNoteShare(request, env.DB, noteShareMatch[1], baseUrl, env.PUBLIC_NOTE_SHARES_ENABLED === 'true');
        return jsonResponse(result, request.method === 'POST' ? 201 : 200, origin);
      }
      const mailDetailMatch = url.pathname.match(/^\/v1\/mail\/([a-zA-Z0-9_-]+)$/);

      // Text shares reuse a normal file and its permissions, expiry, quota and deletion.
      const textShareMatch = url.pathname.match(/^\/t\/([a-zA-Z0-9_-]+)$/);
      if (request.method === 'GET' && textShareMatch) {
        const record = await getFileRecordById(env.DB, textShareMatch[1]);
        if (!record || record.status === 'deleted' || record.status === 'uploading') throw new InputError('Text share not found', 404);
        if (record.status !== 'active' || isFileExpired(record.expires_at)) throw new InputError('This text share has expired', 410);
        if (record.mime_type.split(';')[0].trim().toLowerCase() !== 'text/plain') throw new InputError('This file is not a plain text share', 415);
        if (record.size_bytes > 200_000) throw new InputError('Text share pages support up to 200 KB', 413);
        const object = await getFromR2(env.FILES_BUCKET, record.r2_key);
        if (!object) throw new InputError('Text share not found', 404);
        const bytes = await readBounded(new Response(object.body).body, 200_000);
        return textShareResponse(record.filename, new TextDecoder().decode(bytes), record.id);
      }

      if (request.method === 'POST' && url.pathname === '/v1/mail/send') {
        const payload = await parseMailSendPayload(request);
        if (!payload) {
          return jsonResponse<ApiErrorResponse>({ success: false, error: 'A valid recipient, subject, and message are required', code: 'INVALID_MAIL', status: 400 }, 400, origin);
        }
        if (!env.RESEND_API_KEY) {
          return jsonResponse<ApiErrorResponse>({ success: false, error: 'Mail sending is not configured', code: 'MAIL_NOT_CONFIGURED', status: 503 }, 503, origin);
        }
        const formatted = formatOutgoingMail(payload.text, payload.quote);
        if (utf8Size(formatted.text) > MAX_TEXT_BYTES) {
          return jsonResponse<ApiErrorResponse>({ success: false, error: 'The reply and quoted message are too large. Remove the quote or shorten your message.', code: 'INVALID_MAIL', status: 400 }, 400, origin);
        }
        const id = generateCode(24);
        const sentAt = Date.now();
        await insertSentMailRecord(env.DB, {
          id,
          resend_id: null,
          to_address: payload.to,
          subject: payload.subject,
          text: formatted.text,
          sent_at: sentAt,
          preview: payload.text.replace(/\s+/g, ' ').trim().slice(0, 240),
          status: 'sending',
          in_reply_to: payload.inReplyTo ?? null,
          references_header: payload.references ?? payload.inReplyTo ?? null,
        });
        try {
          const mailHeaders: Record<string, string> = {};
          if (payload.inReplyTo) mailHeaders['In-Reply-To'] = payload.inReplyTo;
          const references = payload.references || payload.inReplyTo;
          if (references) mailHeaders.References = references;
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            signal: AbortSignal.timeout(15_000),
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              from: env.RESEND_FROM_EMAIL || 'me@rachg.com',
              to: [payload.to],
              subject: payload.subject,
              text: formatted.text,
              html: formatted.html,
              ...(Object.keys(mailHeaders).length ? { headers: mailHeaders } : {}),
            }),
          });
          const resendBody = await resendResponse.json().catch(() => null) as { id?: string; message?: string } | null;
          if (!resendResponse.ok || typeof resendBody?.id !== 'string' || !resendBody.id) {
            console.error('Resend send failed:', resendResponse.status, resendBody?.message || 'Unknown error');
            const definiteRejection = resendResponse.status >= 400 && resendResponse.status < 500 && resendResponse.status !== 408;
            await updateSentMailStatus(env.DB, id, definiteRejection ? 'failed' : 'unknown', null);
            return jsonResponse<ApiErrorResponse>({ success: false, error: definiteRejection ? 'The mail provider rejected the message.' : 'Delivery could not be confirmed. Check the provider before sending this message again.', code: definiteRejection ? 'MAIL_SEND_FAILED' : 'MAIL_STATUS_UNKNOWN', status: 502 }, 502, origin);
          }
          try {
            await updateSentMailStatus(env.DB, id, 'sent', resendBody.id);
          } catch {
            // An accepted message must not be relabelled as failed merely because
            // the database is unavailable. Only retry the status write, never send.
            const providerId = resendBody.id;
            console.error('Accepted mail status needs reconciliation', { id, providerId });
            ctx.waitUntil(updateSentMailStatus(env.DB, id, 'sent', providerId).catch(() => {
              console.error('Accepted mail status remains pending', { id, providerId });
            }));
          }
          return jsonResponse<MailSendResponse>({ success: true, id, resendId: resendBody.id }, 200, origin);
        } catch (error) {
          await updateSentMailStatus(env.DB, id, 'unknown', null).catch(() => {});
          console.error('Resend send request failed:', error);
          return jsonResponse<ApiErrorResponse>({ success: false, error: 'Delivery could not be confirmed. Check the provider before sending this message again.', code: 'MAIL_STATUS_UNKNOWN', status: 502 }, 502, origin);
        }
      }

      if (request.method === 'GET' && url.pathname === '/v1/mail/sent') {
        const records = await listSentMailRecords(env.DB);
        return jsonResponse<SentMailListResponse>({ success: true, messages: records.map(mapSentMailItem) }, 200, origin);
      }

      const sentMailDetailMatch = url.pathname.match(/^\/v1\/mail\/sent\/([a-zA-Z0-9_-]+)$/);
      if (request.method === 'GET' && sentMailDetailMatch) {
        const record = await getSentMailRecord(env.DB, sentMailDetailMatch[1]);
        if (!record) return jsonResponse<ApiErrorResponse>({ success: false, error: 'Sent email not found', code: 'NOT_FOUND', status: 404 }, 404, origin);
        const message: SentMailMessage = {
          ...mapSentMailItem(record),
          text: record.text,
          inReplyTo: record.in_reply_to ?? undefined,
          references: record.references_header ?? undefined,
        };
        return jsonResponse<SentMailResponse>({ success: true, message }, 200, origin);
      }

      if (request.method === 'GET' && url.pathname === '/v1/mail') {
        const records = await listMailRecords(env.DB);
        return jsonResponse<MailListResponse>({ success: true, messages: records.map(mapMailItem) }, 200, origin);
      }

      if (request.method === 'GET' && mailDetailMatch) {
        const record = await getMailRecord(env.DB, mailDetailMatch[1]);
        if (!record) return jsonResponse<ApiErrorResponse>({ success: false, error: 'Email not found', code: 'NOT_FOUND', status: 404 }, 404, origin);
        const object = await getMailObject(env.FILES_BUCKET, record.r2_key);
        if (!object) return jsonResponse<ApiErrorResponse>({ success: false, error: 'Email content is missing', code: 'NOT_FOUND', status: 404 }, 404, origin);
        if (object.size > MAX_MAIL_BYTES) throw new InputError('This message exceeds the 5 MiB preview limit', 413);
        const parsed = await PostalMime.parse(await object.arrayBuffer());
        const item = mapMailItem(record);
        const message: MailMessage = {
          ...item,
          from: parsed.from?.address || item.from,
          replyTo: parsed.replyTo?.find((address) => address.address && isEmailAddress(address.address))?.address || parsed.from?.address || item.from,
          text: parsed.text?.trim() || htmlToPlainText(parsed.html || ''),
          messageId: parsed.messageId,
          references: parsed.references,
        };
        return jsonResponse<MailResponse>({ success: true, message }, 200, origin);
      }

      if (request.method === 'DELETE' && mailDetailMatch) {
        const record = await getMailRecord(env.DB, mailDetailMatch[1]);
        if (!record) return jsonResponse<ApiErrorResponse>({ success: false, error: 'Email not found', code: 'NOT_FOUND', status: 404 }, 404, origin);
        await deleteMailObject(env.FILES_BUCKET, record.r2_key);
        await deleteMailRecord(env.DB, record.id);
        return jsonResponse<MailDeleteResponse>({ success: true, message: 'Email deleted', id: record.id }, 200, origin);
      }

      if (request.method === 'POST' && url.pathname === '/v1/notes') {
        const payload = await parseNotePayload(request);
        if (!payload) {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'A title and Markdown content are required', code: 'INVALID_NOTE', status: 400 },
            400,
            origin
          );
        }

        const now = Date.now();
        const record = {
          id: `note-${now}-${generateCode(6)}`,
          title: payload.title,
          content: payload.content,
          created_at: now,
          updated_at: now,
        };
        await insertNoteRecord(env.DB, record);
        return jsonResponse<NoteResponse>(
          { success: true, note: mapRecordToNoteItem(record) },
          201,
          origin
        );
      }

      if (request.method === 'GET' && url.pathname === '/v1/notes') {
        const records = await listNotes(env.DB);
        return jsonResponse<NoteListResponse>(
          { success: true, notes: records.map(mapRecordToNoteItem) },
          200,
          origin
        );
      }

      if (request.method === 'GET' && noteDetailMatch) {
        const record = await getNoteRecordById(env.DB, noteDetailMatch[1]);
        if (!record) {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'Note not found', code: 'NOT_FOUND', status: 404 },
            404,
            origin
          );
        }
        return jsonResponse<NoteResponse>(
          { success: true, note: mapRecordToNoteItem(record) },
          200,
          origin
        );
      }

      if (request.method === 'PUT' && noteDetailMatch) {
        const payload = await parseNotePayload(request);
        if (!payload) {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'A title and Markdown content are required', code: 'INVALID_NOTE', status: 400 },
            400,
            origin
          );
        }

        const record = await updateNoteRecord(
          env.DB,
          noteDetailMatch[1],
          payload.title,
          payload.content,
          Date.now()
        );
        if (!record) {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'Note not found', code: 'NOT_FOUND', status: 404 },
            404,
            origin
          );
        }
        return jsonResponse<NoteResponse>(
          { success: true, note: mapRecordToNoteItem(record) },
          200,
          origin
        );
      }

      if (request.method === 'DELETE' && noteDetailMatch) {
        const deleted = await deleteNoteRecord(env.DB, noteDetailMatch[1]);
        if (!deleted) {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'Note not found', code: 'NOT_FOUND', status: 404 },
            404,
            origin
          );
        }
        return jsonResponse<NoteDeleteResponse>(
          { success: true, message: 'Note deleted successfully', id: noteDetailMatch[1] },
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
          const formData = await boundedForm(request);
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
          if (sizeBytes > MAX_FILE_BYTES) throw new InputError('Files must be 10 MiB or smaller', 413);
          fileStream = fileObj.stream();
          expiryParam = (formData.get('expiry') as string) || expiryParam;
        } else {
          // Direct octet-stream upload
          filename = request.headers.get('x-filename') || 'uploaded-file';
          mimeType = contentType || 'application/octet-stream';
          expiryParam = request.headers.get('x-expiry') || expiryParam;

          if (!request.body) {
            return jsonResponse<ApiErrorResponse>(
              { success: false, error: 'Empty request body', code: 'EMPTY_BODY', status: 400 },
              400,
              origin
            );
          }
          fileStream = await readBounded(request.body, MAX_FILE_BYTES);
          sizeBytes = fileStream.byteLength;
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
        if (!filename || filename.length > 240 || /[\x00-\x1f\x7f]/.test(filename)) throw new InputError('Invalid filename');
        const id = crypto.randomUUID();
        const deleteToken = generateCode(24);
        const r2Key = buildR2Key(id, filename);

        const now = Date.now();
        const expiresAt = getFileExpiry(expiryParam, now);

        // Reserve capacity with one atomic INSERT before writing any object.
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
          status: 'uploading',
        };

        if (!await insertFileRecord(env.DB, record, maxStorageLimit)) throw new InputError('Storage quota exceeded', 413);
        try {
          await uploadToR2(env.FILES_BUCKET, r2Key, fileStream, mimeType, { fileId: id, filename, deleteToken, expiresAt: expiresAt.toString() });
          const committed = await env.DB.prepare(`UPDATE files SET status = 'active' WHERE id = ? AND status = 'uploading'`).bind(id).run();
          if ((committed.meta?.changes ?? 0) === 0) {
            await deleteFromR2(env.FILES_BUCKET, r2Key);
            throw new Error('Upload reservation is no longer active');
          }
          record.status = 'active';
        } catch (error) {
          // A lost D1 response can follow a committed write. Leave the exact-key
          // reservation intact for cleanup rather than guessing that commit failed.
          console.error('Upload requires reconciliation', { id });
          throw error;
        }

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
        const totalSize = await getActiveStorageUsage(env.DB);

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

        if (!record || record.status === 'deleted' || record.status === 'uploading') {
          return jsonResponse<ApiErrorResponse>(
            { success: false, error: 'File not found', code: 'NOT_FOUND', status: 404 },
            404,
            origin
          );
        }

        if (record.status === 'expired' || record.status === 'purged' || record.status === 'purging' || isFileExpired(record.expires_at)) {
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
        await deleteFromR2(env.FILES_BUCKET, record.r2_key);

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
      if ((request.method === 'GET' || request.method === 'HEAD') && downloadMatch) {
        const id = downloadMatch[1];
        const record = await getFileRecordById(env.DB, id);

        if (!record || record.status === 'deleted' || record.status === 'uploading') {
          return new Response('File not found or has been revoked.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        if (record.status === 'expired' || record.status === 'purged' || record.status === 'purging' || isFileExpired(record.expires_at)) {
          return new Response('This shared file has expired and is no longer available.', {
            status: 410,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        let range: { offset: number; length: number } | undefined;
        const requestedRange = request.headers.get('Range');
        let head: R2Object | null = null;
        if (request.method === 'HEAD' || requestedRange) {
          head = await headFromR2(env.FILES_BUCKET, record.r2_key);
          if (!head) return new Response('File storage object missing.', { status: 404 });
          const ifRange = request.headers.get('If-Range');
          if (request.method === 'GET' && requestedRange && (!ifRange || ifRange === head.httpEtag)) {
            range = parseByteRange(requestedRange, head.size) ?? undefined;
            if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}`, 'Cache-Control': 'private, no-store' } });
          }
        }
        const r2Object = request.method === 'HEAD' ? head : await getFromR2(env.FILES_BUCKET, record.r2_key, range);
        if (!r2Object) {
          return new Response('File storage object missing.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        // Increment download counter asynchronously in ctx
        if (request.method === 'GET' && !range) ctx.waitUntil(incrementDownloadCount(env.DB, id));

        // Prepare streaming download headers
        const headers = new Headers();
        r2Object.writeHttpMetadata(headers);
        headers.set('Cache-Control', 'private, no-store');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Referrer-Policy', 'no-referrer');
        headers.set('etag', r2Object.httpEtag);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Content-Length', String(range?.length ?? r2Object.size));
        if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${r2Object.size}`);
        headers.set(
          'Content-Disposition',
          `attachment; filename="${record.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(record.filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`
        );
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Credentials', 'true');
        headers.set('Vary', 'Origin');

        return new Response(request.method === 'HEAD' ? null : (r2Object as R2ObjectBody).body, {
          status: range ? 206 : 200,
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
      if (err instanceof InputError) return jsonResponse<ApiErrorResponse>({ success: false, error: err.message, code: 'INVALID_INPUT', status: err.status }, err.status, origin);
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
          error: 'The service could not complete this request. Please retry.',
          code: 'INTERNAL_ERROR',
          status: 500,
        },
        500,
        origin
      );
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupStorage(env.DB, env.FILES_BUCKET));
    ctx.waitUntil(cleanupNoteShares(env.DB));
  },
};
