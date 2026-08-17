export const MODEL = {
  repository: 'Thermostatic/community-forensics-low-quality-detector-2026-08',
  revision: '17a23afcd6ee55a41809bb06ff4fd43faea6b639',
  file: 'community_forensics_low_quality_fp16.onnx',
  sha256: '88ca8e90e5ab33e6e13887124614e14ba96d7c8cc9ecb21505b63cdc6549ff17',
  inputSize: 384,
  resizeShortEdge: 440,
  mean: [0.485, 0.456, 0.406] as const,
  std: [0.229, 0.224, 0.225] as const,
  calibrationSlope: 0.6352260751077209,
  calibrationIntercept: -0.2643220522904507,
  defaultThreshold: 0.65,
  rawLogitBoundary: 1.390625,
} as const;

export type SignalLabel = 'stronger-signal' | 'weaker-signal';
export type Certainty = 'near-threshold' | 'moderate' | 'far-from-threshold';

export function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

export function calibratedScore(rawLogit: number): number {
  return sigmoid(MODEL.calibrationSlope * rawLogit + MODEL.calibrationIntercept);
}

export function rawBoundaryForThreshold(threshold: number): number {
  if (!(threshold > 0 && threshold < 1)) throw new RangeError('Threshold must be between 0 and 1.');
  return (
    (Math.log(threshold / (1 - threshold)) - MODEL.calibrationIntercept) / MODEL.calibrationSlope
  );
}

export function classifyScore(score: number, threshold: number): SignalLabel {
  return score >= threshold ? 'stronger-signal' : 'weaker-signal';
}

export function scoreCertainty(score: number, threshold: number): Certainty {
  const margin = Math.abs(score - threshold);
  if (margin < 0.08) return 'near-threshold';
  if (margin < 0.22) return 'moderate';
  return 'far-from-threshold';
}
