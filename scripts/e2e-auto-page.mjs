import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';
import { waitForAutomaticScores } from './automatic-badge-state.mjs';
import { buildParityFixtures } from './parity-fixtures.mjs';

const root = process.cwd();
const extensionPath = path.join(root, '.output', 'chrome-mv3');
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

const fixture = (await buildParityFixtures()).find((item) => item.id === 'landscape-png');
if (!fixture) throw new Error('Automatic-page fixture is missing.');
const imageBytes = Buffer.from(fixture.base64, 'base64');
const server = createServer((request, response) => {
  if (request.url === '/fixture.png') {
    response.writeHead(200, {
      'content-type': 'image/png',
      'content-length': imageBytes.length,
      'cache-control': 'no-store',
    });
    response.end(imageBytes);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html>
    <html><head><title>Automatic detector fixture</title></head>
    <body><h1>Fixture</h1><img src="/fixture.png" alt="Parity fixture" width="512" height="384"></body>
    </html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Fixture server did not bind.');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  pipe: true,
  enableExtensions: [extensionPath],
  args: ['--no-first-run', '--no-default-browser-check'],
});

try {
  const workerTarget = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().endsWith('/background.js'),
    { timeout: 20_000 },
  );
  const worker = await workerTarget.worker();
  if (!worker) throw new Error('Extension service worker is unavailable.');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1400 });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle0' });
  await waitForAutomaticScores(page, 1);
  await page.evaluate(() => {
    const duplicate = document.createElement('img');
    duplicate.src = '/fixture.png';
    duplicate.alt = 'Dynamically inserted duplicate fixture';
    duplicate.width = 512;
    duplicate.height = 384;
    document.body.append(duplicate);
    const background = document.createElement('div');
    background.setAttribute('aria-label', 'Dynamically inserted CSS background fixture');
    background.style.width = '512px';
    background.style.height = '384px';
    background.style.backgroundImage = 'url("/fixture.png")';
    document.body.append(background);
  });
  const initialScores = await waitForAutomaticScores(page, 3, 10_000);
  const pageCanReadScores = await page.evaluate(() => {
    return [...document.querySelectorAll('*')].some((element) =>
      element.shadowRoot?.querySelector('[data-image-signal-id]'),
    );
  });
  if (pageCanReadScores) {
    throw new Error('The page can read automatic scores through an open shadow root.');
  }
  const removedHosts = await page.evaluate(() => {
    const candidates = [...document.documentElement.children].filter((element) => {
      const style = getComputedStyle(element);
      return (
        element instanceof HTMLDivElement && style.position === 'fixed' && style.width === '0px'
      );
    });
    for (const candidate of candidates) candidate.remove();
    return candidates.length;
  });
  if (removedHosts < 1) throw new Error('The hostile-page overlay-removal probe found no host.');
  const recoveredAfterRemoval = await waitForAutomaticScores(page, 3, 10_000);
  await worker.evaluate(async () => chrome.storage.local.set({ autoScan: false }));
  await waitForAutomaticScores(page, 0, 10_000);
  await worker.evaluate(async () => chrome.storage.local.set({ autoScan: true }));
  const recoveredAfterReenable = await waitForAutomaticScores(page, 3, 10_000);
  if (initialScores.length !== 3) {
    throw new Error(`Dynamic image/background was not labelled: ${JSON.stringify(initialScores)}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`Automatic page console error: ${consoleErrors.join('; ')}`);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'complete',
        initialScores,
        pageCanReadScores,
        removedHosts,
        recoveredAfterRemoval,
        recoveredAfterReenable,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
