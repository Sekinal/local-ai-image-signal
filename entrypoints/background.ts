import { collectVisiblePageImages, type PageImageCollection } from '../lib/collect-images';
import {
  assertJobBudget,
  contextKey,
  isActiveJob,
  isFreshActiveJobLease,
  jobKey,
  parseActiveJobLease,
  type ActiveJobLease,
} from '../lib/job-policy';
import {
  IDLE_JOB,
  imageDescriptorSchema,
  jobStateSchema,
  parseRuntimeMessage,
  type ImageDescriptor,
  type JobState,
} from '../lib/schema';

const ACTIVE_JOB_KEY = 'activeJobId';
const OFFSCREEN_PATH = 'offscreen.html';
let creatingOffscreen: Promise<void> | null = null;
let acceptingJob = false;

async function getJob(tabId: number): Promise<JobState> {
  const key = jobKey(tabId);
  const value = (await chrome.storage.session.get(key))[key];
  const parsed = jobStateSchema.safeParse(value);
  return parsed.success ? parsed.data : IDLE_JOB;
}

async function saveAndPublish(state: JobState): Promise<void> {
  if (!state.tabId) throw new Error('Job state is missing its tab identity.');
  await chrome.storage.session.set({ [jobKey(state.tabId)]: state });
  const active = parseActiveJobLease(
    (await chrome.storage.session.get(ACTIVE_JOB_KEY))[ACTIVE_JOB_KEY],
  );
  if (isActiveJob(state) && active?.jobId === state.jobId) {
    await chrome.storage.session.set({
      [ACTIVE_JOB_KEY]: { ...active, updatedAt: Date.now() } satisfies ActiveJobLease,
    });
  } else if (!isActiveJob(state) && active?.jobId === state.jobId) {
    await chrome.storage.session.remove(ACTIVE_JOB_KEY);
  }
  await chrome.runtime
    .sendMessage({ type: 'JOB_UPDATE', target: 'popup', state })
    .catch(() => undefined);
  await chrome.tabs
    .sendMessage(
      state.tabId,
      { type: 'JOB_UPDATE', target: 'content', state },
      {
        documentId: state.documentId,
      },
    )
    .catch(() => undefined);
}

async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (contexts.length > 0) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification:
        'Decode selected image blobs and run the packaged ONNX model without uploading image data.',
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;
}

async function reconcileActiveLease(): Promise<ActiveJobLease | null> {
  const lease = parseActiveJobLease(
    (await chrome.storage.session.get(ACTIVE_JOB_KEY))[ACTIVE_JOB_KEY],
  );
  if (!lease) {
    await chrome.storage.session.remove(ACTIVE_JOB_KEY);
    return null;
  }
  let alive = false;
  if (isFreshActiveJobLease(lease)) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
    });
    if (contexts.length > 0) {
      const status = (await chrome.runtime
        .sendMessage({ type: 'GET_OFFSCREEN_STATUS', target: 'offscreen' })
        .catch(() => ({ ok: false }))) as unknown as {
        ok?: boolean;
        activeJobId?: string | null;
      };
      alive = status.ok === true && status.activeJobId === lease.jobId;
    }
  }
  if (alive) return lease;

  await chrome.storage.session.remove(ACTIVE_JOB_KEY);
  const stale = await getJob(lease.tabId);
  if (stale.jobId === lease.jobId && isActiveJob(stale)) {
    await saveAndPublish({
      ...stale,
      status: 'error',
      currentImageId: null,
      message: 'The local analysis worker stopped unexpectedly. Start the analysis again.',
    });
  }
  return null;
}

async function collectImages(tabId: number): Promise<PageImageCollection> {
  const injection = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectVisiblePageImages,
    args: [100],
  });
  const result = injection[0]?.result;
  const documentId = injection[0]?.documentId;
  if (!result || !documentId)
    throw new Error('The page did not return an identified image inventory.');
  return { ...result, documentId };
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'analyze-ai-image-signal',
      title: 'Screen this image for AI signals',
      contexts: ['image'],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'analyze-ai-image-signal' || !info.srcUrl || !tab?.id) return;
    const image: ImageDescriptor = {
      id: `context-${Date.now()}`,
      url: info.srcUrl,
      kind: 'context-menu',
      width: 0,
      height: 0,
      alt: '',
      pageUrl: tab.url?.slice(0, 20_000) ?? '',
    };
    const key = contextKey(tab.id);
    void chrome.scripting
      .executeScript({ target: { tabId: tab.id }, func: () => location.href })
      .then(async (injection) => {
        const documentId = injection[0]?.documentId;
        if (!documentId) throw new Error('The selected image document is no longer available.');
        await chrome.storage.session.set({
          [key]: { image, documentId, createdAt: Date.now() },
        });
        await chrome.action.openPopup();
      })
      .catch(() => chrome.storage.session.remove(key));
  });

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const message = parseRuntimeMessage(raw);
    if (message?.target !== 'background') return false;

    void (async () => {
      if (message.type === 'GET_PAGE_IMAGES') {
        const collection = await collectImages(message.tabId);
        const key = contextKey(message.tabId);
        const contextRaw = (await chrome.storage.session.get(key))[key];
        const contextEnvelope = contextRaw as
          { image?: unknown; documentId?: unknown; createdAt?: unknown } | undefined;
        const context = imageDescriptorSchema.safeParse(contextEnvelope?.image);
        const fresh =
          typeof contextEnvelope?.createdAt === 'number' &&
          Date.now() - contextEnvelope.createdAt < 60_000;
        const samePage = context.success && context.data.pageUrl === collection.pageUrl;
        const sameDocument = contextEnvelope?.documentId === collection.documentId;
        if (context.success && fresh && samePage && sameDocument) {
          collection.images.unshift(context.data);
        }
        if (contextRaw !== undefined) await chrome.storage.session.remove(key);
        sendResponse({ ok: true, collection });
        return;
      }
      if (message.type === 'GET_JOB_STATE') {
        sendResponse({ ok: true, state: await getJob(message.tabId) });
        return;
      }
      if (message.type === 'START_ANALYSIS' || message.type === 'START_AUTOMATIC_ANALYSIS') {
        const automatic = message.type === 'START_AUTOMATIC_ANALYSIS';
        const tabId = automatic ? sender.tab?.id : message.tabId;
        const documentId = automatic ? sender.documentId : message.documentId;
        const pageUrl = automatic
          ? (sender.url ?? message.pageUrl).slice(0, 20_000)
          : message.pageUrl;
        const executionProvider = automatic ? 'auto' : (message.executionProvider ?? 'auto');
        if (!tabId || !documentId) {
          throw new Error('Automatic analysis requires an identified webpage document.');
        }
        if (acceptingJob) throw new Error('Another local analysis is already starting.');
        acceptingJob = true;
        let initialState: JobState | null = null;
        try {
          assertJobBudget(message.images);
          const active = await reconcileActiveLease();
          if (active) throw new Error('Another local analysis is already running.');
          await chrome.storage.session.set({
            [ACTIVE_JOB_KEY]: {
              jobId: message.jobId,
              tabId,
              updatedAt: Date.now(),
            } satisfies ActiveJobLease,
          });
          const state: JobState = {
            jobId: message.jobId,
            tabId,
            documentId,
            executionProvider: 'pending',
            pageUrl,
            status: 'loading-model',
            total: message.images.length,
            completed: 0,
            currentImageId: null,
            results: [],
            message: 'Preparing the local model…',
          };
          initialState = state;
          await saveAndPublish(state);
          await ensureOffscreen();
          const response: { ok?: boolean; error?: string } = await chrome.runtime.sendMessage({
            type: 'RUN_ANALYSIS',
            target: 'offscreen',
            state,
            images: message.images,
            threshold: message.threshold,
            executionProvider,
          });
          if (!response.ok)
            throw new Error(response.error ?? 'The local inference worker is busy.');
          sendResponse({ ok: true });
        } catch (error) {
          const active = parseActiveJobLease(
            (await chrome.storage.session.get(ACTIVE_JOB_KEY))[ACTIVE_JOB_KEY],
          );
          if (initialState) {
            await saveAndPublish({
              ...initialState,
              status: 'error',
              message:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : 'Could not start the local analysis.',
            });
          } else if (active?.jobId === message.jobId) {
            await chrome.storage.session.remove(ACTIVE_JOB_KEY);
          }
          throw error;
        } finally {
          acceptingJob = false;
        }
        return;
      }
      if (message.type === 'CANCEL_ANALYSIS') {
        const active = await reconcileActiveLease();
        if (active?.jobId !== message.jobId) throw new Error('That analysis is no longer active.');
        await ensureOffscreen();
        await chrome.runtime.sendMessage(message);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'JOB_UPDATE') {
        await saveAndPublish(message.state);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'CLOSE_OFFSCREEN') {
        const active = parseActiveJobLease(
          (await chrome.storage.session.get(ACTIVE_JOB_KEY))[ACTIVE_JOB_KEY],
        );
        if (!active) await chrome.offscreen.closeDocument().catch(() => undefined);
        sendResponse({ ok: true });
      }
    })().catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected extension error.',
      });
    });
    return true;
  });
});
