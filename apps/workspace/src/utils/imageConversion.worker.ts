import { checkDimensions, encodeBmp, IMAGE_FORMATS, IMAGE_LIMITS, IMAGE_MIME, inspectImage, type ImageOptions, type ImageResult } from './imageFormats';

async function decode(file: File): Promise<ImageBitmap> {
  const bytes = await file.arrayBuffer();
  const kind = inspectImage(new Uint8Array(bytes));
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    if (kind === 'heic') {
      const { heicTo } = await import('heic-to/next');
      return heicTo({ blob: file, type: 'bitmap' });
    }
    if (kind === 'avif') {
      const [{ default: factory }, { default: wasm }] = await Promise.all([
        import('@jsquash/avif/codec/dec/avif_dec.js'), import('@jsquash/avif/codec/dec/avif_dec.wasm?url'),
      ]);
      const codec = await factory({ locateFile: () => wasm });
      const pixels = codec.decode(new Uint8Array(bytes), 8);
      if (!pixels) throw new Error('Unable to decode this AVIF image.');
      checkDimensions(pixels.width, pixels.height);
      return createImageBitmap(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height));
    }
    throw new Error('The image is damaged or uses an encoding this browser cannot read.');
  }
}

async function convert(file: File, options: ImageOptions): Promise<ImageResult> {
  if (!file.size || file.size > IMAGE_LIMITS.fileBytes) throw new Error('Choose a non-empty image up to 25 MiB.');
  if (!IMAGE_FORMATS.includes(options.format) || !Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) throw new Error('Invalid conversion settings.');
  const image = await decode(file);
  let canvas: OffscreenCanvas | undefined;
  try {
    checkDimensions(image.width, image.height);
    const { width, height } = image;
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot create an image canvas.');
    if (options.format === 'jpeg' || options.format === 'bmp') { context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); }
    context.drawImage(image, 0, 0);
    let blob: Blob;
    if (options.format === 'bmp') blob = new Blob([encodeBmp(context.getImageData(0, 0, width, height))], { type: IMAGE_MIME.bmp });
    else if (options.format === 'avif') {
      // Explicit single-thread codec works without cross-origin isolation headers.
      const [{ default: factory }, { default: wasm }, { defaultOptions }] = await Promise.all([
        import('@jsquash/avif/codec/enc/avif_enc.js'), import('@jsquash/avif/codec/enc/avif_enc.wasm?url'), import('@jsquash/avif/meta.js'),
      ]);
      const codec = await factory({ locateFile: () => wasm });
      const pixels = context.getImageData(0, 0, width, height);
      const encoded = codec.encode(new Uint8Array(pixels.data.buffer), width, height, { ...defaultOptions, quality: options.quality, qualityAlpha: 100, speed: 8 });
      if (!encoded) throw new Error('AVIF encoding failed. Try a smaller image.');
      blob = new Blob([new Uint8Array(encoded)], { type: IMAGE_MIME.avif });
    } else {
      blob = await canvas.convertToBlob({ type: IMAGE_MIME[options.format], quality: options.quality / 100 });
      if (blob.type !== IMAGE_MIME[options.format]) throw new Error(`This browser cannot encode ${options.format.toUpperCase()}. Choose another output format.`);
    }
    if (!blob.size) throw new Error('The encoder returned an empty image.');
    const scale = Math.min(1, 256 / Math.max(width, height));
    const thumb = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const preview = await thumb.convertToBlob({ type: 'image/png' });
    thumb.width = thumb.height = 1;
    return { blob, preview, width, height };
  } finally { image.close(); if (canvas) canvas.width = canvas.height = 1; }
}

self.onmessage = async (event: MessageEvent<{ file: File; options: ImageOptions }>) => {
  try { self.postMessage({ result: await convert(event.data.file, event.data.options) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Unable to convert this image. Try another file or output format.' }); }
};
