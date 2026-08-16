import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const revision = '16db135220b318d811b207db576d90368980b595';
const file = 'community_forensics_frontier_fp16.onnx';
const expected = 'd75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d';
const destination = resolve('public/models', file);
const temporary = `${destination}.part`;
const verifyOnly = process.argv.includes('--verify-only');

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

await mkdir(dirname(destination), { recursive: true });
try {
  if ((await sha256(destination)) === expected) {
    console.log(`Model already verified: ${destination}`);
    process.exit(0);
  }
} catch {
  // Missing model is expected on a clean checkout.
}

if (verifyOnly) {
  throw new Error(`The packaged model is missing or failed SHA-256 verification: ${destination}`);
}

const url = `https://huggingface.co/Thermostatic/community-forensics-frontier-detector-2026-08/resolve/${revision}/${file}`;
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
await rm(temporary, { force: true });
await finished(Readable.fromWeb(response.body).pipe(createWriteStream(temporary)));
const actual = await sha256(temporary);
if (actual !== expected) {
  await rm(temporary, { force: true });
  throw new Error(`SHA-256 mismatch: expected ${expected}, received ${actual}`);
}
await rename(temporary, destination);
console.log(`Downloaded and verified ${destination} (${actual})`);
