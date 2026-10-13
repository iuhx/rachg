import QRCode from 'qrcode';
import type { FileItem } from '../types';

// A conservative UTF-8 budget keeps QR codes within medium error correction capacity.
export const LOCAL_QR_BYTES = 2200;
export const TOOL_TEXT_BYTES = 200_000;
export { FILE_UPLOAD_BYTES as FILE_BYTES } from '@rachg/shared';
export const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;
export interface QrMatrix { size: number; data: Uint8Array }
export type QrResult = { kind: 'empty' | 'too-long' } | { kind: 'error'; message: string } | { kind: 'ready'; matrix: QrMatrix };

export function createQr(value: string): QrResult {
  if (!value.trim()) return { kind: 'empty' };
  if (value.length > LOCAL_QR_BYTES || byteLength(value) > LOCAL_QR_BYTES) return { kind: 'too-long' };
  try {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    return { kind: 'ready', matrix: { size: modules.size, data: modules.data } };
  } catch {
    return { kind: 'error', message: 'This text could not be encoded. Check for incomplete characters and try again.' };
  }
}

export function qrPixels(matrix: QrMatrix, scale = 6) {
  const width = (matrix.size + 8) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
    if (!matrix.data[y * matrix.size + x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  return { pixels, width };
}

export async function qrPng(matrix: QrMatrix): Promise<Blob> {
  const { pixels, width } = qrPixels(matrix);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = width;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create PNG images.');
  context.putImageData(new ImageData(pixels, width, width), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create the PNG.')), 'image/png'));
}

export function usableFile(file: FileItem, now = Date.now()) {
  return file.status === 'active' && Boolean(file.shareUrl) && (!file.expiresTimestamp || file.expiresTimestamp > now);
}

export function textShareUrl(file: FileItem): string {
  if (!file.shareUrl) throw new Error('The uploaded file has no share link.');
  const url = new URL(file.shareUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid file link.');
  url.pathname = `/t/${encodeURIComponent(file.id)}`;
  url.search = ''; url.hash = '';
  return url.href;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
