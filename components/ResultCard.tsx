import type { AnalysisResult } from '../lib/schema';

function sourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'data:') return 'Embedded image';
    if (parsed.protocol === 'blob:') return 'Page-only blob image';
    return parsed.hostname;
  } catch {
    return 'Image';
  }
}

export function ResultCard({
  result,
  onRetry,
}: {
  result: AnalysisResult;
  onRetry: (result: AnalysisResult) => void;
}) {
  if (result.status === 'error') {
    return (
      <article className="result result--error" aria-label="Image could not be analyzed">
        <div className="result__head">
          <span className="source">{sourceLabel(result.image.url)}</span>
          <span className="badge badge--muted">Not analyzed</span>
        </div>
        <p>{result.warning ?? 'This image could not be analyzed.'}</p>
        {result.errorCode === 'permission-needed' && (
          <button className="text-button" type="button" onClick={() => onRetry(result)}>
            Grant access and retry
          </button>
        )}
      </article>
    );
  }
  if (result.status === 'cancelled' || result.score === undefined || !result.label) return null;
  const percent = Math.round(result.score * 100);
  const strong = result.label === 'stronger-signal';
  const proximity =
    result.certainty === 'near-threshold'
      ? 'Near the selected threshold · treat as uncertain'
      : result.certainty === 'moderate'
        ? '8–22 points from the selected threshold'
        : 'More than 22 points from the selected threshold';
  return (
    <article className={`result ${strong ? 'result--strong' : 'result--weak'}`}>
      <div className="result__head">
        <span className="source">{sourceLabel(result.image.url)}</span>
        <span className={`badge ${strong ? 'badge--strong' : 'badge--weak'}`}>
          {strong ? 'Stronger AI signal' : 'Weaker AI signal'}
        </span>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label="AI-generation signal model score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="score-row">
        <strong>{percent}% model score</strong>
        <span>Not a likelihood</span>
      </div>
      <p className="proximity">{proximity}</p>
      {result.warning && <p className="warning">{result.warning}</p>}
    </article>
  );
}
