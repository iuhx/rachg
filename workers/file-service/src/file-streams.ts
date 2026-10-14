import { InputError } from '../../common/content';

/** FixedLengthStream supplies R2/fetch with a known length and rejects truncated or oversized bodies. */
export async function storeStream(body: ReadableStream, size: number, store: (body: ReadableStream) => Promise<void>) {
  const fixed = new FixedLengthStream(size);
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new InputError('Upload timed out. Please retry.', 408)), 300_000);
  });
  const pumping = body.pipeTo(fixed.writable, { signal: abort.signal }).catch(error => {
    throw error instanceof InputError ? error : new InputError('Upload length did not match the declared file size. Please retry.');
  });
  try { await Promise.race([Promise.all([pumping, store(fixed.readable)]), deadline]); }
  catch (error) {
    if (error instanceof TypeError && /FixedLengthStream/.test(error.message)) throw new InputError('Upload length did not match the declared file size. Please retry.');
    throw error;
  }
  finally {
    clearTimeout(timer!); abort.abort();
    // An early rejection (for example WebDAV 412) may leave no reader at all.
    // Cancel that readable to release a backpressured write; never await a stuck pipe.
    await fixed.readable.cancel().catch(() => {});
  }
}

/** Validate lengths while forwarding chunks; a provider ignoring Range is sliced without buffering. */
export function fileSlice(body: ReadableStream<Uint8Array> | null, size: number, offset = 0, length = size): ReadableStream<Uint8Array> {
  if (!body) throw new InputError('InfiniCLOUD returned an empty response.', 502);
  const reader = body.getReader();
  let position = 0;
  const sliced = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (position !== size) throw new InputError('The remote file changed during download. Retry the download.', 502);
            controller.close(); reader.releaseLock(); return;
          }
          const start = position; position += value.byteLength;
          if (position > size) throw new InputError('InfiniCLOUD returned an invalid file size.', 502);
          const part = value.subarray(Math.max(0, offset - start), Math.max(0, Math.min(value.length, offset + length - start)));
          if (part.length) controller.enqueue(part);
          if (offset + length < size && position >= offset + length) {
            controller.close(); await reader.cancel(); reader.releaseLock(); return;
          }
          if (part.length) return;
        }
      } catch (error) { controller.error(error); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    },
    async cancel(reason) { await reader.cancel(reason); reader.releaseLock(); },
  });
  // Workerd derives Content-Length from the stream, not a manually set header.
  const fixed = new FixedLengthStream(length);
  void sliced.pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
}
