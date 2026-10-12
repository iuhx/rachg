import PostalMime from 'postal-mime';
import { mailPlainText, MAX_MAIL_BYTES, readBounded } from '../../common/content';

interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  FORWARD_TO?: string;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
}

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function plainTextFromHtml(html: string): string {
  return mailPlainText(html);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyTelegram(env: Env, from: string, to: string, subject: string): Promise<void> {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TG_CHAT_ID,
        parse_mode: 'HTML',
        text: `<b>📬 收到新邮件</b>\n\n<b>发件人:</b> <code>${escapeHtml(from)}</code>\n<b>收件人:</b> <code>${escapeHtml(to)}</code>\n<b>主题:</b> ${escapeHtml(subject)}`,
      }),
    });
    if (!response.ok) console.error('Telegram notification failed:', response.status, await response.text());
  } catch (error) {
    console.error('Telegram notification failed:', error);
  }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!message.to.toLowerCase().endsWith('@rachg.com')) {
      message.setReject('This address is not configured for the rachg inbox.');
      return;
    }
    if (message.rawSize > MAX_MAIL_BYTES) {
      message.setReject('This mailbox accepts messages up to 5 MiB including attachments.');
      return;
    }

    const id = makeId();
    const receivedAt = Date.now();
    const r2Key = `mail/${receivedAt}-${id}.eml`;
    const raw = await readBounded(message.raw, MAX_MAIL_BYTES);
    const parsed = await PostalMime.parse(raw);

    const from = parsed.from?.address || message.from || 'Unknown sender';
    const to = message.to || parsed.to?.map((address) => address.address).filter(Boolean).join(', ') || 'Unknown recipient';
    const subject = parsed.subject?.trim().slice(0, 200) || '(无标题)';
    const text = parsed.text?.trim() || plainTextFromHtml(parsed.html || '');
    const preview = text.replace(/\s+/g, ' ').slice(0, 240);
    const messageId = parsed.messageId?.slice(0, 998) || null;

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mail (
      id TEXT PRIMARY KEY,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      preview TEXT NOT NULL DEFAULT '',
      r2_key TEXT NOT NULL,
      message_id TEXT
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_received ON mail (received_at DESC)`).run();
    await env.FILES_BUCKET.put(r2Key, raw, {
      httpMetadata: { contentType: 'message/rfc822' },
    });
    try {
      await env.DB.prepare(`INSERT INTO mail (id, from_address, to_address, subject, received_at, preview, r2_key, message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, from, to, subject, receivedAt, preview, r2Key, messageId).run();
    } catch (error) {
      // An INSERT can commit even if its response is lost. Check the reference
      // before compensating; never delete an object still referenced by mail.
      try {
        const saved = await env.DB.prepare('SELECT id FROM mail WHERE id = ?').bind(id).first();
        if (!saved) await env.FILES_BUCKET.delete(r2Key);
      } catch { console.error('Mail storage needs reconciliation', { id, r2Key }); }
      throw error;
    }

    ctx.waitUntil(notifyTelegram(env, from, to, subject));

    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (error) {
        console.error('Email forwarding failed:', error);
      }
    }
  },
};
