export type Settings = {
  threshold: number;
  autoScan: boolean;
  maxImages: number;
};

export const DEFAULT_SETTINGS: Settings = {
  threshold: 0.65,
  autoScan: true,
  maxImages: 24,
};

export function validateSettings(value: Partial<Settings>): Settings {
  const threshold = value.threshold ?? DEFAULT_SETTINGS.threshold;
  const maxImages = value.maxImages ?? DEFAULT_SETTINGS.maxImages;
  if (!(threshold >= 0.5 && threshold <= 0.95))
    throw new RangeError('Threshold must be from 0.50 to 0.95.');
  if (!Number.isInteger(maxImages) || maxImages < 1 || maxImages > 100) {
    throw new RangeError('Maximum images must be an integer from 1 to 100.');
  }
  return { threshold, autoScan: value.autoScan ?? DEFAULT_SETTINGS.autoScan, maxImages };
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return validateSettings(stored);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set(validateSettings(settings));
}
