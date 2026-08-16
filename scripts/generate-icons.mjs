import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const svg =
  Buffer.from(`<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="14" y1="8" x2="112" y2="122" gradientUnits="userSpaceOnUse"><stop stop-color="#5EEAD4"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>
  <rect width="128" height="128" rx="28" fill="#101828"/>
  <path d="M26 64c9-18 21-27 38-27s29 9 38 27c-9 18-21 27-38 27S35 82 26 64Z" fill="none" stroke="url(#g)" stroke-width="9"/>
  <circle cx="64" cy="64" r="13" fill="url(#g)"/>
  <path d="M99 20v18M90 29h18" stroke="#F8FAFC" stroke-width="6" stroke-linecap="round"/>
</svg>`);

await mkdir('public', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icon-${size}.png`);
}
console.log('Generated extension icons.');
