// Cloudflare Email Worker source for quiet-king-d2c8.
// Required bindings: DB (d1rachg), FILES_BUCKET (r2rachg).
// Variables: TG_CHAT_ID (optional), FORWARD_TO (optional).
// Secret: TG_BOT_TOKEN (optional).

function decodeMimeWords(value) {
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (whole, charset, encoding, data) => {
    try {
      let bytes;
      if (encoding.toUpperCase() === 'B') {
        const binary = atob(data);
        bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      } else {
        const decoded = data.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)));
        bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      }
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return data;
    }
  });
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTelegram(env, from, to, subject) {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
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
}

export default {
  async email(message, env, ctx) {
    if (message.to.toLowerCase() !== 'hello@rachg.com') {
      message.setReject('This address is not configured for the rachg inbox.');
      return;
    }

    const id = crypto.randomUUID().replace(/-/g, '');
    const receivedAt = Date.now();
    const r2Key = `mail/${receivedAt}-${id}.eml`;
    const [rawForStorage, rawForHeaders] = message.raw.tee();
    const storagePromise = env.FILES_BUCKET.put(r2Key, rawForStorage, {
      httpMetadata: { contentType: 'message/rfc822' },
    });
    const raw = await new Response(rawForHeaders).arrayBuffer();
    const headerText = new TextDecoder('utf-8').decode(raw.slice(0, Math.min(raw.byteLength, 128 * 1024)));
    const headerBlock = headerText.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
    const header = (name) => {
      const match = headerBlock.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
      return match ? match[1].trim() : '';
    };

    const from = message.from || header('From') || 'Unknown sender';
    const to = message.to || header('To') || 'Unknown recipient';
    const subject = decodeMimeWords(header('Subject')).trim() || '(无标题)';
    const messageId = header('Message-ID').slice(0, 998) || null;

    await storagePromise;

    try {
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
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mail_received ON mail (received_at DESC)').run();
      await env.DB.prepare(`INSERT INTO mail
        (id, from_address, to_address, subject, received_at, preview, r2_key, message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          id, from, to, subject, receivedAt, '', r2Key, messageId,
        ).run();
    } catch (error) {
      await env.FILES_BUCKET.delete(r2Key).catch(() => {});
      throw error;
    }

    ctx.waitUntil(sendTelegram(env, from, to, subject).catch((error) => {
      console.error('Telegram notification failed:', error);
    }));

    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (error) {
        console.error('Email forwarding failed:', error);
      }
    }
  },
};
