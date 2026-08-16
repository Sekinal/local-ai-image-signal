import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsForm } from '../../components/SettingsForm';
import { getSettings, type Settings } from '../../lib/settings';
import '../shared.css';

function OptionsApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);
  return (
    <main className="options-page">
      <p className="eyebrow">LOCAL AI IMAGE SIGNAL</p>
      <h1>Settings & privacy</h1>
      <section className="panel">
        <h2>Screening behavior</h2>
        {settings ? <SettingsForm initial={settings} /> : <p>Loading settings…</p>}
      </section>
      <section className="panel prose">
        <h2>Privacy</h2>
        <p>
          The extension processes displayed page images on your device. It has no analytics,
          advertising, user account, telemetry, or developer-operated server. It does not store
          images or model results after the browser session.
        </p>
        <p>
          Settings are stored only in <code>chrome.storage.local</code>. Automatic detection needs
          access to ordinary HTTP(S) pages and image hosts, including cross-origin CDNs. That access
          is used only to inventory and locally analyze displayed images. You can disable automatic
          labels here or disable the extension in Chrome at any time.
        </p>
      </section>
      <section className="panel prose">
        <h2>Interpret responsibly</h2>
        <p>
          The score is a calibrated model signal, not a probability that a specific person used AI.
          It can be wrong. Tiny synthetic composites, severe low resolution, heavy compression,
          screenshots, and laundered recent-model images are known weak points.
        </p>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Options root is missing.');
createRoot(root).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
