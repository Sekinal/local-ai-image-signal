import { MAX_SOURCE_BYTES } from './job-policy';

export async function responseBlobWithLimit(
  response: Response,
  maximumBytes = MAX_SOURCE_BYTES,
): Promise<Blob> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maximumBytes) throw new RangeError('Image is larger than the local byte limit.');
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > maximumBytes)
      throw new RangeError('Image is larger than the local byte limit.');
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel('Response exceeds local byte limit.');
      throw new RangeError('Image is larger than the local byte limit.');
    }
    chunks.push(new Uint8Array(value));
  }
  return new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
}
