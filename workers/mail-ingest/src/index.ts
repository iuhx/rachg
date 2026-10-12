import PostalMime from 'postal-mime';
import { mailPlainText, MAX_MAIL_BYTES, readBounded } from '../../common/content';
import { ensureMailLedger, mailFingerprint } from '../../common/mail-ledger';

interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  FORWARD_TO?: string;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
  MAX_MAIL_STORAGE_BYTES?: string;
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

    const receivedAt = Date.now();
    const raw = await readBounded(message.raw, MAX_MAIL_BYTES);
    const id = await mailFingerprint(raw, message.to);
    const r2Key = `mail/${id}.eml`;

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
    await ensureMailLedger(env.DB);
    const existing = await env.DB.prepare('SELECT state FROM mail_ingestions WHERE id = ?').bind(id).first<{ state: string }>();
    if (existing?.state === 'stored' || existing?.state === 'purged') return;
    if (existing) {
      // An earlier INSERT may have committed even if its response was lost.
      const saved = await env.DB.prepare('SELECT id FROM mail WHERE id = ?').bind(id).first();
      if (saved) {
        await env.DB.prepare("UPDATE mail_ingestions SET state = 'stored' WHERE id = ?").bind(id).run();
        return;
      }
      throw new Error('An identical delivery is still pending; retry after cleanup');
    }
    const maximum = Number(env.MAX_MAIL_STORAGE_BYTES || 1024 * 1024 * 1024);
    if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new Error('Invalid mailbox storage budget');
    const reserved = await env.DB.prepare(`INSERT OR IGNORE INTO mail_ingestions (id, r2_key, size_bytes, created_at)
      SELECT ?, ?, ?, ? WHERE
        (SELECT COALESCE(SUM(size_bytes), 0) FROM mail_ingestions WHERE state != 'purged') + ? <= ?
        AND (SELECT COUNT(*) FROM mail) < 5000
        AND (SELECT COUNT(*) FROM mail_ingestions WHERE created_at > ?) < 200
    `).bind(id, r2Key, raw.byteLength, receivedAt, raw.byteLength, maximum, receivedAt - 3600_000).run();
    if (!(reserved.meta?.changes)) throw new Error('Mailbox budget or concurrent delivery prevents acceptance');
    let from = message.from, subject = '(无标题)';
    const to = message.to;
    try {
      const parsed = await PostalMime.parse(raw);
      from = parsed.from?.address || message.from || 'Unknown sender';
      subject = parsed.subject?.trim().slice(0, 200) || '(无标题)';
      const text = parsed.text?.trim() || plainTextFromHtml(parsed.html || '');
      const preview = text.replace(/\s+/g, ' ').slice(0, 240);
      const messageId = parsed.messageId?.slice(0, 998) || null;
      await env.FILES_BUCKET.put(r2Key, raw, {
        httpMetadata: { contentType: 'message/rfc822' },
      });
      await env.DB.prepare(`INSERT INTO mail (id, from_address, to_address, subject, received_at, preview, r2_key, message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, from, to, subject, receivedAt, preview, r2Key, messageId).run();
    } catch (error) {
      // The durable ledger retains both the bytes and exact key until the
      // scheduled reconciler can distinguish a committed INSERT from an orphan.
      console.error('Mail delivery is pending reconciliation', { id });
      throw error;
    }
    await env.DB.prepare("UPDATE mail_ingestions SET state = 'stored' WHERE id = ?").bind(id).run();

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
