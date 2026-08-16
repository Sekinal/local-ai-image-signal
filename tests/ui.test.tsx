import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResultCard } from '../components/ResultCard';
import { SettingsForm } from '../components/SettingsForm';
import type { AnalysisResult } from '../lib/schema';
import { DEFAULT_SETTINGS } from '../lib/settings';

const base: AnalysisResult = {
  image: {
    id: '1',
    url: 'https://images.example/image.jpg',
    kind: 'img',
    width: 800,
    height: 600,
    alt: '',
    pageUrl: 'https://example.com',
  },
  status: 'complete',
  rawLogit: 2,
  score: 0.78,
  label: 'stronger-signal',
  certainty: 'moderate',
};

describe('core UI', () => {
  it('uses cautious, accessible result wording', () => {
    render(<ResultCard result={base} onRetry={() => undefined} />);
    expect(screen.getByText('Stronger AI signal')).toBeInTheDocument();
    expect(screen.getByText('78% model score')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'AI-generation signal model score' })).toHaveAttribute(
      'aria-valuenow',
      '78',
    );
    expect(screen.queryByText(/definitely|proof|fake person/i)).not.toBeInTheDocument();
  });

  it('offers access retry only for permission-related errors', () => {
    const onRetry = vi.fn();
    render(
      <ResultCard
        result={{
          ...base,
          status: 'error',
          score: undefined,
          label: undefined,
          errorCode: 'permission-needed',
          warning: 'Access needed.',
        }}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Grant access and retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('saves explicit threshold and autoscan choices locally', async () => {
    render(<SettingsForm initial={DEFAULT_SETTINGS} />);
    fireEvent.change(screen.getByRole('slider', { name: /Detection threshold/ }), {
      target: { value: '0.72' },
    });
    fireEvent.click(screen.getByLabelText(/Automatically label webpage images/));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(screen.getByText('Saved locally.')).toBeInTheDocument());
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      threshold: 0.72,
      autoScan: false,
      maxImages: 24,
    });
  });
});
