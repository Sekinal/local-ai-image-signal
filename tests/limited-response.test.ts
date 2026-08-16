// @vitest-environment node
import { responseBlobWithLimit } from '../lib/limited-response';

describe('bounded network reads', () => {
  it('rejects a declared oversized response before reading it', async () => {
    const response = new Response('small', { headers: { 'content-length': '100' } });
    await expect(responseBlobWithLimit(response, 10)).rejects.toThrow('local byte limit');
  });

  it('aborts an undeclared stream as soon as the accumulated limit is crossed', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(6));
          controller.enqueue(new Uint8Array(6));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'image/png' } },
    );
    await expect(responseBlobWithLimit(response, 10)).rejects.toThrow('local byte limit');
  });

  it('returns a bounded blob with the original MIME type', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
    });
    const blob = await responseBlobWithLimit(response, 10);
    expect(blob.size).toBe(3);
    expect(blob.type).toBe('image/png');
  });
});
