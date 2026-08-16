import type { ImageDescriptor } from './schema';

export type PageImageInventory = {
  pageUrl: string;
  images: ImageDescriptor[];
  skippedCanvas: number;
  skippedOversizedDataUrls: number;
};

export type PageImageCollection = PageImageInventory & { documentId: string };

/** Must remain self-contained: Chrome serializes this function for executeScript. */
export function collectVisiblePageImages(
  maxImages: number,
  limits: {
    maxDataUrlCharacters?: number;
    maxAggregateUrlCharacters?: number;
  } = {},
): PageImageInventory {
  const maxDataUrlCharacters = limits.maxDataUrlCharacters ?? 2_000_000;
  const maxAggregateUrlCharacters = limits.maxAggregateUrlCharacters ?? 5_000_000;
  const isVisible = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) > 0 &&
      rect.width > 1 &&
      rect.height > 1 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= innerHeight &&
      rect.left <= innerWidth
    );
  };
  const result: ImageDescriptor[] = [];
  const seen = new Set<string>();
  let skippedOversizedDataUrls = 0;
  let collectedUrlCharacters = 0;
  const add = (
    url: string,
    kind: ImageDescriptor['kind'],
    width: number,
    height: number,
    alt: string,
  ): void => {
    const resolved = (() => {
      try {
        return new URL(url, document.baseURI).href;
      } catch {
        return '';
      }
    })();
    if (!resolved || seen.has(resolved) || result.length >= maxImages) return;
    if (resolved.startsWith('data:') && resolved.length > maxDataUrlCharacters) {
      skippedOversizedDataUrls += 1;
      return;
    }
    if (collectedUrlCharacters + resolved.length > maxAggregateUrlCharacters) {
      skippedOversizedDataUrls += 1;
      return;
    }
    seen.add(resolved);
    collectedUrlCharacters += resolved.length;
    result.push({
      id: `page-${result.length}-${resolved.slice(-80)}`,
      url: resolved,
      kind,
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(height)),
      alt: alt.slice(0, 500),
      pageUrl: location.href.slice(0, 20_000),
    });
  };

  for (const image of document.images) {
    if (!isVisible(image)) continue;
    const rect = image.getBoundingClientRect();
    add(
      image.currentSrc || image.src,
      'img',
      image.naturalWidth || rect.width,
      image.naturalHeight || rect.height,
      image.alt.length > 0 ? image.alt : (image.getAttribute('aria-label') ?? ''),
    );
  }

  for (const element of document.querySelectorAll('body *')) {
    if (result.length >= maxImages || !isVisible(element)) continue;
    const background = getComputedStyle(element).backgroundImage;
    if (!background || background === 'none') continue;
    const rect = element.getBoundingClientRect();
    for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) {
      if (match[1])
        add(
          match[1],
          'background',
          rect.width,
          rect.height,
          element.getAttribute('aria-label') ?? '',
        );
    }
  }

  return {
    pageUrl: location.href.slice(0, 20_000),
    images: result,
    skippedCanvas: [...document.querySelectorAll('canvas')].filter(isVisible).length,
    skippedOversizedDataUrls,
  };
}
