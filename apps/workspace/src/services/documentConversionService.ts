import type { ImportedDocument } from '../utils/documentFormats';

function request<T>(input: unknown, signal: AbortSignal, valid: (value: any) => value is T): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Conversion cancelled', 'AbortError'));
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Use a current browser for local document conversion.'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../utils/documentConversion.worker.ts', import.meta.url), { type: 'module' });
    let finished = false;
    const finish = (error?: Error, result?: T) => {
      if (finished) return; finished = true;
      clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new DOMException('Conversion cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('This document took too long to convert. Try a smaller document.')), 30_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => data.error ? finish(new Error(data.error)) : valid(data.result) ? finish(undefined, data.result) : finish(new Error('Invalid conversion result.'));
    worker.onerror = event => { event.preventDefault(); finish(new Error('The document converter could not load. Refresh and retry.')); };
    worker.onmessageerror = () => finish(new Error('Unable to read the converted document.'));
    try { worker.postMessage(input); } catch { finish(new Error('Unable to start document conversion.')); }
  });
}
export const readDocument = (file: File, signal: AbortSignal) => request({ file }, signal, (value): value is ImportedDocument => typeof value?.markdown === 'string' && typeof value.name === 'string' && typeof value.warning === 'string');
export const createWordDocument = (markdown: string, signal: AbortSignal) => request({ markdown }, signal, (value): value is Blob => value instanceof Blob);
