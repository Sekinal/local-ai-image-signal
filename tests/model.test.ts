import {
  calibratedScore,
  classifyScore,
  MODEL,
  rawBoundaryForThreshold,
  scoreCertainty,
} from '../lib/model';

describe('published calibrator contract', () => {
  it('maps the frozen raw boundary to the target probability', () => {
    expect(calibratedScore(MODEL.rawLogitBoundary)).toBeCloseTo(MODEL.defaultThreshold, 5);
    expect(rawBoundaryForThreshold(MODEL.defaultThreshold)).toBeCloseTo(MODEL.rawLogitBoundary, 5);
  });

  it('classifies at the inclusive threshold', () => {
    expect(classifyScore(0.65, 0.65)).toBe('stronger-signal');
    expect(classifyScore(0.649, 0.65)).toBe('weaker-signal');
  });

  it('describes margin-based uncertainty without claiming probability calibration', () => {
    expect(scoreCertainty(0.64, 0.65)).toBe('near-threshold');
    expect(scoreCertainty(0.5, 0.65)).toBe('moderate');
    expect(scoreCertainty(0.1, 0.65)).toBe('far-from-threshold');
  });
});
