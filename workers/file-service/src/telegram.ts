import { ensureSchema } from './db';
import { StoredFiles, buildWebdavKey } from './stored-files';
import { WebdavConflict, type WebdavEnv } from './webdav';
import { storeStream } from './file-streams';
import { InputError, MAX_TEXT_BYTES, readBounded, utf8Size } from '../../common/content';
import { isTelegramWebhook, telegramApi, telegramConfig, telegramFile, TelegramError, TELEGRAM_FILE_BYTES, TELEGRAM_WEBHOOK_URL, webhookSecret, type TelegramEnv } from './telegram-client';

export type TelegramStorageEnv = TelegramEnv & WebdavEnv & { DB: D1Database; FILES_BUCKET: R2Bucket };
type Source = { kind: 'image' | 'markdown' | 'notice'; fileId: string; filename: string; mime: string; notice: string };
interface Job {
  id: string; bot_id: string; chat_id: number; message_id: number; source: string; target_id: string;
  status: 'pending' | 'processing' | 'done' | 'failed'; attempts: number; lease_token: string | null;
  result_text: string | null; receipt_status: string;
}
const HELP = '发送图片，我会永久保存到 Files（WebDAV）；发送 .md 文件，我会将正文保存到 Notes，文件名作为标题。图片最大 20MB，笔记正文最大 1MB。';
const ready = new WeakMap<D1Database, Promise<void>>();
const LEASE_MS = 600_000;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function ensureTelegramSchema(db: D1Database) {
  let pending = ready.get(db);
  if (!pending) {
    pending = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS telegram_jobs (
        id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL,
        source TEXT NOT NULL, target_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
        result_text TEXT, receipt_status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_telegram_pending ON telegram_jobs(status, next_attempt_at, lease_until)'),
      db.prepare('CREATE TABLE IF NOT EXISTS telegram_config (id TEXT PRIMARY KEY, fingerprint TEXT, registered_at INTEGER, last_error TEXT)'),
    ]).then(() => {}).catch(error => { ready.delete(db); throw error; });
    ready.set(db, pending);
  }
  return pending;
}

function sourceFor(message: Record<string, unknown>): Source {
  const notice = (text: string): Source => ({ kind: 'notice', notice: text, fileId: '', filename: '', mime: '' });
  let media: Record<string, unknown>, filename: string, mime: string, kind: Source['kind'];
  if (Array.isArray(message.photo) && message.photo.length && message.photo.length <= 20) {
    media = message.photo.map(object).reduce((best, candidate) => Number(candidate.width) * Number(candidate.height) > Number(best.width || 0) * Number(best.height || 0) ? candidate : best, {});
    filename = `telegram-${message.message_id}.jpg`; mime = 'image/jpeg'; kind = 'image';
  } else {
    media = object(message.document);
    filename = typeof media.file_name === 'string' ? media.file_name : '';
    if (!filename || filename.length > 240 || /[\x00-\x1f\x7f/\\]/.test(filename)) return notice(HELP);
    const extension = filename.split('.').pop()?.toLowerCase();
    const imageTypes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff' };
    if (extension === 'md' || extension === 'markdown') { kind = 'markdown'; mime = 'text/markdown'; }
    else if (extension && imageTypes[extension]) { kind = 'image'; mime = imageTypes[extension]; }
    else return notice(HELP);
  }
  if (typeof media.file_id !== 'string' || !/^[\w-]{1,512}$/.test(media.file_id)) return notice('无法读取这份文件，请重新发送。');
  const maximum = kind === 'markdown' ? MAX_TEXT_BYTES : TELEGRAM_FILE_BYTES;
  if (media.file_size !== undefined && (!positiveId(media.file_size) || media.file_size > maximum)) return notice(kind === 'markdown' ? 'Markdown 文件超过笔记的 1MB 限制，请缩小后再发送。' : '图片超过 20MB，请通过工作台网页上传。');
  return { kind, filename, mime, fileId: media.file_id, notice: '' };
}

/** This exact route has its own authentication; it never grants access to workspace APIs. */
export async function receiveTelegram(request: Request, env: TelegramStorageEnv, ctx: ExecutionContext): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' };
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
  if (!await isTelegramWebhook(request, env)) return new Response('Unauthorized', { status: 401, headers });
  try {
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return new Response('Expected JSON', { status: 415, headers });
    const update = object(JSON.parse(new TextDecoder().decode(await readBounded(request.body, 64_000))));
    const message = object(update.message), sender = object(message.from), chat = object(message.chat), config = telegramConfig(env)!;
    // Ignore edited messages, groups, channels, bots and anyone outside the numeric allowlist.
    if (typeof update.update_id !== 'number' || !Number.isSafeInteger(update.update_id) || update.update_id < 0 || !positiveId(message.message_id) || sender.id !== config.userId || sender.is_bot !== false || chat.type !== 'private' || chat.id !== config.userId) return new Response('OK', { headers });
    await ensureTelegramSchema(env.DB);
    const id = `${config.botId}:${config.userId}:${message.message_id}`, now = Date.now();
    await env.DB.prepare(`INSERT OR IGNORE INTO telegram_jobs (id, bot_id, chat_id, message_id, source, target_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, config.botId, config.userId, message.message_id, JSON.stringify(sourceFor(message)), crypto.randomUUID(), now, now).run();
    // The durable row exists before acknowledging Telegram. Cron recovers interrupted work.
    ctx.waitUntil(processTelegramJob(id, env).catch(() => console.error('Telegram job deferred', { id })));
    return new Response('OK', { headers });
  } catch (error) {
    return new Response(error instanceof SyntaxError ? 'Invalid JSON' : 'Please retry', { status: error instanceof InputError ? error.status : error instanceof SyntaxError ? 400 : 503, headers });
  }
}

async function finishNotice(env: TelegramStorageEnv, job: Job, token: string, text: string, failed = false) {
  await env.DB.prepare(`UPDATE telegram_jobs SET status = ?, result_text = ?, lease_token = NULL, lease_until = 0, updated_at = ?
    WHERE id = ? AND status = 'processing' AND lease_token = ?`).bind(failed ? 'failed' : 'done', text, Date.now(), job.id, token).run();
}

async function saveMarkdown(env: TelegramStorageEnv, job: Job, token: string, source: Source, botToken: string) {
  const file = await telegramFile(botToken, source.fileId, MAX_TEXT_BYTES);
  const data = new Uint8Array(await readBounded(file.body, MAX_TEXT_BYTES));
  if (data.length !== file.size) throw new TelegramError('文件下载不完整，请重试。');
  const encoding = data[0] === 255 && data[1] === 254 ? 'utf-16le' : data[0] === 254 && data[1] === 255 ? 'utf-16be' : 'utf-8';
  let content: string;
  try { content = new TextDecoder(encoding, { fatal: true, ignoreBOM: false }).decode(data); }
  catch { throw new TelegramError('请将 Markdown 保存为 UTF-8 或带 BOM 的 UTF-16 编码后重新发送。', false); }
  if (!content.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content)) throw new TelegramError('文件中没有有效的 Markdown 正文。', false);
  if (utf8Size(content) > MAX_TEXT_BYTES) throw new TelegramError('Markdown 正文超过 1MB，请缩小后再发送。', false);
  const title = source.filename.replace(/\.(md|markdown)$/i, '').trim().slice(0, 200).replace(/[\uD800-\uDBFF]$/, '') || 'Telegram note';
  const noteId = `telegram-${job.target_id}`, now = Date.now();
  await ensureSchema(env.DB);
  // One transaction couples the note and the receipt. Retries never overwrite an edited note.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO notes (id, title, content, created_at, updated_at)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM telegram_jobs WHERE id = ? AND status = 'processing' AND lease_token = ?)`)
      .bind(noteId, title, content, now, now, job.id, token),
    env.DB.prepare(`INSERT INTO note_organization (note_id, category_id, pinned, revision)
      SELECT ?, NULL, 0, 1 WHERE changes() > 0`).bind(noteId),
    env.DB.prepare(`UPDATE telegram_jobs SET status = 'done', result_text = ?, lease_token = NULL, lease_until = 0, updated_at = ?
      WHERE id = ? AND status = 'processing' AND lease_token = ?`).bind(`已保存到 Notes：${title}\nhttps://rachg.com/`, now, job.id, token),
  ]);
}

async function saveImage(env: TelegramStorageEnv, job: Job, token: string, source: Source, botToken: string) {
  const storage = new StoredFiles(env);
  await storage.ready('webdav');
  const file = await telegramFile(botToken, source.fileId, TELEGRAM_FILE_BYTES);
  let consumed = false;
  try {
    await ensureSchema(env.DB);
    // A fresh opaque key per attempt avoids overwriting an ambiguous or partial remote PUT.
    // Old reservations remain invisible and are removed by the existing exact-key cleanup.
    const id = crypto.randomUUID(), key = buildWebdavKey(id, source.filename), now = Date.now();
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE files SET status = 'purging' WHERE id = ? AND status = 'uploading'
        AND EXISTS (SELECT 1 FROM telegram_jobs WHERE id = ? AND lease_token = ? AND status = 'processing')`).bind(job.target_id, job.id, token),
      env.DB.prepare(`INSERT INTO files (id, filename, size_bytes, mime_type, r2_key, created_at, expires_at, download_count, delete_token, owner_id, status)
        SELECT ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'uploading' WHERE EXISTS (SELECT 1 FROM telegram_jobs WHERE id = ? AND lease_token = ? AND status = 'processing')`)
        .bind(id, source.filename, file.size, source.mime, key, now, crypto.randomUUID(), `telegram:${job.chat_id}`, job.id, token),
      env.DB.prepare(`UPDATE telegram_jobs SET target_id = ? WHERE id = ? AND lease_token = ? AND status = 'processing'`).bind(id, job.id, token),
    ]);
    if (!results[1].meta.changes) return;
    consumed = true;
    try { await storeStream(file.body, file.size, body => storage.put(key, body, source.mime, { fileId: id, filename: source.filename, expiresAt: '0' })); }
    catch (error) {
      if (error instanceof WebdavConflict) await env.DB.prepare("UPDATE files SET status = 'purged' WHERE id = ? AND status = 'uploading'").bind(id).run();
      throw error;
    }
    await env.DB.batch([
      env.DB.prepare(`UPDATE files SET status = 'active' WHERE id = ? AND status = 'uploading'
        AND EXISTS (SELECT 1 FROM telegram_jobs WHERE id = ? AND lease_token = ? AND status = 'processing')`).bind(id, job.id, token),
      env.DB.prepare(`UPDATE telegram_jobs SET status = 'done', result_text = ?, lease_token = NULL, lease_until = 0, updated_at = ?
        WHERE id = ? AND lease_token = ? AND status = 'processing' AND EXISTS (SELECT 1 FROM files WHERE id = ? AND status = 'active')`)
        .bind(`已保存到 Files：${source.filename}\n永久保存 · WebDAV\nhttps://api.rachg.com/f/${id}`, Date.now(), job.id, token, id),
    ]);
  } finally { if (!consumed) await file.body.cancel().catch(() => {}); }
}

async function sendReceipt(id: string, env: TelegramStorageEnv) {
  const config = telegramConfig(env);
  if (!config) return;
  const job = await env.DB.prepare('SELECT * FROM telegram_jobs WHERE id = ?').bind(id).first<Job>();
  if (!job || job.bot_id !== config.botId || job.chat_id !== config.userId || !['done', 'failed'].includes(job.status) || !job.result_text || job.receipt_status !== 'pending') return;
  const claimed = await env.DB.prepare(`UPDATE telegram_jobs SET receipt_status = 'sending' WHERE id = ? AND receipt_status = 'pending' AND status IN ('done', 'failed')`).bind(id).run();
  if (!claimed.meta.changes) return;
  try {
    await telegramApi(config.token, 'sendMessage', { chat_id: config.userId, text: job.result_text, link_preview_options: { is_disabled: true }, reply_parameters: { message_id: job.message_id, allow_sending_without_reply: true } });
    await env.DB.prepare("UPDATE telegram_jobs SET receipt_status = 'sent' WHERE id = ?").bind(id).run();
  } catch {
    // Telegram has no sendMessage idempotency key. An uncertain receipt must never rerun an import.
    await env.DB.prepare("UPDATE telegram_jobs SET receipt_status = 'unknown' WHERE id = ? AND receipt_status = 'sending'").bind(id).run();
  }
}

export async function processTelegramJob(id: string, env: TelegramStorageEnv): Promise<void> {
  const config = telegramConfig(env);
  if (!config) return;
  await ensureTelegramSchema(env.DB);
  const now = Date.now(), token = crypto.randomUUID();
  const claimed = await env.DB.prepare(`UPDATE telegram_jobs SET status = 'processing', lease_token = ?, lease_until = ?, attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND bot_id = ? AND chat_id = ? AND attempts < 3 AND ((status = 'pending' AND next_attempt_at <= ?) OR (status = 'processing' AND lease_until <= ?))`)
    .bind(token, now + LEASE_MS, now, id, config.botId, config.userId, now, now).run();
  if (!claimed.meta.changes) {
    await env.DB.prepare(`UPDATE telegram_jobs SET status = 'failed', result_text = ?, lease_token = NULL, lease_until = 0, updated_at = ?
      WHERE id = ? AND bot_id = ? AND chat_id = ? AND attempts >= 3 AND ((status = 'processing' AND lease_until <= ?) OR (status = 'pending' AND next_attempt_at <= ?))`)
      .bind('未保存成功：处理多次中断。请稍后重新发送，或使用 https://rachg.com/ 上传。', now, id, config.botId, config.userId, now, now).run();
    await sendReceipt(id, env); return;
  }
  const job = await env.DB.prepare('SELECT * FROM telegram_jobs WHERE id = ? AND lease_token = ?').bind(id, token).first<Job>();
  if (!job) return;
  try {
    const source = JSON.parse(job.source) as Source;
    if (source.kind === 'notice') await finishNotice(env, job, token, source.notice);
    else if (source.kind === 'markdown') await saveMarkdown(env, job, token, source, config.token);
    else await saveImage(env, job, token, source, config.token);
  } catch (error) {
    const retryable = error instanceof TelegramError ? error.retryable : !(error instanceof InputError && error.status === 413);
    if (retryable && job.attempts < 3) {
      await env.DB.prepare(`UPDATE telegram_jobs SET status = 'pending', next_attempt_at = ?, lease_token = NULL, lease_until = 0, updated_at = ?
        WHERE id = ? AND lease_token = ? AND status = 'processing'`).bind(Date.now() + job.attempts * 60_000, Date.now(), id, token).run();
    } else {
      const explanation = error instanceof TelegramError ? error.message : '存储服务暂时不可用。';
      await finishNotice(env, job, token, `未保存成功：${explanation}\n请稍后重新发送，或使用 https://rachg.com/ 上传。`, true);
    }
  }
  await sendReceipt(id, env);
}

/** Configure with Worker Secrets. No operator ever needs to read the bot token back out. */
export async function configureTelegram(env: TelegramStorageEnv) {
  const config = telegramConfig(env);
  if (!config) return false;
  await ensureTelegramSchema(env.DB);
  const secret = await webhookSecret(config.token), fingerprint = `${config.botId}:${config.userId}:${config.username}:${secret}`;
  // Store a second digest, never the webhook credential itself.
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint))), b => b.toString(16).padStart(2, '0')).join('');
  const saved = await env.DB.prepare("SELECT fingerprint FROM telegram_config WHERE id = 'webhook'").first<{ fingerprint: string }>();
  if (saved?.fingerprint === digest) return true;
  try {
    const me = await telegramApi<{ id: number; username: string; is_bot: boolean }>(config.token, 'getMe');
    if (!me.is_bot || String(me.id) !== config.botId || me.username?.toLowerCase() !== config.username.toLowerCase()) throw new TelegramError('Token 对应的机器人与配置名称不一致。', false);
    const result = await telegramApi<boolean>(config.token, 'setWebhook', { url: TELEGRAM_WEBHOOK_URL, secret_token: secret, allowed_updates: ['message'], max_connections: 2, drop_pending_updates: false });
    if (result !== true) throw new TelegramError('Webhook 配置未成功。');
    await env.DB.prepare(`INSERT INTO telegram_config (id, fingerprint, registered_at, last_error) VALUES ('webhook', ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET fingerprint = excluded.fingerprint, registered_at = excluded.registered_at, last_error = NULL`).bind(digest, Date.now()).run();
    return true;
  } catch {
    await env.DB.prepare(`INSERT INTO telegram_config (id, last_error) VALUES ('webhook', 'Telegram setup failed; verify the bot token and username.')
      ON CONFLICT(id) DO UPDATE SET last_error = excluded.last_error`).run();
    console.error('Telegram webhook configuration needs attention');
    return false;
  }
}

export async function runTelegramTasks(env: TelegramStorageEnv) {
  if (!await configureTelegram(env)) return;
  const config = telegramConfig(env)!, now = Date.now();
  const jobs = await env.DB.prepare(`SELECT id FROM telegram_jobs WHERE bot_id = ? AND chat_id = ? AND (
    (status = 'pending' AND next_attempt_at <= ?) OR (status = 'processing' AND lease_until <= ?) OR (status IN ('done', 'failed') AND receipt_status = 'pending'))
    ORDER BY created_at LIMIT 2`).bind(config.botId, config.userId, now, now).all<{ id: string }>();
  for (const job of jobs.results) await processTelegramJob(job.id, env).catch(() => console.error('Telegram job deferred', { id: job.id }));
}

export async function telegramStatus(env: TelegramStorageEnv) {
  await ensureTelegramSchema(env.DB);
  const registration = await env.DB.prepare("SELECT registered_at, last_error FROM telegram_config WHERE id = 'webhook'").first();
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM telegram_jobs GROUP BY status').all();
  return { enabled: Boolean(telegramConfig(env)), username: env.TELEGRAM_BOT_USERNAME || null, registration, counts: counts.results };
}
