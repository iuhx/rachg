/// <reference lib="webworker" />
import { importDocument } from './documentImport';
import { markdownToDocx } from './documentExport';
import { markdownToText } from './markdownText';

self.onmessage = async (event: MessageEvent<{ file?: File; markdown?: string; plain?: boolean }>) => {
  try {
    const result = event.data.file ? await importDocument(event.data.file) : event.data.plain ? markdownToText(event.data.markdown ?? '') : await markdownToDocx(event.data.markdown ?? '');
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Unable to convert this document.' }); }
};
