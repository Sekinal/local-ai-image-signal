import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePicker } from '../../components/ImagePicker';
import { ResultCard } from '../../components/ResultCard';
import { requestImageAccess } from '../../lib/image-access';
import {
  IDLE_JOB,
  parseRuntimeMessage,
  type AnalysisResult,
  type ImageDescriptor,
  type JobState,
} from '../../lib/schema';
import { getSettings, type Settings } from '../../lib/settings';
import type { PageImageCollection } from '../../lib/collect-images';

type BackgroundResponse<T> = ({ ok: true } & T) | { ok: false; error: string };

async function send<T>(message: unknown): Promise<T> {
  const response: BackgroundResponse<T> = await chrome.runtime.sendMessage(message);
  if (!response.ok) throw new Error(response.error);
  return response;
}

export function PopupApp() {
  const [images, setImages] = useState<ImageDescriptor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<JobState>(IDLE_JOB);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pageNote, setPageNote] = useState('Looking for visible images…');
  const [error, setError] = useState('');
  const settingsRef = useRef<Settings | null>(null);
  const tabRef = useRef<{ tabId: number; documentId: string; pageUrl: string } | null>(null);
  const busy = job.status === 'loading-model' || job.status === 'running';

  const start = useCallback(
    async (
      chosen: ImageDescriptor[],
      requestAccess = true,
      effectiveSettings: Settings | null = settingsRef.current,
    ) => {
      if (!effectiveSettings || chosen.length === 0) return;
      setError('');
      try {
        const tab = tabRef.current;
        if (!tab) throw new Error('The active tab is no longer available.');
        if (requestAccess) {
          const granted = await requestImageAccess(chosen);
          if (!granted) throw new Error('Image-host access was not granted. No analysis started.');
        }
        const jobId = crypto.randomUUID();
        await send({
          type: 'START_ANALYSIS',
          target: 'background',
          jobId,
          tabId: tab.tabId,
          documentId: tab.documentId,
          pageUrl: tab.pageUrl,
          images: chosen.slice(0, effectiveSettings.maxImages),
          threshold: effectiveSettings.threshold,
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not start analysis.');
      }
    },
    [],
  );

  useEffect(() => {
    const listener = (raw: unknown) => {
      const message = parseRuntimeMessage(raw);
      if (
        message?.type === 'JOB_UPDATE' &&
        message.target === 'popup' &&
        message.state.tabId === tabRef.current?.tabId &&
        message.state.documentId === tabRef.current.documentId &&
        message.state.pageUrl === tabRef.current.pageUrl
      ) {
        setJob(message.state);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    void (async () => {
      try {
        const [currentSettings, tabs] = await Promise.all([
          getSettings(),
          chrome.tabs.query({ active: true, currentWindow: true }),
        ]);
        settingsRef.current = currentSettings;
        setSettings(currentSettings);
        const tabId = tabs[0]?.id;
        if (!tabId) throw new Error('No active tab is available.');
        const pageUrl = tabs[0]?.url?.slice(0, 20_000) ?? '';
        tabRef.current = { tabId, documentId: '', pageUrl };
        const [stateResponse, { collection }] = await Promise.all([
          send<{ state: JobState }>({ type: 'GET_JOB_STATE', target: 'background', tabId }),
          send<{ collection: PageImageCollection }>({
            type: 'GET_PAGE_IMAGES',
            target: 'background',
            tabId,
          }),
        ]);
        tabRef.current = {
          tabId,
          documentId: collection.documentId,
          pageUrl: collection.pageUrl,
        };
        const stateMatches =
          stateResponse.state.tabId === tabId &&
          stateResponse.state.documentId === collection.documentId &&
          stateResponse.state.pageUrl === collection.pageUrl;
        setJob(stateMatches ? stateResponse.state : IDLE_JOB);
        const limited = collection.images.slice(0, currentSettings.maxImages);
        setImages(limited);
        const context = limited.filter((image) => image.kind === 'context-menu');
        setSelected(new Set((context.length > 0 ? context : limited).map((image) => image.id)));
        const notes = [
          `${limited.length} visible image${limited.length === 1 ? '' : 's'} found`,
          collection.skippedCanvas
            ? `${collection.skippedCanvas} canvas element${collection.skippedCanvas === 1 ? '' : 's'} cannot be inspected`
            : '',
          collection.skippedOversizedDataUrls
            ? `${collection.skippedOversizedDataUrls} oversized embedded image${collection.skippedOversizedDataUrls === 1 ? '' : 's'} skipped`
            : '',
        ].filter(Boolean);
        setPageNote(`${notes.join(' · ')}.`);
      } catch (caught) {
        setPageNote(
          'This page cannot be inspected. Chrome internal pages and the Web Store block extension scripts.',
        );
        setError(caught instanceof Error ? caught.message : 'Could not inspect the active page.');
      }
    })();
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [start]);

  const chosen = useMemo(
    () => images.filter((image) => selected.has(image.id)),
    [images, selected],
  );

  async function cancel(): Promise<void> {
    if (!job.jobId) return;
    await send({ type: 'CANCEL_ANALYSIS', target: 'background', jobId: job.jobId });
  }

  async function retry(result: AnalysisResult): Promise<void> {
    await start([result.image]);
  }

  return (
    <main>
      <header className="hero">
        <div className="brand-mark" aria-hidden="true">
          ◉
        </div>
        <div>
          <p className="eyebrow">ON-DEVICE SCREENING</p>
          <h1>Image Signal</h1>
        </div>
        <button
          className="settings-link"
          type="button"
          onClick={() => void chrome.runtime.openOptionsPage()}
          aria-label="Open settings"
        >
          Settings
        </button>
      </header>

      <section className="privacy-strip" aria-label="Privacy">
        <span aria-hidden="true">◆</span>
        <span>
          <strong>Local by design.</strong> Automatic labels and manual checks run in this browser.
        </span>
      </section>

      <section className="panel" aria-labelledby="page-images-title">
        <div className="section-head">
          <div>
            <h2 id="page-images-title">Page images</h2>
            <p>{pageNote}</p>
          </div>
          {images.length > 0 && (
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setSelected(
                  selected.size === images.length
                    ? new Set()
                    : new Set(images.map((image) => image.id)),
                )
              }
            >
              {selected.size === images.length ? 'Clear' : 'Select all'}
            </button>
          )}
        </div>
        {images.length > 0 && (
          <ImagePicker
            images={images}
            selected={selected}
            onToggle={(id) =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onAnalyzeOne={(image) => void start([image])}
            disabled={busy}
          />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            className="primary"
            type="button"
            disabled={busy || chosen.length === 0 || !settings}
            onClick={() => void start(chosen)}
          >
            Analyze {chosen.length || ''} selected locally
          </button>
          {busy && (
            <button className="secondary" type="button" onClick={() => void cancel()}>
              Cancel
            </button>
          )}
        </div>
        {busy && (
          <div className="progress" aria-live="polite">
            <progress max={Math.max(1, job.total)} value={job.completed} />
            <span>{job.message}</span>
          </div>
        )}
      </section>

      {job.results.length > 0 && (
        <section className="panel" aria-labelledby="results-title">
          <div className="section-head">
            <h2 id="results-title">Results</h2>
            <span>
              {job.completed}/{job.total}
            </span>
          </div>
          <div className="results" aria-live="polite">
            {job.results.map((result) => (
              <ResultCard
                key={result.image.id}
                result={result}
                onRetry={(item) => void retry(item)}
              />
            ))}
          </div>
        </section>
      )}

      <details className="limitations">
        <summary>What this signal can and cannot say</summary>
        <p>
          This is a screening signal, not proof of authorship. Do not use it alone to accuse a
          person or make a high-impact decision.
        </p>
        <p>
          Known weak cases include extreme multi-hop compression, recent generators after
          laundering, images below 48 pixels, and images where generated content covers only a small
          region.
        </p>
      </details>
      <footer>Community Forensics low-quality detector · MIT licensed model</footer>
    </main>
  );
}
