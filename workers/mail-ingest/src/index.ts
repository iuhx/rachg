import PostalMime from 'postal-mime';

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
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|br|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    if (message.to.toLowerCase() !== 'hello@rachg.com') {
      message.setReject('This address is not configured for the rachg inbox.');
      return;
    }

    const id = makeId();
    const receivedAt = Date.now();
    const r2Key = `mail/${receivedAt}-${id}.eml`;
    const [rawForStore, rawForParse] = message.raw.tee();

    const storePromise = env.FILES_BUCKET.put(r2Key, rawForStore, {
      httpMetadata: { contentType: 'message/rfc822' },
    });
    const parsePromise = PostalMime.parse(rawForParse);
    const [, parsed] = await Promise.all([storePromise, parsePromise]);

    const from = message.from || parsed.from?.address || 'Unknown sender';
    const to = message.to || parsed.to?.map((address) => address.address).filter(Boolean).join(', ') || 'Unknown recipient';
    const subject = parsed.subject?.trim() || '(无标题)';
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
    try {
      await env.DB.prepare(`INSERT INTO mail (id, from_address, to_address, subject, received_at, preview, r2_key, message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, from, to, subject, receivedAt, preview, r2Key, messageId).run();
    } catch (error) {
      await env.FILES_BUCKET.delete(r2Key).catch(() => {});
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
