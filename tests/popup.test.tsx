import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { PopupApp } from '../entrypoints/popup/PopupApp';
import { IDLE_JOB, type ImageDescriptor } from '../lib/schema';
import { DEFAULT_SETTINGS } from '../lib/settings';

const image: ImageDescriptor = {
  id: 'page-1',
  url: 'https://images.example/image.jpg',
  kind: 'img',
  width: 800,
  height: 600,
  alt: 'Fixture',
  pageUrl: 'https://page.example/',
};

type RuntimeMock = {
  sendMessage: ReturnType<typeof vi.fn>;
  openOptionsPage: ReturnType<typeof vi.fn>;
  onMessage: {
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
};

function installPopupChrome() {
  const sendMessage = vi.fn(async (value: unknown) => {
    const message = value as { type?: string };
    if (message.type === 'GET_JOB_STATE') return { ok: true, state: IDLE_JOB };
    if (message.type === 'GET_PAGE_IMAGES') {
      return {
        ok: true,
        collection: {
          documentId: 'document-1',
          pageUrl: image.pageUrl,
          images: [image],
          skippedCanvas: 0,
          skippedOversizedDataUrls: 0,
        },
      };
    }
    return { ok: true };
  });
  const runtime: RuntimeMock = {
    sendMessage,
    openOptionsPage: vi.fn(async () => undefined),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  Object.assign(chrome, {
    runtime,
    tabs: { query: vi.fn(async () => [{ id: 42, url: image.pageUrl }]) },
  });
  const localGet = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
  localGet.mockResolvedValue({ ...DEFAULT_SETTINGS, autoScan: false });
  return { runtime, localGet };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('popup orchestration', () => {
  it('initializes only once when async settings state resolves', async () => {
    const { runtime } = installPopupChrome();
    render(<PopupApp />);
    await screen.findByText('1 visible image found.');
    await Promise.resolve();
    expect(chrome.tabs.query).toHaveBeenCalledOnce();
    expect(
      runtime.sendMessage.mock.calls.filter(
        ([message]) => (message as { type?: string }).type === 'GET_PAGE_IMAGES',
      ),
    ).toHaveLength(1);
  });

  it('does not start when image-host permission is denied', async () => {
    const { runtime } = installPopupChrome();
    const request = chrome.permissions.request as unknown as ReturnType<typeof vi.fn>;
    request.mockResolvedValueOnce(false);
    render(<PopupApp />);
    await screen.findByText('1 visible image found.');
    fireEvent.click(screen.getByRole('button', { name: /Analyze 1 selected locally/ }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('access was not granted');
    expect(
      runtime.sendMessage.mock.calls.some(
        ([message]) => (message as { type?: string }).type === 'START_ANALYSIS',
      ),
    ).toBe(false);
  });

  it('does not duplicate automatic content-script analysis when the popup opens', async () => {
    const { runtime, localGet } = installPopupChrome();
    localGet.mockResolvedValueOnce({ ...DEFAULT_SETTINGS, autoScan: true });
    render(<PopupApp />);
    await screen.findByText('1 visible image found.');
    expect(
      runtime.sendMessage.mock.calls.some(
        ([message]) => (message as { type?: string }).type === 'START_ANALYSIS',
      ),
    ).toBe(false);
  });

  it('ignores results from a replaced same-URL document', async () => {
    const { runtime } = installPopupChrome();
    render(<PopupApp />);
    await screen.findByText('1 visible image found.');
    const listener = runtime.onMessage.addListener.mock.calls[0]?.[0] as
      ((message: unknown) => void) | undefined;
    if (!listener) throw new Error('Popup message listener was not registered.');
    listener({
      type: 'JOB_UPDATE',
      target: 'popup',
      state: {
        ...IDLE_JOB,
        jobId: 'stale-job',
        tabId: 42,
        documentId: 'replaced-document',
        pageUrl: image.pageUrl,
        status: 'complete',
        total: 1,
        completed: 1,
        results: [
          {
            image,
            status: 'complete',
            rawLogit: 2,
            score: 0.78,
            label: 'stronger-signal',
            certainty: 'moderate',
          },
        ],
      },
    });
    expect(screen.queryByText('Stronger AI signal')).not.toBeInTheDocument();
  });
});
