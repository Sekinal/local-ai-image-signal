import { createServer } from 'node:http';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';
import { waitForAutomaticScores } from './automatic-badge-state.mjs';
import { buildParityFixtures } from './parity-fixtures.mjs';

const root = process.cwd();
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const outputPath = path.join(root, 'docs', 'assets', 'poidh-claim.png');
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

await access(path.join(extensionPath, 'manifest.json'));
let executablePath;
for (const candidate of chromeCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next documented local Chrome location.
  }
}
if (!executablePath) throw new Error('Chrome was not found; set CHROME_PATH.');

const wanted = new Set(['landscape-png', 'square-webp', 'portrait-png']);
const fixtures = (await buildParityFixtures()).filter((fixture) => wanted.has(fixture.id));
if (fixtures.length !== wanted.size) throw new Error('Claim fixtures are incomplete.');
const encoded = new Map(fixtures.map((fixture) => [`/${fixture.id}.${fixture.codec}`, fixture]));

const server = createServer((request, response) => {
  const fixture = encoded.get(request.url ?? '');
  if (fixture) {
    const bytes = Buffer.from(fixture.base64, 'base64');
    response.writeHead(200, {
      'content-type': `image/${fixture.codec}`,
      'content-length': bytes.length,
      'cache-control': 'no-store',
    });
    response.end(bytes);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Local AI Image Signal — automatic scan evidence</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; color: #f8fafc; background: radial-gradient(circle at 15% 0%, #134e4a 0, transparent 38%), radial-gradient(circle at 100% 100%, #4c1d95 0, transparent 42%), #07111f; font: 16px/1.5 Inter, ui-sans-serif, system-ui, sans-serif; }
          main { width: 1320px; margin: 0 auto; padding: 54px 36px 40px; }
          header { display: flex; justify-content: space-between; align-items: end; gap: 36px; margin-bottom: 34px; }
          .eyebrow { color: #5eead4; font-size: 13px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
          h1 { max-width: 800px; margin: 8px 0 10px; font-size: 49px; line-height: 1.03; letter-spacing: -.045em; }
          .lede { max-width: 750px; margin: 0; color: #cbd5e1; font-size: 19px; }
          .privacy { flex: 0 0 310px; padding: 18px 20px; border: 1px solid #2dd4bf66; border-radius: 18px; background: #0f766e25; }
          .privacy strong { display: block; color: #99f6e4; font-size: 17px; }
          .privacy span { color: #cbd5e1; font-size: 14px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
          article { overflow: hidden; border: 1px solid #ffffff22; border-radius: 22px; background: #ffffff0d; box-shadow: 0 24px 70px #0008; }
          article img { display: block; width: 100%; height: 270px; object-fit: cover; background: #111827; }
          article div { padding: 17px 19px 20px; }
          article strong { display: block; margin-bottom: 3px; font-size: 16px; }
          article span { color: #94a3b8; font-size: 13px; }
          footer { display: flex; justify-content: space-between; margin-top: 28px; color: #94a3b8; font-size: 13px; }
          footer strong { color: #e2e8f0; }
        </style>
      </head>
      <body>
        <main>
          <header>
            <section>
              <div class="eyebrow">Local AI Image Signal · packaged MV3 extension</div>
              <h1>Automatic AI-image screening, entirely inside Chrome.</h1>
              <p class="lede">The installed production extension found these displayed images and placed a calibrated score on each—without an upload, API, cloud model, or local server dependency.</p>
            </section>
            <aside class="privacy"><strong>Private by construction</strong><span>Bundled ONNX · WebGPU + WASM fallback · default threshold 0.65</span></aside>
          </header>
          <section class="grid">
            ${fixtures
              .map(
                (fixture, index) => `<article>
                  <img src="/${fixture.id}.${fixture.codec}" width="${fixture.width}" height="${fixture.height}" alt="Deterministic parity fixture ${index + 1}">
                  <div><strong>Automatic page scan ${index + 1}</strong><span>SHA-pinned ${fixture.codec.toUpperCase()} browser fixture · score produced by packaged model</span></div>
                </article>`,
              )
              .join('')}
          </section>
          <footer><span><strong>Reproducible evidence:</strong> npm run claim:evidence</span><span>Sekinal/local-ai-image-signal · MIT</span></footer>
        </main>
      </body>
    </html>`);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Evidence server did not bind.');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  pipe: true,
  enableExtensions: [extensionPath],
  args: ['--no-first-run', '--no-default-browser-check'],
});

try {
  await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().endsWith('/background.js'),
    { timeout: 20_000 },
  );
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 920, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle0' });
  const scores = await waitForAutomaticScores(page, 3);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
  process.stdout.write(`${JSON.stringify({ outputPath, scores }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
