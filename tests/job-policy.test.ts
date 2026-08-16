import {
  assertImageDimensions,
  assertJobBudget,
  assertResizeWork,
  compactImageForState,
  contextKey,
  isActiveJob,
  isFreshActiveJobLease,
  jobKey,
  parseActiveJobLease,
} from '../lib/job-policy';
import { IDLE_JOB, type ImageDescriptor } from '../lib/schema';

const image: ImageDescriptor = {
  id: 'image',
  url: 'https://images.example/image.jpg',
  kind: 'img',
  width: 1000,
  height: 800,
  alt: '',
  pageUrl: 'https://page.example/',
};

describe('job and resource policy', () => {
  it('keys transient state by tab and classifies active jobs', () => {
    expect(jobKey(42)).toBe('currentJob:42');
    expect(contextKey(42)).toBe('contextImage:42');
    expect(isActiveJob({ ...IDLE_JOB, status: 'running' })).toBe(true);
    expect(isActiveJob({ ...IDLE_JOB, status: 'complete' })).toBe(false);
  });

  it('rejects malformed and expired active-job leases', () => {
    expect(parseActiveJobLease('old-format-job-id')).toBeNull();
    expect(parseActiveJobLease({ jobId: 'job', tabId: 0, updatedAt: 10 })).toBeNull();
    const lease = parseActiveJobLease({ jobId: 'job', tabId: 42, updatedAt: 1_000 });
    expect(lease).not.toBeNull();
    if (!lease) throw new Error('Expected a valid lease fixture.');
    expect(isFreshActiveJobLease(lease, 1_000 + 30 * 60 * 1000)).toBe(true);
    expect(isFreshActiveJobLease(lease, 1_001 + 30 * 60 * 1000)).toBe(false);
    expect(isFreshActiveJobLease(lease, 999)).toBe(false);
  });

  it('rejects aggregate embedded metadata before messaging or persistence', () => {
    expect(() =>
      assertJobBudget([{ ...image, url: `data:image/png;base64,${'a'.repeat(5_000_000)}` }]),
    ).toThrow('5 MB analysis limit');
  });

  it('redacts embedded bytes from persisted result state', () => {
    const compact = compactImageForState({ ...image, url: 'data:image/png;base64,secret-pixels' });
    expect(compact.url).toBe('data:local-image-redacted');
    expect(JSON.stringify(compact)).not.toContain('secret-pixels');
  });

  it('bounds decoded dimensions, aspect ratio, and resize work', () => {
    expect(() => assertImageDimensions(4000, 4000)).not.toThrow();
    expect(() => assertImageDimensions(5000, 5000)).toThrow('20-megapixel');
    expect(() => assertImageDimensions(8193, 2000)).toThrow('8192-pixel canvas');
    expect(() => assertImageDimensions(2401, 100)).toThrow('Extreme-aspect-ratio');
    expect(() => assertResizeWork(4000, 4000)).toThrow('processing safety limit');
  });
});
