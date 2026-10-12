import type { ImageOptions, ImageResult } from '../utils/imageFormats';

/** A fresh local worker per image releases codec memory after success/cancel/error. */
export function convertImage(file: File, options: ImageOptions, signal: AbortSignal): Promise<ImageResult> {
  if (signal.aborted) return Promise.reject(new DOMException('Conversion cancelled', 'AbortError'));
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return Promise.reject(new Error('Use a current version of Chrome, Edge, Firefox or Safari for local image conversion.'));
  return workerRequest(new Worker(new URL('../utils/imageConversion.worker.ts', import.meta.url), { type: 'module' }), { file, options }, signal,
    (result): result is ImageResult => result?.blob instanceof Blob && result?.preview instanceof Blob);
}

export function packImages(files: { name: string; blob: Blob }[], signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) return Promise.reject(new DOMException('Download cancelled', 'AbortError'));
  return workerRequest(new Worker(new URL('../utils/imageZip.worker.ts', import.meta.url), { type: 'module' }), { files }, signal,
    (result): result is Blob => result instanceof Blob);
}

function workerRequest<T>(worker: Worker, input: unknown, signal: AbortSignal, valid: (result: any) => result is T): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, result?: T) => {
      clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate();
      if (error) reject(error); else if (result) resolve(result);
    };
    const abort = () => finish(new DOMException('Conversion cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('This image took too long to convert. Try a smaller image or another format.')), 120_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => {
      const { result, error } = event.data;
      if (error) finish(new Error(error));
      else if (valid(result)) finish(undefined, result);
      else finish(new Error('The image converter returned an invalid result.'));
    };
    worker.onerror = event => { event.preventDefault(); finish(new Error('The image converter could not load or ran out of memory. Try a smaller image.')); };
    worker.onmessageerror = () => finish(new Error('Unable to read the conversion result.'));
    try { worker.postMessage(input); } catch (error) { finish(error instanceof Error ? error : new Error('Unable to start conversion.')); }
  });
}
