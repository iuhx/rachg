/// <reference lib="webworker" />
import { importDocument } from './documentImport';
import { markdownToDocx } from './documentExport';

self.onmessage = async (event: MessageEvent<{ file?: File; markdown?: string }>) => {
  try {
    const result = event.data.file ? await importDocument(event.data.file) : await markdownToDocx(event.data.markdown ?? '');
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Unable to convert this document.' }); }
};
