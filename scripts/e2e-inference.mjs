import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';
import { buildParityFixtures } from './parity-fixtures.mjs';

const root = process.cwd();
const forceWasm = process.argv.includes('--wasm');
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

const parity = JSON.parse(
  await readFile(path.join(root, 'tests', 'parity-reference.json'), 'utf8'),
);
const generated = await buildParityFixtures();
const fixtures = generated.map((fixture) => {
  const reference = parity.fixtures.find((item) => item.id === fixture.id);
  if (!reference) throw new Error(`Missing Python parity reference for ${fixture.id}.`);
  if (reference.sha256 !== fixture.sha256)
    throw new Error(`Parity fixture bytes drifted for ${fixture.id}.`);
  return {
    ...fixture,
    pythonRawLogit: reference.pythonRawLogit,
    maximumDifference: reference.maximumDifference,
  };
});

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
  const extensionId = new URL(workerTarget.url()).hostname;
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const outcome = await page.evaluate(
    async ({ fixtureInputs, forceWasmForTest }) => {
      const jobId = `e2e-${crypto.randomUUID()}`;
      const tabId = 777;
      const response = await chrome.runtime.sendMessage({
        type: 'START_ANALYSIS',
        target: 'background',
        jobId,
        tabId,
        documentId: 'e2e-document',
        pageUrl: 'https://fixture.invalid/',
        threshold: 0.65,
        executionProvider: forceWasmForTest ? 'wasm' : 'auto',
        images: fixtureInputs.map((fixture) => ({
          id: fixture.id,
          url: fixture.dataUrl,
          kind: 'img',
          width: fixture.width,
          height: fixture.height,
          alt: `Deterministic parity fixture ${fixture.id}`,
          pageUrl: 'https://fixture.invalid/',
        })),
      });
      if (!response?.ok) throw new Error(response?.error ?? 'Background rejected E2E job.');

      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const state = (await chrome.storage.session.get(`currentJob:${tabId}`))[
          `currentJob:${tabId}`
        ];
        if (state?.status === 'complete' || state?.status === 'error') return state;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for packaged-model inference.');
    },
    {
      fixtureInputs: fixtures.map(({ id, width, height, dataUrl }) => ({
        id,
        width,
        height,
        dataUrl,
      })),
      forceWasmForTest: forceWasm,
    },
  );

  if (outcome.status !== 'complete' || outcome.results?.length !== fixtures.length) {
    throw new Error(`Inference did not complete: ${JSON.stringify(outcome)}`);
  }
  const expectedProvider = forceWasm ? 'wasm' : 'webgpu';
  if (outcome.executionProvider !== expectedProvider) {
    throw new Error(`Expected ${expectedProvider}, got ${outcome.executionProvider}.`);
  }
  const comparisons = fixtures.map((fixture) => {
    const result = outcome.results.find((item) => item.image.id === fixture.id);
    if (result?.status !== 'complete' || !Number.isFinite(result.rawLogit)) {
      throw new Error(`Fixture inference failed: ${JSON.stringify(result)}`);
    }
    return {
      id: fixture.id,
      pythonRawLogit: fixture.pythonRawLogit,
      chromeRawLogit: result.rawLogit,
      absoluteDifference: Math.abs(result.rawLogit - fixture.pythonRawLogit),
      maximumDifference: fixture.maximumDifference,
      decisionAgreement:
        result.rawLogit >= parity.rawBoundary === fixture.pythonRawLogit >= parity.rawBoundary,
    };
  });
  if (comparisons.some((comparison) => !comparison.decisionAgreement)) {
    throw new Error(`Python/Chrome threshold decision mismatch: ${JSON.stringify(comparisons)}`);
  }
  const drifted = comparisons.filter(
    (comparison) => comparison.absoluteDifference > comparison.maximumDifference,
  );
  if (drifted.length > 0) {
    throw new Error(`Python/Chrome per-fixture raw-logit drift: ${JSON.stringify(drifted)}`);
  }
  if (
    !comparisons.some(
      (comparison) => Math.abs(comparison.pythonRawLogit - parity.rawBoundary) < 0.05,
    )
  ) {
    throw new Error('Parity suite lacks a Python fixture within 0.05 raw logit of the boundary.');
  }
  if (consoleErrors.length > 0)
    throw new Error(`Extension console error: ${consoleErrors.join('; ')}`);
  process.stdout.write(
    `${JSON.stringify({ status: outcome.status, executionPath: outcome.executionProvider, comparisons }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
