export const MODEL = {
  repository: 'Thermostatic/community-forensics-frontier-detector-2026-08',
  revision: '16db135220b318d811b207db576d90368980b595',
  file: 'community_forensics_frontier_fp16.onnx',
  sha256: 'd75791ba2fa59146025d342cfaafa9ddeab24af117642a94f752ee4c1619375d',
  inputSize: 384,
  resizeShortEdge: 440,
  mean: [0.485, 0.456, 0.406] as const,
  std: [0.229, 0.224, 0.225] as const,
  calibrationIntercept: -0.7403357915937764,
  defaultThreshold: 0.65,
  rawLogitBoundary: 1.359375,
} as const;

export type SignalLabel = 'stronger-signal' | 'weaker-signal';
export type Certainty = 'near-threshold' | 'moderate' | 'far-from-threshold';

export function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

export function calibratedScore(rawLogit: number): number {
  return sigmoid(rawLogit + MODEL.calibrationIntercept);
}

export function rawBoundaryForThreshold(threshold: number): number {
  if (!(threshold > 0 && threshold < 1)) throw new RangeError('Threshold must be between 0 and 1.');
  return Math.log(threshold / (1 - threshold)) - MODEL.calibrationIntercept;
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
