import { zipSync } from 'fflate';
import { IMAGE_LIMITS } from './imageFormats';

self.onmessage = async (event: MessageEvent<{ files: { name: string; blob: Blob }[] }>) => {
  try {
    const files = event.data.files;
    if (files.length > IMAGE_LIMITS.files || files.reduce((sum, file) => sum + file.blob.size, 0) > IMAGE_LIMITS.outputBytes) throw new Error('The download exceeds the batch limit. Download images individually.');
    const entries: Record<string, Uint8Array> = Object.create(null);
    for (const file of files) {
      if (!file.name || /[/\\]/.test(file.name) || Object.hasOwn(entries, file.name)) throw new Error('Invalid or duplicate download name.');
      entries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
    }
    self.postMessage({ result: new Blob([new Uint8Array(zipSync(entries, { level: 0 }))], { type: 'application/zip' }) });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Unable to package these images.' }); }
};
