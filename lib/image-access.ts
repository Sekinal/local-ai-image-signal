import type { ImageDescriptor } from './schema';

export function originPattern(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return `${parsed.origin}/*`;
  } catch {
    return null;
  }
}

export function requiredHostPattern(image: ImageDescriptor): string | null {
  const imageOrigin = originPattern(image.url);
  const pageOrigin = originPattern(image.pageUrl);
  return imageOrigin === pageOrigin ? null : imageOrigin;
}

export async function hasImageAccess(image: ImageDescriptor): Promise<boolean> {
  const origin = requiredHostPattern(image);
  return origin === null || chrome.permissions.contains({ origins: [origin] });
}

export async function requestImageAccess(images: ImageDescriptor[]): Promise<boolean> {
  const origins = [
    ...new Set(images.map(requiredHostPattern).filter((item): item is string => item !== null)),
  ];
  if (origins.length === 0) return true;
  return chrome.permissions.request({ origins });
}
