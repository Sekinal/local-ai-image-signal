import { parseRuntimeMessage, runtimeMessageSchema } from '../lib/schema';

const image = {
  id: 'image-1',
  url: 'https://example.com/image.jpg',
  kind: 'img' as const,
  width: 800,
  height: 600,
  alt: 'Example',
  pageUrl: 'https://example.com/',
};

describe('runtime message boundary', () => {
  it('accepts a bounded start request', () => {
    expect(
      runtimeMessageSchema.parse({
        type: 'START_ANALYSIS',
        target: 'background',
        jobId: 'job-1',
        tabId: 7,
        documentId: 'document-1',
        pageUrl: 'https://example.com/',
        images: [image],
        threshold: 0.65,
      }),
    ).toBeTruthy();
  });

  it('rejects unknown targets and out-of-range thresholds', () => {
    expect(
      parseRuntimeMessage({
        type: 'START_ANALYSIS',
        target: 'page',
        jobId: 'job-1',
        tabId: 7,
        documentId: 'document-1',
        pageUrl: 'https://example.com/',
        images: [image],
        threshold: 1,
      }),
    ).toBeNull();
  });

  it('limits jobs to 100 images', () => {
    expect(
      parseRuntimeMessage({
        type: 'START_ANALYSIS',
        target: 'background',
        jobId: 'job-1',
        tabId: 7,
        documentId: 'document-1',
        pageUrl: 'https://example.com/',
        images: Array.from({ length: 101 }, (_, index) => ({ ...image, id: `image-${index}` })),
        threshold: 0.65,
      }),
    ).toBeNull();
  });

  it('accepts automatic content-script analysis without trusting tab identity from the page', () => {
    expect(
      runtimeMessageSchema.parse({
        type: 'START_AUTOMATIC_ANALYSIS',
        target: 'background',
        jobId: 'auto-job-1',
        pageUrl: 'https://example.com/',
        images: [image],
        threshold: 0.65,
      }),
    ).toBeTruthy();
  });
});
