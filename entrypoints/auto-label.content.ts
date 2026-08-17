import { parseRuntimeMessage, type AnalysisResult, type ImageDescriptor } from '../lib/schema';
import { getSettings } from '../lib/settings';

type Entry = {
  id: string;
  url: string;
  descriptor: ImageDescriptor;
  elements: Set<HTMLElement>;
  result?: AnalysisResult;
};

type BackgroundResponse = { ok: true } | { ok: false; error: string };

const MIN_DISPLAY_EDGE = 48;
const RETRY_DELAY_MS = 2_000;

function usableImageUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, document.baseURI);
    return ['http:', 'https:', 'data:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function visibleSize(element: HTMLElement): { width: number; height: number } | null {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity) <= 0 ||
    rect.width < MIN_DISPLAY_EDGE ||
    rect.height < MIN_DISPLAY_EDGE
  ) {
    return null;
  }
  const image = element instanceof HTMLImageElement ? element : null;
  return {
    width: Math.max(
      0,
      Math.round(image && image.naturalWidth > 0 ? image.naturalWidth : rect.width),
    ),
    height: Math.max(
      0,
      Math.round(image && image.naturalHeight > 0 ? image.naturalHeight : rect.height),
    ),
  };
}

function firstBackgroundUrl(element: HTMLElement): string | null {
  const background = getComputedStyle(element).backgroundImage;
  if (!background || background === 'none') return null;
  return /url\(["']?(.*?)["']?\)/.exec(background)?.[1] ?? null;
}

const OVERLAY_HOST_STYLE = [
  'all: initial !important',
  'display: block !important',
  'visibility: visible !important',
  'opacity: 1 !important',
  'position: fixed !important',
  'inset: 0 !important',
  'width: 0 !important',
  'height: 0 !important',
  'z-index: 2147483647 !important',
  'pointer-events: none !important',
].join('; ');

function createOverlayRoot(): ShadowRoot {
  const host = document.createElement('div');
  host.setAttribute('style', OVERLAY_HOST_STYLE);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .signal-badge {
      position: fixed;
      max-width: 220px;
      padding: 5px 8px;
      border: 1px solid rgba(255, 255, 255, .82);
      border-radius: 999px;
      box-shadow: 0 2px 10px rgba(15, 23, 42, .28);
      color: #fff;
      background: #334155;
      font: 700 12px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: .01em;
      white-space: nowrap;
      pointer-events: none;
    }
    .signal-badge[data-tone="strong"] { background: #b42318; }
    .signal-badge[data-tone="weak"] { background: #047857; }
    .signal-badge[data-tone="error"] { background: #475467; }
    @media (forced-colors: active) {
      .signal-badge { border: 2px solid CanvasText; background: Canvas; color: CanvasText; }
    }
  `;
  shadow.append(style);
  const enforceOverlayHost = () => {
    if (!host.isConnected) document.documentElement.append(host);
    if (host.getAttribute('style') !== OVERLAY_HOST_STYLE) {
      host.setAttribute('style', OVERLAY_HOST_STYLE);
    }
  };
  enforceOverlayHost();
  new MutationObserver(enforceOverlayHost).observe(document.documentElement, {
    childList: true,
  });
  new MutationObserver(enforceOverlayHost).observe(host, {
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style'],
  });
  return shadow;
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    void initializeAutomaticLabels();
  },
});

async function initializeAutomaticLabels(): Promise<void> {
  let settings = await getSettings();

  const shadow = createOverlayRoot();
  const entriesByUrl = new Map<string, Entry>();
  const elementUrl = new WeakMap<HTMLElement, string>();
  const badges = new Map<HTMLElement, HTMLElement>();
  const pending = new Map<string, ImageDescriptor>();
  let activeJobId: string | null = null;
  let activeBatch: ImageDescriptor[] = [];
  let flushTimer: number | null = null;
  let positionFrame: number | null = null;
  let sequence = 0;

  const schedulePositions = () => {
    if (positionFrame !== null) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      for (const [image, badge] of badges) {
        if (!image.isConnected) {
          badge.remove();
          badges.delete(image);
          continue;
        }
        const rect = image.getBoundingClientRect();
        const onScreen =
          rect.width > 1 &&
          rect.height > 1 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= innerHeight &&
          rect.left <= innerWidth;
        badge.hidden = !onScreen;
        if (onScreen) {
          badge.style.left = `${Math.max(4, rect.left + 4)}px`;
          badge.style.top = `${Math.max(4, rect.top + 4)}px`;
        }
      }
    });
  };

  const render = (entry: Entry, text: string, tone: 'pending' | 'strong' | 'weak' | 'error') => {
    for (const image of entry.elements) {
      let badge = badges.get(image);
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'signal-badge';
        badge.setAttribute('role', 'status');
        badge.dataset.imageSignalId = entry.id;
        shadow.append(badge);
        badges.set(image, badge);
      }
      badge.dataset.tone = tone;
      badge.textContent = text;
      badge.title =
        tone === 'strong' || tone === 'weak'
          ? 'Calibrated model score; this is a fallible screening signal, not proof.'
          : text;
    }
    schedulePositions();
  };

  const applyResult = (result: AnalysisResult) => {
    const entry = [...entriesByUrl.values()].find((candidate) => candidate.id === result.image.id);
    if (!entry) return;
    entry.result = result;
    if (result.status === 'complete' && result.score !== undefined && result.label) {
      const percent = Math.round(result.score * 100);
      render(entry, `AI score ${percent}%`, result.label === 'stronger-signal' ? 'strong' : 'weak');
    } else if (result.status === 'error') {
      render(entry, 'AI score unavailable', 'error');
    }
  };

  const flush = async () => {
    flushTimer = null;
    if (activeJobId || pending.size === 0 || !settings.autoScan) return;
    const batch = [...pending.values()].slice(0, settings.maxImages);
    for (const image of batch) pending.delete(image.id);
    const jobId = `auto-${crypto.randomUUID()}`;
    activeJobId = jobId;
    activeBatch = batch;
    for (const descriptor of batch) {
      const entry = entriesByUrl.get(descriptor.url);
      if (entry) render(entry, 'Analyzing locally…', 'pending');
    }
    try {
      const response: BackgroundResponse = await chrome.runtime.sendMessage({
        type: 'START_AUTOMATIC_ANALYSIS',
        target: 'background',
        jobId,
        pageUrl: location.href.slice(0, 20_000),
        images: batch,
        threshold: settings.threshold,
      });
      if (!response.ok) throw new Error(response.error);
    } catch {
      activeJobId = null;
      activeBatch = [];
      for (const descriptor of batch) pending.set(descriptor.id, descriptor);
      window.setTimeout(() => scheduleFlush(), RETRY_DELAY_MS);
    }
  };

  const scheduleFlush = () => {
    if (flushTimer !== null || activeJobId || pending.size === 0) return;
    flushTimer = window.setTimeout(() => void flush(), 250);
  };

  const register = (element: HTMLElement, rawUrl: string, kind: ImageDescriptor['kind']) => {
    if (!settings.autoScan) return;
    const url = usableImageUrl(rawUrl);
    const dimensions = visibleSize(element);
    if (!url || !dimensions) return;
    const previousUrl = elementUrl.get(element);
    if (previousUrl === url) {
      const existing = entriesByUrl.get(url);
      if (!existing) return;
      existing.elements.add(element);
      if (existing.result) applyResult(existing.result);
      else pending.set(existing.id, existing.descriptor);
      scheduleFlush();
      return;
    }
    if (previousUrl) {
      entriesByUrl.get(previousUrl)?.elements.delete(element);
      badges.get(element)?.remove();
      badges.delete(element);
    }
    elementUrl.set(element, url);

    let entry = entriesByUrl.get(url);
    if (!entry) {
      const id = `auto-${sequence++}-${crypto.randomUUID().slice(0, 12)}`;
      entry = {
        id,
        url,
        elements: new Set(),
        descriptor: {
          id,
          url,
          kind,
          width: dimensions.width,
          height: dimensions.height,
          alt: (element instanceof HTMLImageElement && element.alt.trim().length > 0
            ? element.alt
            : (element.getAttribute('aria-label') ?? '')
          ).slice(0, 500),
          pageUrl: location.href.slice(0, 20_000),
        },
      };
      entriesByUrl.set(url, entry);
      pending.set(id, entry.descriptor);
    }
    entry.elements.add(element);
    if (entry.result) applyResult(entry.result);
    scheduleFlush();
  };

  const intersection = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting || !(record.target instanceof HTMLElement)) continue;
        if (record.target instanceof HTMLImageElement) {
          register(record.target, record.target.currentSrc || record.target.src, 'img');
        } else {
          const backgroundUrl = firstBackgroundUrl(record.target);
          if (backgroundUrl) register(record.target, backgroundUrl, 'background');
        }
      }
    },
    { rootMargin: '240px' },
  );

  const observeImage = (image: HTMLImageElement) => {
    intersection.observe(image);
    image.addEventListener('load', () => register(image, image.currentSrc || image.src, 'img'), {
      once: true,
    });
  };

  const observedBackgrounds = new WeakSet<HTMLElement>();
  const observeBackground = (element: HTMLElement) => {
    if (observedBackgrounds.has(element) || !firstBackgroundUrl(element)) return;
    observedBackgrounds.add(element);
    intersection.observe(element);
  };

  const scanBackgrounds = (root: ParentNode) => {
    const elements = root.querySelectorAll<HTMLElement>('body *, [style], [class]');
    for (const element of [...elements].slice(0, 2_000)) observeBackground(element);
  };

  const rescanExistingContent = () => {
    for (const image of document.images) {
      register(image, image.currentSrc || image.src, 'img');
    }
    const elements = document.querySelectorAll<HTMLElement>('body *, [style], [class]');
    for (const element of [...elements].slice(0, 2_000)) {
      const backgroundUrl = firstBackgroundUrl(element);
      if (backgroundUrl) register(element, backgroundUrl, 'background');
    }
  };

  for (const image of document.images) observeImage(image);
  scanBackgrounds(document);
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLImageElement) {
        observeImage(record.target);
      } else if (record.type === 'attributes' && record.target instanceof HTMLElement) {
        observeBackground(record.target);
        const backgroundUrl = firstBackgroundUrl(record.target);
        if (backgroundUrl) register(record.target, backgroundUrl, 'background');
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLImageElement) observeImage(node);
        for (const image of node.querySelectorAll('img')) observeImage(image);
        if (node instanceof HTMLElement) observeBackground(node);
        scanBackgrounds(node);
      }
    }
  });
  mutations.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'class', 'style'],
  });

  chrome.runtime.onMessage.addListener((raw) => {
    const message = parseRuntimeMessage(raw);
    if (message?.type !== 'JOB_UPDATE' || message.target !== 'content') return false;
    if (message.state.jobId !== activeJobId) return false;
    if (settings.autoScan) {
      for (const result of message.state.results) applyResult(result);
    }
    if (['complete', 'cancelled', 'error'].includes(message.state.status)) {
      if (settings.autoScan) {
        for (const descriptor of activeBatch) {
          const entry = entriesByUrl.get(descriptor.url);
          if (entry && !entry.result) render(entry, 'AI score unavailable', 'error');
        }
      }
      activeJobId = null;
      activeBatch = [];
      scheduleFlush();
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const next = changes.autoScan?.newValue;
    if (typeof next === 'boolean') {
      settings = { ...settings, autoScan: next };
      if (!next) {
        for (const badge of badges.values()) badge.remove();
        badges.clear();
        pending.clear();
      } else {
        rescanExistingContent();
        scheduleFlush();
      }
    }
    const threshold = changes.threshold?.newValue;
    const maxImages = changes.maxImages?.newValue;
    if (typeof threshold === 'number') settings = { ...settings, threshold };
    if (typeof maxImages === 'number') settings = { ...settings, maxImages };
  });

  addEventListener('scroll', schedulePositions, { passive: true, capture: true });
  addEventListener('resize', schedulePositions, { passive: true });
}
