import type { CaptionWord, Clip } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import {
  clampScroll,
  fitView,
  hitTest,
  layoutFor,
  MAX_PX_PER_MS,
  msToX,
  PAD_X,
  rulerTicks,
  snapMs,
  xToMs,
  zoomAt,
} from './view';

const v = { pxPerMs: 0.1, scrollMs: 0 }; // 100 px per second
const layout = layoutFor(800);
const clips: Clip[] = [
  { id: 'a', mediaId: 'm', startMs: 0, durationMs: 2000, trimInMs: 0, muted: true },
  { id: 'b', mediaId: 'm', startMs: 2000, durationMs: 1000, trimInMs: 0, muted: true },
];
const words: CaptionWord[] = [{ text: 'hi', startMs: 500, endMs: 900 }];
const clipY = layout.clips.y + 10;
const wordY = layout.captions.y + 5;

describe('time ↔ pixels', () => {
  it('round-trips with scroll', () => {
    const scrolled = { pxPerMs: 0.1, scrollMs: 1000 };
    expect(msToX(1500, scrolled)).toBe(PAD_X + 50);
    expect(xToMs(PAD_X + 50, scrolled)).toBe(1500);
  });

  it('fits the duration into the width', () => {
    const fit = fitView(10_000, 800);
    expect(msToX(10_000, fit)).toBeLessThanOrEqual(800 - PAD_X);
    expect(fit.scrollMs).toBe(0);
  });

  it('zooms around the pointer and respects limits', () => {
    const zoomed = zoomAt(v, 2, PAD_X + 300);
    expect(xToMs(PAD_X + 300, zoomed)).toBeCloseTo(3000);
    expect(zoomAt(v, 1000, 0).pxPerMs).toBe(MAX_PX_PER_MS);
  });

  it('clamps the scroll', () => {
    expect(clampScroll({ pxPerMs: 0.1, scrollMs: -50 }, 10_000, 800).scrollMs).toBe(0);
    expect(clampScroll({ pxPerMs: 0.1, scrollMs: 99_999 }, 10_000, 800).scrollMs).toBeLessThan(
      10_000,
    );
  });
});

describe('rulerTicks', () => {
  it('labels ticks at least ~70 px apart', () => {
    const labelled = rulerTicks(v, 800).filter((t) => t.label);
    expect(labelled[0]).toEqual({ ms: 0, label: '0s' });
    expect((labelled[1]!.ms - labelled[0]!.ms) * v.pxPerMs).toBeGreaterThanOrEqual(70);
  });
});

describe('hitTest', () => {
  it('finds clip bodies and edges', () => {
    expect(hitTest(msToX(1000, v), clipY, v, layout, clips, words)).toEqual({
      type: 'clip',
      index: 0,
    });
    expect(hitTest(msToX(2000, v) - 2, clipY, v, layout, clips, words)).toEqual({
      type: 'clip-end',
      index: 0,
    });
    expect(hitTest(msToX(2000, v) + 2, clipY, v, layout, clips, words)).toEqual({
      type: 'clip-start',
      index: 1,
    });
    expect(hitTest(msToX(0, v) + 1, clipY, v, layout, clips, words)).toEqual({
      type: 'clip-start',
      index: 0,
    });
  });

  it('finds caption word edges, the ruler and empty track', () => {
    expect(hitTest(msToX(700, v), wordY, v, layout, clips, words)).toEqual({
      type: 'word',
      index: 0,
    });
    expect(hitTest(msToX(900, v) + 3, wordY, v, layout, clips, words)).toEqual({
      type: 'word-end',
      index: 0,
    });
    expect(hitTest(100, layout.ruler.y + 5, v, layout, clips, words)).toEqual({ type: 'ruler' });
    expect(hitTest(msToX(5000, v), clipY, v, layout, clips, words)).toEqual({ type: 'track' });
  });
});

describe('snapMs', () => {
  it('snaps within the pixel threshold only', () => {
    expect(snapMs(1040, [1000, 2000], v)).toBe(1000); // 4 px away
    expect(snapMs(1100, [1000, 2000], v)).toBe(1100); // 10 px away
  });
});
