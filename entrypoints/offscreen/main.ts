import * as ort from 'onnxruntime-web/webgpu';
import { assertImageDimensions, compactImageForState } from '../../lib/job-policy';
import { responseBlobWithLimit } from '../../lib/limited-response';
import { classifyScore, calibratedScore, MODEL, scoreCertainty } from '../../lib/model';
import { bitmapToModelInput } from '../../lib/preprocess';
import {
  parseRuntimeMessage,
  type AnalysisResult,
  type ImageDescriptor,
  type JobState,
} from '../../lib/schema';

let sessionPromise: Promise<ort.InferenceSession> | null = null;
const cancelledJobs = new Set<string>();
let activeJobId: string | null = null;
let selectedProvider: 'webgpu' | 'wasm' = 'wasm';

async function getSession(forceWasm: boolean): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const modelUrl = chrome.runtime.getURL(`models/${MODEL.file}`);
    if (!forceWasm && 'gpu' in navigator) {
      try {
        const session = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ['webgpu', 'wasm'],
          graphOptimizationLevel: 'all',
        });
        selectedProvider = 'webgpu';
        return session;
      } catch (error) {
        console.warn('WebGPU initialization failed; retrying with local WASM.', error);
      }
    }
    selectedProvider = 'wasm';
    return ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  })().catch((error: unknown) => {
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

async function publish(state: JobState): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'JOB_UPDATE', target: 'background', state });
}

async function closeSession(): Promise<void> {
  const current = sessionPromise;
  sessionPromise = null;
  if (!current) return;
  try {
    await (await current).release();
  } catch {
    // A failed or lost runtime may already be released by the browser.
  }
}

async function decode(url: string): Promise<{ bitmap: ImageBitmap; bytes: number }> {
  if (url.startsWith('blob:'))
    throw new DOMException('Page-scoped blob URLs cannot be read here.', 'NotSupportedError');
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'force-cache',
  });
  if (!response.ok) throw new Error(`Image request returned HTTP ${response.status}.`);
  const blob = await responseBlobWithLimit(response);
  if (blob.type && !blob.type.startsWith('image/'))
    throw new TypeError(`Unsupported response type: ${blob.type}`);
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    assertImageDimensions(bitmap.width, bitmap.height);
  } catch (error) {
    bitmap.close();
    throw error;
  }
  return { bitmap, bytes: blob.size };
}

function errorResult(image: JobState['results'][number]['image'], error: unknown): AnalysisResult {
  const message = error instanceof Error ? error.message : 'Image analysis failed.';
  const lower = message.toLowerCase();
  const errorCode =
    error instanceof RangeError
      ? 'unsupported'
      : error instanceof DOMException && error.name === 'NotSupportedError'
        ? 'unsupported'
        : lower.includes('failed to fetch') ||
            lower.includes('http 401') ||
            lower.includes('http 403')
          ? 'permission-needed'
          : lower.includes('decode') || lower.includes('image')
            ? 'decode'
            : 'inference';
  return {
    image: compactImageForState(image),
    status: 'error',
    errorCode,
    warning: message.slice(0, 500),
  };
}

async function analyzeJob(
  initial: JobState,
  images: ImageDescriptor[],
  threshold: number,
  forceWasm: boolean,
): Promise<void> {
  const jobId = initial.jobId;
  if (!jobId) return;
  let state = { ...initial };
  try {
    const session = await getSession(forceWasm);
    state = {
      ...state,
      executionProvider: selectedProvider,
      status: 'running',
      message: 'Analyzing locally…',
    };
    await publish(state);
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName)
      throw new Error('The packaged model has an unexpected input/output contract.');

    for (const image of images) {
      if (cancelledJobs.has(jobId)) break;
      state = {
        ...state,
        currentImageId: image.id,
        message: `Analyzing ${state.completed + 1} of ${state.total}…`,
      };
      await publish(state);
      const started = performance.now();
      let result: AnalysisResult;
      try {
        const { bitmap } = await decode(image.url);
        const tiny = Math.min(bitmap.width, bitmap.height) < 96;
        if (Math.min(bitmap.width, bitmap.height) < 16) {
          bitmap.close();
          result = {
            image: compactImageForState(image),
            status: 'error',
            errorCode: 'tiny',
            warning: 'Image is too small to analyze meaningfully.',
          };
        } else {
          let prepared: ReturnType<typeof bitmapToModelInput>;
          try {
            prepared = bitmapToModelInput(bitmap);
          } finally {
            bitmap.close();
          }
          const outputs = await session.run({
            [inputName]: new ort.Tensor('float32', prepared.tensor, [1, 3, 384, 384]),
          });
          const output = outputs[outputName];
          const rawLogit = Number(output?.data[0]);
          if (!Number.isFinite(rawLogit)) throw new Error('The model returned a non-finite score.');
          const score = calibratedScore(rawLogit);
          result = {
            image: compactImageForState(image),
            status: 'complete',
            rawLogit,
            score,
            label: classifyScore(score, threshold),
            certainty: scoreCertainty(score, threshold),
            elapsedMs: performance.now() - started,
            ...((tiny || prepared.hasTransparency) && {
              warning: [
                tiny ? 'Very low resolution; this detector is unreliable on tiny images.' : '',
                prepared.hasTransparency
                  ? 'Transparency can change decoded colors; interpret this score cautiously.'
                  : '',
              ]
                .filter(Boolean)
                .join(' '),
            }),
          };
        }
      } catch (error) {
        result = errorResult(image, error);
      }
      state = { ...state, completed: state.completed + 1, results: [...state.results, result] };
      await publish(state);
    }
    const cancelled = cancelledJobs.delete(jobId);
    state = {
      ...state,
      status: cancelled ? 'cancelled' : 'complete',
      currentImageId: null,
      message: cancelled ? 'Analysis cancelled.' : 'Local analysis complete.',
    };
    await publish(state);
  } catch (error) {
    state = {
      ...state,
      status: 'error',
      currentImageId: null,
      message:
        error instanceof Error ? error.message.slice(0, 500) : 'Model initialization failed.',
    };
    await publish(state);
  } finally {
    cancelledJobs.delete(jobId);
    activeJobId = null;
    await closeSession();
    await chrome.runtime
      .sendMessage({ type: 'CLOSE_OFFSCREEN', target: 'background', jobId })
      .catch(() => undefined);
  }
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = parseRuntimeMessage(raw);
  if (message?.target !== 'offscreen') return false;
  if (message.type === 'GET_OFFSCREEN_STATUS') {
    sendResponse({ ok: true, activeJobId });
    return false;
  }
  if (message.type === 'CANCEL_ANALYSIS') {
    cancelledJobs.add(message.jobId);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'RUN_ANALYSIS' && message.state.jobId) {
    if (activeJobId) {
      sendResponse({ ok: false, error: 'Another local analysis is already running.' });
      return false;
    }
    activeJobId = message.state.jobId;
    void analyzeJob(
      message.state,
      message.images,
      message.threshold,
      message.executionProvider === 'wasm',
    );
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
