import type { ImageDescriptor, JobState } from './schema';

export const MAX_JOB_URL_CHARACTERS = 5_000_000;
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
export const MAX_DECODED_PIXELS = 20_000_000;
export const MAX_DECODED_DIMENSION = 8192;
export const MAX_ASPECT_RATIO = 24;
export const MAX_RESIZE_WORK_PIXELS = 12_000_000;
export const ACTIVE_JOB_LEASE_MS = 30 * 60 * 1000;

export type ActiveJobLease = {
  jobId: string;
  tabId: number;
  updatedAt: number;
};

export function parseActiveJobLease(value: unknown): ActiveJobLease | null {
  if (!value || typeof value !== 'object') return null;
  const lease = value as Partial<ActiveJobLease>;
  if (
    typeof lease.jobId !== 'string' ||
    lease.jobId.length === 0 ||
    lease.jobId.length > 100 ||
    !Number.isInteger(lease.tabId) ||
    (lease.tabId ?? 0) <= 0 ||
    typeof lease.updatedAt !== 'number' ||
    !Number.isFinite(lease.updatedAt)
  )
    return null;
  return lease as ActiveJobLease;
}

export function isFreshActiveJobLease(lease: ActiveJobLease, now = Date.now()): boolean {
  return lease.updatedAt <= now && now - lease.updatedAt <= ACTIVE_JOB_LEASE_MS;
}

export function assertJobBudget(images: ImageDescriptor[]): void {
  const urlCharacters = images.reduce(
    (total, image) => total + image.url.length + image.pageUrl.length,
    0,
  );
  if (urlCharacters > MAX_JOB_URL_CHARACTERS) {
    throw new RangeError(
      'Selected image metadata exceeds the 5 MB analysis limit. Choose fewer embedded images.',
    );
  }
}

export function compactImageForState(image: ImageDescriptor): ImageDescriptor {
  const embedded = image.url.startsWith('data:') || image.url.startsWith('blob:');
  return {
    ...image,
    url: embedded ? 'data:local-image-redacted' : image.url.slice(0, 20_000),
    pageUrl: image.pageUrl.slice(0, 2_000),
  };
}

export function isActiveJob(state: JobState): boolean {
  return state.status === 'loading-model' || state.status === 'running';
}

export function jobKey(tabId: number): string {
  return `currentJob:${tabId}`;
}

export function contextKey(tabId: number): string {
  return `contextImage:${tabId}`;
}

export function assertImageDimensions(width: number, height: number): void {
  const pixels = width * height;
  const aspect = Math.max(width / height, height / width);
  if (!Number.isFinite(pixels) || pixels > MAX_DECODED_PIXELS) {
    throw new RangeError('Decoded image dimensions exceed the 20-megapixel safety limit.');
  }
  if (width > MAX_DECODED_DIMENSION || height > MAX_DECODED_DIMENSION) {
    throw new RangeError('Decoded image dimensions exceed the 8192-pixel canvas limit.');
  }
  if (!Number.isFinite(aspect) || aspect > MAX_ASPECT_RATIO) {
    throw new RangeError('Extreme-aspect-ratio images are not supported.');
  }
}

export function assertResizeWork(width: number, height: number): void {
  if (width * height > MAX_RESIZE_WORK_PIXELS) {
    throw new RangeError('Resizing this image would exceed the local processing safety limit.');
  }
}
