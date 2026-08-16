import process from 'node:process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const PARITY_SPECS = [
  { id: 'landscape-png', width: 512, height: 384, seed: 0, codec: 'png' },
  { id: 'near-boundary-png', width: 512, height: 384, seed: 15, codec: 'png' },
  { id: 'portrait-png', width: 384, height: 512, seed: 7, codec: 'png' },
  { id: 'odd-crop-png', width: 589, height: 440, seed: 3, codec: 'png' },
  { id: 'wide-jpeg', width: 701, height: 333, seed: 6, codec: 'jpeg' },
  { id: 'square-webp', width: 440, height: 440, seed: 12, codec: 'webp' },
  { id: 'alpha-png', width: 511, height: 385, seed: 4, codec: 'png', alpha: true },
];

export async function buildParityFixtures() {
  return Promise.all(
    PARITY_SPECS.map(async (spec) => {
      const rgba = Buffer.alloc(spec.width * spec.height * 4);
      for (let y = 0; y < spec.height; y += 1) {
        for (let x = 0; x < spec.width; x += 1) {
          const offset = (y * spec.width + x) * 4;
          rgba[offset] = (x * (13 + spec.seed) + y * (3 + 2 * spec.seed) + 17 * spec.seed) % 256;
          rgba[offset + 1] =
            (x * (5 + 2 * spec.seed) + y * (11 + spec.seed) + 29 * spec.seed) % 256;
          rgba[offset + 2] = ((x ^ y) + x * spec.seed + 7 * spec.seed) % 256;
          rgba[offset + 3] = spec.alpha ? (x * 7 + y * 5 + 31) % 256 : 255;
        }
      }
      let encoder = sharp(rgba, {
        raw: { width: spec.width, height: spec.height, channels: 4 },
      });
      if (spec.codec === 'jpeg')
        encoder = encoder.jpeg({ quality: 82, chromaSubsampling: '4:2:0' });
      else if (spec.codec === 'webp') encoder = encoder.webp({ quality: 80 });
      else encoder = encoder.png();
      const bytes = await encoder.toBuffer();
      return {
        ...spec,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        base64: bytes.toString('base64'),
        dataUrl: `data:image/${spec.codec};base64,${bytes.toString('base64')}`,
      };
    }),
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.stdout.write(`${JSON.stringify(await buildParityFixtures())}\n`);
}
