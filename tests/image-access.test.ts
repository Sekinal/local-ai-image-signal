import {
  hasImageAccess,
  originPattern,
  requestImageAccess,
  requiredHostPattern,
} from '../lib/image-access';
import type { ImageDescriptor } from '../lib/schema';
import { beforeEach, vi } from 'vitest';

const image: ImageDescriptor = {
  id: '1',
  url: 'https://cdn.example/path/image.jpg',
  kind: 'img',
  width: 100,
  height: 100,
  alt: '',
  pageUrl: 'https://page.example/',
};

beforeEach(() => vi.clearAllMocks());

describe('optional image-host access', () => {
  it('requests only exact origins and preserves denial', async () => {
    const requestMock = chrome.permissions.request as unknown as {
      mockResolvedValueOnce(value: boolean): void;
    };
    requestMock.mockResolvedValueOnce(false);
    await expect(requestImageAccess([image, { ...image, id: '2' }])).resolves.toBe(false);
    expect(chrome.permissions.request).toHaveBeenLastCalledWith({
      origins: ['https://cdn.example/*'],
    });
  });

  it('does not request host access for embedded data', async () => {
    await expect(
      requestImageAccess([{ ...image, url: 'data:image/png;base64,abc' }]),
    ).resolves.toBe(true);
  });

  it('uses activeTab instead of persistent permission for same-page images', async () => {
    const sameOrigin = {
      ...image,
      url: 'https://page.example/media/image.jpg',
    };
    expect(requiredHostPattern(sameOrigin)).toBeNull();
    await expect(requestImageAccess([sameOrigin])).resolves.toBe(true);
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('checks previously granted origins for auto-scan', async () => {
    const containsMock = chrome.permissions.contains as unknown as {
      mockResolvedValueOnce(value: boolean): void;
    };
    containsMock.mockResolvedValueOnce(true);
    await expect(hasImageAccess(image)).resolves.toBe(true);
    expect(originPattern(image.url)).toBe('https://cdn.example/*');
  });
});
