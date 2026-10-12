export const IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'bmp', 'avif'] as const;
export type ImageFormat = typeof IMAGE_FORMATS[number];
export type ImageKind = ImageFormat | 'heic';
export const IMAGE_LIMITS = { files: 20, fileBytes: 25 * 1024 * 1024, batchBytes: 100 * 1024 * 1024, outputBytes: 100 * 1024 * 1024, pixels: 24_000_000, dimension: 16384 } as const;
export const IMAGE_MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif' };
export interface ImageOptions { format: ImageFormat; quality: number }
export interface ImageResult { blob: Blob; preview: Blob; width: number; height: number }

export function checkDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('Invalid image dimensions.');
  if (width > IMAGE_LIMITS.dimension || height > IMAGE_LIMITS.dimension || width * height > IMAGE_LIMITS.pixels) throw new Error('This image exceeds 24 megapixels or 16,384 pixels on one side. Resize it before converting.');
}

/** Inspect signatures and available dimensions before allocating decoded pixels. */
export function inspectImage(bytes: Uint8Array): ImageKind {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length < 12) throw new Error('This file is too short to be an image.');
  if (text(0, 8) === '\x89PNG\r\n\x1a\n' && bytes.length >= 24) {
    checkDimensions(view.getUint32(16), view.getUint32(20)); return 'png';
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) {
        checkDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3)); break;
      }
      offset += length;
    }
    return 'jpeg';
  }
  if (text(0, 2) === 'BM' && bytes.length >= 26) {
    const header = view.getUint32(14, true);
    if (header === 12) checkDimensions(view.getUint16(18, true), view.getUint16(20, true));
    else checkDimensions(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)));
    return 'bmp';
  }
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    if (text(12, 4) === 'VP8X' && bytes.length >= 30) {
      const uint24 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
      checkDimensions(uint24(24) + 1, uint24(27) + 1);
    } else if (text(12, 4) === 'VP8 ' && bytes.length >= 30) checkDimensions(view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383);
    else if (text(12, 4) === 'VP8L' && bytes.length >= 25) checkDimensions(1 + (bytes[21] | (bytes[22] & 63) << 8), 1 + ((bytes[22] >> 6) | bytes[23] << 2 | (bytes[24] & 15) << 10));
    return 'webp';
  }
  if (text(4, 4) === 'ftyp' && bytes.length >= 16) {
    const end = Math.min(view.getUint32(0), bytes.length, 256);
    const brands = [text(8, 4)];
    for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(text(offset, 4));
    const kind = brands.some(brand => ['avif', 'avis'].includes(brand)) ? 'avif' : brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) ? 'heic' : null;
    if (kind) {
      let count = 0;
      const boxes = (start: number, end: number, depth = 0) => {
        if (depth > 8) return;
        for (let offset = start; offset + 8 <= end && count++ < 5000;) {
          const size = view.getUint32(offset), type = text(offset + 4, 4);
          if (size < 8 || offset + size > end) break;
          if (type === 'ispe' && size >= 20) checkDimensions(view.getUint32(offset + 12), view.getUint32(offset + 16));
          if (['meta', 'iprp', 'ipco'].includes(type)) boxes(offset + (type === 'meta' ? 12 : 8), offset + size, depth + 1);
          offset += size;
        }
      };
      boxes(0, bytes.length);
      return kind;
    }
  }
  throw new Error('Use PNG, JPEG, WebP, BMP, AVIF or HEIC/HEIF images. The file contents do not match a supported image.');
}

/** Portable 24-bit BMP, bottom-up BGR scanlines with four-byte padding. */
export function encodeBmp(image: Pick<ImageData, 'width' | 'height' | 'data'>): ArrayBuffer {
  const { width, height, data } = image;
  checkDimensions(width, height);
  if (data.length !== width * height * 4) throw new Error('Invalid pixel data.');
  const stride = (width * 3 + 3) & ~3;
  const buffer = new ArrayBuffer(54 + stride * height), view = new DataView(buffer), bytes = new Uint8Array(buffer);
  bytes[0] = 66; bytes[1] = 77;
  view.setUint32(2, buffer.byteLength, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true);
  view.setInt32(18, width, true); view.setInt32(22, height, true); view.setUint16(26, 1, true); view.setUint16(28, 24, true);
  view.setUint32(34, stride * height, true);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (y * width + x) * 4, dest = 54 + (height - 1 - y) * stride + x * 3, alpha = data[source + 3] / 255;
    for (let channel = 0; channel < 3; channel++) bytes[dest + channel] = Math.round(data[source + 2 - channel] * alpha + 255 * (1 - alpha));
  }
  return buffer;
}

export function outputNames(files: readonly { name: string }[], format: ImageFormat): string[] {
  const used = new Set<string>();
  return files.map(file => {
    const stem = file.name.replace(/^.*[/\\]/, '').replace(/\.[^.]*$/, '').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 140) || 'image';
    let name = `${stem}.${format === 'jpeg' ? 'jpg' : format}`, suffix = 2;
    while (used.has(name.toLowerCase())) name = `${stem}-${suffix++}.${format === 'jpeg' ? 'jpg' : format}`;
    used.add(name.toLowerCase()); return name;
  });
}
