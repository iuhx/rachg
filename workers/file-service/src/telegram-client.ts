import { InputError, readBounded } from '../../common/content';

export const TELEGRAM_WEBHOOK_PATH = '/integrations/telegram/webhook';
export const TELEGRAM_WEBHOOK_URL = `https://api.rachg.com${TELEGRAM_WEBHOOK_PATH}`;
export const TELEGRAM_FILE_BYTES = 20_000_000;
export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_ALLOWED_USER_ID?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_ENABLED?: string;
}
export class TelegramError extends Error {
  constructor(message: string, readonly retryable = true) { super(message); }
}
export function telegramConfig(env: TelegramEnv) {
  const token = env.TELEGRAM_BOT_TOKEN || '', userId = Number(env.TELEGRAM_ALLOWED_USER_ID);
  if (env.TELEGRAM_ENABLED !== 'true' || !/^\d{5,20}:[\w-]{20,120}$/.test(token) || !Number.isSafeInteger(userId) || userId <= 0 || !/^\w{5,32}$/.test(env.TELEGRAM_BOT_USERNAME || '')) return null;
  return { token, userId, botId: token.split(':')[0], username: env.TELEGRAM_BOT_USERNAME! };
}
export async function webhookSecret(token: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('rachg:telegram-webhook:v1'));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function isTelegramWebhook(request: Request, env: TelegramEnv): Promise<boolean> {
  const config = telegramConfig(env), supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!config || !supplied || supplied.length !== 64) return false;
  const expected = await webhookSecret(config.token);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}

/** Token-bearing URLs, upstream bodies and raw fetch errors must never reach logs or replies. */
export async function telegramApi<T>(token: string, method: 'getMe' | 'getWebhookInfo' | 'setWebhook' | 'getFile' | 'sendMessage', payload: Record<string, unknown> = {}): Promise<T> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    const data = JSON.parse(new TextDecoder().decode(await readBounded(response.body, 64_000))) as { ok?: boolean; result?: T };
    if (!response.ok || data.ok !== true || data.result === undefined) throw new TelegramError('Telegram 暂时无法处理请求，请稍后重试。', response.status >= 500 || response.status === 429 || response.status === 408);
    return data.result;
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    throw new TelegramError('暂时无法连接 Telegram，请稍后重试。');
  }
}

export async function telegramFile(token: string, fileId: string, maximum: number): Promise<{ body: ReadableStream<Uint8Array>; size: number }> {
  const meta = await telegramApi<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: fileId });
  const path = meta.file_path;
  if (!path || !/^[\w./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new TelegramError('Telegram 返回了无效的文件地址。', false);
  if (meta.file_size !== undefined && (!Number.isSafeInteger(meta.file_size) || meta.file_size < 1 || meta.file_size > maximum)) throw new TelegramError(maximum === TELEGRAM_FILE_BYTES ? '图片超过 20MB，请通过工作台网页上传。' : 'Markdown 文件超过笔记的 1MB 限制，请缩小后再发送。', false);
  try {
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { redirect: 'manual', headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(60_000) });
    if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw new TelegramError('暂时无法下载 Telegram 文件。'); }
    const header = response.headers.get('content-length');
    const length = header !== null && /^\d+$/.test(header) ? Number(header) : undefined;
    const size = meta.file_size ?? length;
    if (size === undefined || !Number.isSafeInteger(size) || size < 1 || size > maximum || (length !== undefined && length !== size) || response.headers.has('content-encoding')) {
      await response.body.cancel(); throw new TelegramError('文件大小或传输格式不符合要求，请通过工作台网页上传。', false);
    }
    return { body: response.body, size };
  } catch (error) {
    if (error instanceof TelegramError || error instanceof InputError) throw error;
    throw new TelegramError('暂时无法下载 Telegram 文件。');
  }
}
