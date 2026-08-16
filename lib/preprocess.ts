import { MODEL } from './model';
import { assertResizeWork } from './job-policy';

export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type ResizePlan = {
  resizedWidth: number;
  resizedHeight: number;
  cropLeft: number;
  cropTop: number;
};

/** Python-compatible ties-to-even rounding. */
export function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Mirrors the published Python geometry: rounded dimensions and rounded center crop. */
export function createResizePlan(width: number, height: number): ResizePlan {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Image dimensions must be positive integers.');
  }
  const target = MODEL.resizeShortEdge;
  const resizedWidth =
    width <= height ? target : Math.max(target, pythonRound((width * target) / height));
  const resizedHeight =
    width <= height ? Math.max(target, pythonRound((height * target) / width)) : target;
  return {
    resizedWidth,
    resizedHeight,
    cropLeft: pythonRound((resizedWidth - MODEL.inputSize) / 2),
    cropTop: pythonRound((resizedHeight - MODEL.inputSize) / 2),
  };
}

/** Converts the already resized/cropped RGBA pixels into contiguous NCHW float32. */
export function normalizeRgbaToNchw(image: RgbaImage): Float32Array {
  const { inputSize, mean, std } = MODEL;
  if (image.width !== inputSize || image.height !== inputSize) {
    throw new RangeError(`Expected ${inputSize}x${inputSize} pixels.`);
  }
  const pixels = inputSize * inputSize;
  if (image.data.length !== pixels * 4)
    throw new RangeError('RGBA buffer length does not match dimensions.');
  const tensor = new Float32Array(pixels * 3);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const rgba = pixel * 4;
    tensor[pixel] = ((image.data[rgba] ?? 0) / 255 - mean[0]) / std[0];
    tensor[pixels + pixel] = ((image.data[rgba + 1] ?? 0) / 255 - mean[1]) / std[1];
    tensor[pixels * 2 + pixel] = ((image.data[rgba + 2] ?? 0) / 255 - mean[2]) / std[2];
  }
  return tensor;
}

function cubicFilter(value: number): number {
  const x = Math.abs(value);
  if (x < 1) return (1.5 * x - 2.5) * x * x + 1;
  if (x < 2) return ((-0.5 * x + 2.5) * x - 4) * x + 2;
  return 0;
}

function coefficients(inputSize: number, outputSize: number, outputOffset: number) {
  const scale = inputSize / outputSize;
  const filterScale = Math.max(1, scale);
  const support = 2 * filterScale;
  return Array.from({ length: MODEL.inputSize }, (_, outputIndex) => {
    const center = (outputIndex + outputOffset + 0.5) * scale;
    const first = Math.max(0, Math.trunc(center - support + 0.5));
    const last = Math.min(inputSize, Math.trunc(center + support + 0.5));
    const weights: number[] = [];
    let sum = 0;
    for (let inputIndex = first; inputIndex < last; inputIndex += 1) {
      const weight = cubicFilter((inputIndex + 0.5 - center) / filterScale);
      weights.push(weight);
      sum += weight;
    }
    return { first, weights: weights.map((weight) => weight / sum) };
  });
}

function clipRounded(value: number): number {
  return Math.max(0, Math.min(255, Math.floor(value + 0.5)));
}

/** Two-pass Pillow-style bicubic resize followed by the published center crop. */
export function resizeCropPillowBicubic(source: RgbaImage, plan: ResizePlan): RgbaImage {
  if (source.data.length !== source.width * source.height * 4)
    throw new RangeError('Source RGBA buffer length does not match dimensions.');
  const horizontalCoefficients = coefficients(source.width, plan.resizedWidth, plan.cropLeft);
  const verticalCoefficients = coefficients(source.height, plan.resizedHeight, plan.cropTop);
  const horizontal = new Uint8ClampedArray(source.height * MODEL.inputSize * 3);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < MODEL.inputSize; x += 1) {
      const horizontalSample = horizontalCoefficients[x];
      if (!horizontalSample) throw new RangeError('Missing horizontal resize coefficients.');
      const { first, weights } = horizontalSample;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let sample = 0; sample < weights.length; sample += 1) {
          value +=
            (source.data[(y * source.width + first + sample) * 4 + channel] ?? 0) *
            (weights[sample] ?? 0);
        }
        horizontal[(y * MODEL.inputSize + x) * 3 + channel] = clipRounded(value);
      }
    }
  }

  const output = new Uint8ClampedArray(MODEL.inputSize * MODEL.inputSize * 4);
  for (let y = 0; y < MODEL.inputSize; y += 1) {
    const verticalSample = verticalCoefficients[y];
    if (!verticalSample) throw new RangeError('Missing vertical resize coefficients.');
    const { first, weights } = verticalSample;
    for (let x = 0; x < MODEL.inputSize; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        for (let sample = 0; sample < weights.length; sample += 1) {
          value +=
            (horizontal[((first + sample) * MODEL.inputSize + x) * 3 + channel] ?? 0) *
            (weights[sample] ?? 0);
        }
        output[(y * MODEL.inputSize + x) * 4 + channel] = clipRounded(value);
      }
      output[(y * MODEL.inputSize + x) * 4 + 3] = 255;
    }
  }
  return { data: output, width: MODEL.inputSize, height: MODEL.inputSize };
}

export function bitmapToModelInput(bitmap: ImageBitmap): {
  tensor: Float32Array;
  hasTransparency: boolean;
} {
  const plan = createResizePlan(bitmap.width, bitmap.height);
  assertResizeWork(plan.resizedWidth, plan.resizedHeight);
  const sourceCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is unavailable.');
  context.drawImage(bitmap, 0, 0);
  const source = context.getImageData(0, 0, bitmap.width, bitmap.height);
  let hasTransparency = false;
  for (let index = 3; index < source.data.length; index += 4) {
    if (source.data[index] !== 255) {
      hasTransparency = true;
      break;
    }
  }
  const crop = resizeCropPillowBicubic(source, plan);
  return { tensor: normalizeRgbaToNchw(crop), hasTransparency };
}
