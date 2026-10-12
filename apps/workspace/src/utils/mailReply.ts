import type { MailMessage, MailSendRequest } from '../types';

export function replySubject(subject: string): string {
  const value = /^re\s*:/i.test(subject) ? subject : `Re: ${subject || '(No subject)'}`;
  // Keep room within the API's title limit without leaving half of an emoji.
  return value.slice(0, 200).replace(/[\uD800-\uDBFF]$/, '');
}

export function replyHeaders(message: MailMessage): Pick<MailSendRequest, 'inReplyTo' | 'references'> {
  const parent = message.messageId?.trim();
  const inReplyTo = parent && parent.length <= 998 && !/[\r\n]/.test(parent) ? parent : undefined;
  const ancestors = message.references?.match(/<[^<>\r\n]+>/g) || [];
  const ids = [...new Set(ancestors.filter(id => id !== inReplyTo)), ...(inReplyTo ? [inReplyTo] : [])];
  // Keep the immediate parent, dropping the oldest history when headers get long.
  let references = '';
  for (let index = ids.length - 1; index >= 0; index--) {
    const next = references ? `${ids[index]} ${references}` : ids[index];
    if (next.length > 4000) break;
    references = next;
  }
  return { inReplyTo, references: references || undefined };
}
