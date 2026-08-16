import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';
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
  await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().endsWith('/background.js'),
    { timeout: 20_000 },
  );
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1400 });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#local-ai-image-signal-overlay');
      const badge = host?.shadowRoot?.querySelector('[data-image-signal-id]');
      return badge?.textContent?.startsWith('AI score ') === true;
    },
    { timeout: 120_000 },
  );
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
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#local-ai-image-signal-overlay');
      const badges = [...(host?.shadowRoot?.querySelectorAll('[data-image-signal-id]') ?? [])];
      return (
        badges.length === 3 && badges.every((badge) => badge.textContent?.startsWith('AI score '))
      );
    },
    { timeout: 10_000 },
  );
  const result = await page.evaluate(() => {
    const host = document.querySelector('#local-ai-image-signal-overlay');
    const found = [...(host?.shadowRoot?.querySelectorAll('[data-image-signal-id]') ?? [])];
    const badge = found[0];
    return {
      text: badge?.textContent ?? '',
      tone: badge instanceof HTMLElement ? badge.dataset.tone : '',
      badgeCount: found.length,
    };
  });
  if (!/^AI score \d+%$/.test(result.text)) {
    throw new Error(`Automatic page score is missing: ${JSON.stringify(result)}`);
  }
  if (result.tone !== 'strong' && result.tone !== 'weak') {
    throw new Error(`Automatic page result tone is invalid: ${JSON.stringify(result)}`);
  }
  if (result.badgeCount !== 3) {
    throw new Error(`Dynamic image/background was not labelled: ${JSON.stringify(result)}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`Automatic page console error: ${consoleErrors.join('; ')}`);
  }
  process.stdout.write(`${JSON.stringify({ status: 'complete', badge: result }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
