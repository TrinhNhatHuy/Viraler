import { describe, expect, it } from 'vitest';
import { ENTRANCE_MS, entrance, WORD_POP_MS, wordPopScale } from './animation';

describe('wordPopScale', () => {
  it('is 1 outside the pop and peaks at 1.15 in the middle', () => {
    expect(wordPopScale(-10)).toBe(1);
    expect(wordPopScale(0)).toBe(1);
    expect(wordPopScale(WORD_POP_MS)).toBe(1);
    expect(wordPopScale(WORD_POP_MS / 2)).toBeCloseTo(1.15);
    for (let t = 0; t <= WORD_POP_MS; t += 10) {
      expect(wordPopScale(t)).toBeGreaterThanOrEqual(1);
      expect(wordPopScale(t)).toBeLessThanOrEqual(1.15 + 1e-9);
    }
  });
});

describe('entrance', () => {
  it('starts small and invisible and ends at full size', () => {
    expect(entrance(0)).toEqual({ scale: 0.85, alpha: 0 });
    expect(entrance(ENTRANCE_MS)).toEqual({ scale: 1, alpha: 1 });
    expect(entrance(10_000)).toEqual({ scale: 1, alpha: 1 });
  });

  it('fades in steadily and overshoots only slightly', () => {
    let lastAlpha = 0;
    for (let t = 0; t <= ENTRANCE_MS; t += 5) {
      const { scale, alpha } = entrance(t);
      expect(alpha).toBeGreaterThanOrEqual(lastAlpha);
      expect(scale).toBeGreaterThanOrEqual(0.85);
      expect(scale).toBeLessThan(1.05);
      lastAlpha = alpha;
    }
  });
});
