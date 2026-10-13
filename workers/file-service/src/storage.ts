/**
 * Cloudflare R2 Storage Operations.
 *
 * CRITICAL RULE:
 * The existing R2 bucket is also used for images and other assets (e.g. images/).
 * All temporary files MUST be isolated under the transfers/ prefix:
 *   transfers/{file_id}/{clean_filename}
 * Never read, write, or list outside the transfers/ prefix.
 */

const TRANSFERS_PREFIX = 'transfers/';
const MAIL_PREFIX = 'mail/';

export function buildR2Key(id: string, filename: string): string {
  // Sanitize filename: replace spaces or path traversals
  const cleanFilename = filename.replace(/[/\\?%*:|"<>]/g, '_').trim();
  return `${TRANSFERS_PREFIX}${id}/${cleanFilename}`;
}

/**
 * Upload a stream/body directly to R2.
 */
export async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream | ArrayBuffer,
  mimeType: string,
  customMetadata: Record<string, string> = {}
): Promise<R2Object> {
  const obj = await bucket.put(key, body, {
    httpMetadata: {
      contentType: mimeType || 'application/octet-stream',
    },
    customMetadata,
  });

  return obj;
}

/**
 * Get an object from R2 for streaming download.
 */
export async function getFromR2(bucket: R2Bucket, key: string, range?: { offset: number; length: number }): Promise<R2ObjectBody | null> {
  // Defensive check: ensure key starts with transfers/
  if (!key.startsWith(TRANSFERS_PREFIX)) {
    throw new Error('Access denied: key is outside transfers/ prefix');
  }
  const obj = await bucket.get(key, range ? { range } : undefined);
  return obj;
}

export async function headFromR2(bucket: R2Bucket, key: string): Promise<R2Object | null> {
  if (!key.startsWith(TRANSFERS_PREFIX)) throw new Error('Access denied: key is outside transfers/ prefix');
  return bucket.head(key);
}

/**
 * Delete an object from R2.
 */
export async function deleteFromR2(bucket: R2Bucket, key: string): Promise<void> {
  // Defensive check: ensure key starts with transfers/
  if (!key.startsWith(TRANSFERS_PREFIX)) {
    throw new Error('Access denied: key is outside transfers/ prefix');
  }
  await bucket.delete(key);
}

export async function getMailObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  if (!key.startsWith(MAIL_PREFIX)) throw new Error('Access denied: key is outside mail/ prefix');
  return bucket.get(key);
}

export async function deleteMailObject(bucket: R2Bucket, key: string): Promise<void> {
  if (!key.startsWith(MAIL_PREFIX)) throw new Error('Access denied: key is outside mail/ prefix');
  await bucket.delete(key);
}
