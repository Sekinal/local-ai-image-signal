import {
  createResizePlan,
  normalizeRgbaToNchw,
  pythonRound,
  resizeCropPillowBicubic,
} from '../lib/preprocess';
import { MODEL } from '../lib/model';

describe('deterministic preprocessing', () => {
  it('matches the published short-edge and rounded center-crop plan', () => {
    expect(createResizePlan(800, 600)).toEqual({
      resizedWidth: 587,
      resizedHeight: 440,
      cropLeft: 102,
      cropTop: 28,
    });
    expect(createResizePlan(600, 800)).toEqual({
      resizedWidth: 440,
      resizedHeight: 587,
      cropLeft: 28,
      cropTop: 102,
    });
    expect(createResizePlan(589, 440).cropLeft).toBe(102);
    expect(pythonRound(102.5)).toBe(102);
    expect(pythonRound(103.5)).toBe(104);
  });

  it('produces contiguous RGB NCHW with exact ImageNet normalization', () => {
    const pixels = MODEL.inputSize * MODEL.inputSize;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let index = 0; index < pixels; index += 1) {
      rgba[index * 4] = 255;
      rgba[index * 4 + 1] = 128;
      rgba[index * 4 + 2] = 0;
      rgba[index * 4 + 3] = 255;
    }
    const output = normalizeRgbaToNchw({ data: rgba, width: 384, height: 384 });
    expect(output).toHaveLength(pixels * 3);
    expect(output[0]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(output[pixels]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 6);
    expect(output[pixels * 2]).toBeCloseTo((0 - 0.406) / 0.225, 6);
  });

  it('preserves solid RGB while discarding alpha like Pillow RGB conversion', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let index = 0; index < 16; index += 1) {
      data.set([10, 20, 30, index], index * 4);
    }
    const output = resizeCropPillowBicubic({ data, width: 4, height: 4 }, createResizePlan(4, 4));
    expect([...output.data.slice(0, 4)]).toEqual([10, 20, 30, 255]);
    expect([...output.data.slice(-4)]).toEqual([10, 20, 30, 255]);
  });

  it('rejects buffers that could silently corrupt model input', () => {
    expect(() =>
      normalizeRgbaToNchw({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    ).toThrow('Expected 384x384');
  });
});
