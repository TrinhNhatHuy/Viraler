import { describe, expect, it } from 'vitest';
import { computePeaks } from './waveform';

describe('computePeaks', () => {
  it('takes the peak magnitude per bucket', () => {
    const samples = new Float32Array([0.1, -0.5, 0.2, 0.3, -0.9, 0, 0.05, 0.4]);
    expect([...computePeaks(samples, 4)].map((v) => +v.toFixed(2))).toEqual([0.5, 0.3, 0.9, 0.4]);
  });

  it('handles more buckets than samples and empty input', () => {
    expect(computePeaks(new Float32Array([0.5, -0.25]), 4).length).toBe(4);
    expect([...computePeaks(new Float32Array(), 3)]).toEqual([0, 0, 0]);
  });
});
