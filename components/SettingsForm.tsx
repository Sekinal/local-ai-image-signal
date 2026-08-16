import { useId, useState } from 'react';
import { saveSettings, type Settings } from '../lib/settings';

export function SettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [status, setStatus] = useState('');
  const thresholdId = useId();
  const maximumId = useId();

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    await saveSettings(settings);
    setStatus('Saved locally.');
  }

  return (
    <form className="settings" onSubmit={(event) => void submit(event)}>
      <label htmlFor={thresholdId}>
        Detection threshold <output>{settings.threshold.toFixed(2)}</output>
      </label>
      <input
        id={thresholdId}
        type="range"
        min="0.5"
        max="0.95"
        step="0.01"
        value={settings.threshold}
        onChange={(event) =>
          setSettings({ ...settings, threshold: Number(event.currentTarget.value) })
        }
      />
      <p className="help">
        Higher values reduce false alerts but can miss more generated images. The published default
        is 0.65.
      </p>

      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.autoScan}
          onChange={(event) => setSettings({ ...settings, autoScan: event.currentTarget.checked })}
        />
        <span>
          <strong>Automatically label webpage images</strong>
          <small>Analyze visible images locally as you browse ordinary HTTP(S) pages.</small>
        </span>
      </label>

      <label htmlFor={maximumId}>Maximum visible images per run</label>
      <input
        id={maximumId}
        type="number"
        min="1"
        max="100"
        value={settings.maxImages}
        onChange={(event) =>
          setSettings({ ...settings, maxImages: Number(event.currentTarget.value) })
        }
      />
      <button className="primary" type="submit">
        Save settings
      </button>
      <span className="save-status" role="status">
        {status}
      </span>
    </form>
  );
}
