import { readFileSync } from 'node:fs';
import path from 'node:path';

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const values = hex.match(/[a-f\d]{2}/gi)?.map((part) => Number.parseInt(part, 16));
  if (values?.length !== 3) throw new Error(`Invalid color: ${hex}`);
  const [red, green, blue] = values;
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`Invalid color: ${hex}`);
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(first: string, second: string): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('dark-mode warning and error colors', () => {
  it('meets WCAG AA contrast on every dark result surface', () => {
    for (const background of ['#1c2638', '#311f23', '#132e2e']) {
      expect(contrast('#fda4af', background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#fecaca', '#3b2024')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the verified colors in the shipped stylesheet', () => {
    const css = readFileSync(path.join(process.cwd(), 'entrypoints', 'shared.css'), 'utf8');
    expect(css).toContain('color: #fda4af');
    expect(css).toContain('color: #fecaca');
    expect(css).toContain('background: #3b2024');
  });
});
