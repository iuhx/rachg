import type { MailQuote } from '@rachg/shared';

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => entities[character]);
const lines = (value: string) => escapeHtml(value.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');

/** HTML is generated only from validated plain text. Never accept client HTML. */
export function formatOutgoingMail(text: string, quote?: MailQuote): { text: string; html: string } {
  let plain = text;
  let history = '';
  if (quote) {
    const received = new Date(quote.receivedAt).toUTCString();
    const quotedText = quote.text.replace(/\r\n?/g, '\n').split('\n').map(line => `> ${line}`).join('\n');
    plain += `\n\n----- Original message -----\nFrom: ${quote.from}\nReceived: ${received}\nSubject: ${quote.subject}\n\n${quotedText}`;
    history = `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e5e9"><div style="font-size:12px;color:#70757a;margin-bottom:10px">Original message</div><blockquote type="cite" style="margin:0;padding:14px 18px;border-left:3px solid #c5cbd3;background:#f6f7f9;color:#5f6368"><div style="font-size:12px;line-height:1.6;margin-bottom:12px"><strong>From:</strong> ${escapeHtml(quote.from)}<br><strong>Received:</strong> ${escapeHtml(received)}<br><strong>Subject:</strong> ${escapeHtml(quote.subject)}</div><div style="font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere">${lines(quote.text)}</div></blockquote></div>`;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px 16px;background:#ffffff"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#202124"><tr><td><div style="font-size:15px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere">${lines(text)}</div>${history}</td></tr></table></body></html>`;
  return { text: plain, html };
}
