/** Limits are checked while reading, before multipart/JSON/MIME parsing. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MAIL_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1_000_000;

export class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function readBounded(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<ArrayBuffer> {
  if (!stream) return new ArrayBuffer(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new InputError('Request body timed out', 408)); void reader.cancel().catch(() => {}); }, 60_000);
  });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) { void reader.cancel().catch(() => {}); throw new InputError(`Request exceeds the ${maximum}-byte limit`, 413); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes.buffer;
  } finally { if (timer !== undefined) clearTimeout(timer); reader.releaseLock(); }
}

export async function boundedForm(request: Request, maximum = MAX_FILE_BYTES + 512 * 1024): Promise<FormData> {
  const type = request.headers.get('content-type') || '';
  if (!type.startsWith('multipart/form-data;')) throw new InputError('Expected multipart/form-data', 415);
  const bytes = await readBounded(request.body, maximum);
  try { return await new Response(bytes, { headers: { 'content-type': type } }).formData(); }
  catch { throw new InputError('Invalid multipart form'); }
}

export async function boundedJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new InputError('Expected application/json', 415);
  const bytes = await readBounded(request.body, 2 * 1024 * 1024);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new InputError('Invalid JSON'); }
}

/** Forward-only scanning. Missing closing script/style tags never restart a search. */
export function mailPlainText(html: string, maxOutput = 256 * 1024): string {
  const source = html.slice(0, MAX_MAIL_BYTES);
  // Lowercase ASCII only: Unicode case folding can change offsets (for example İ).
  const lower = source.replace(/[A-Z]/g, (character) => character.toLowerCase());
  const chunks: string[] = [];
  let position = 0, length = 0;
  const append = (text: string) => { const part = text.slice(0, maxOutput - length); chunks.push(part); length += part.length; };
  while (position < source.length && length < maxOutput) {
    const opening = source.indexOf('<', position);
    if (opening === -1) { append(source.slice(position)); break; }
    append(source.slice(position, opening));
    const closing = source.indexOf('>', opening + 1);
    if (closing === -1) break;
    const tag = lower.slice(opening + 1, Math.min(closing, opening + 80)).trim();
    const name = /^\/?([a-z0-9]+)/.exec(tag)?.[1];
    position = closing + 1;
    if ((name === 'script' || name === 'style') && !tag.startsWith('/')) {
      const end = lower.indexOf(`</${name}`, position);
      if (end === -1) break;
      const endTag = source.indexOf('>', end);
      if (endTag === -1) break;
      position = endTag + 1;
    } else append(['br', 'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3'].includes(name || '') ? '\n' : ' ');
  }
  const entities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  return chunks.join('').replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (_, key: string) => entities[key.toLowerCase()]).trim();
}
