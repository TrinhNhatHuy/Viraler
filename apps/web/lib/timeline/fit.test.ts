import type { CaptionWord, Clip, MediaItem } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { fitToVoiceover } from './fit';
import { clipsEndMs, mediaById, normalizeClips } from './model';

const media = mediaById([
  { id: 'img', kind: 'image', src: 'u/media/i.jpg', origin: 'upload' },
  { id: 'short', kind: 'video', src: 'u/media/s.mp4', origin: 'upload', durationMs: 2000 },
  { id: 'long', kind: 'video', src: 'u/media/l.mp4', origin: 'upload', durationMs: 60_000 },
] satisfies MediaItem[]);

function clips(...spec: [string, number][]): Clip[] {
  return normalizeClips(
    spec.map(([mediaId, durationMs], i) => ({
      id: `c${i}`,
      mediaId,
      startMs: 0,
      durationMs,
      trimInMs: 0,
      muted: true,
    })),
  );
}

const lengths = (cs: Clip[]) => cs.map((c) => c.durationMs);

describe('fitToVoiceover', () => {
  it('scales proportionally to the exact target', () => {
    const { clips: out, shortByMs } = fitToVoiceover(
      clips(['img', 1000], ['img', 3000]),
      media,
      8000,
    );
    expect(lengths(out)).toEqual([2000, 6000]);
    expect(shortByMs).toBe(0);
  });

  it('keeps the integer total exact when lengths do not divide evenly', () => {
    const { clips: out } = fitToVoiceover(
      clips(['img', 1000], ['img', 1000], ['img', 1000]),
      media,
      10_001,
    );
    expect(clipsEndMs(out)).toBe(10_001);
    expect(Math.max(...lengths(out)) - Math.min(...lengths(out))).toBeLessThanOrEqual(1);
  });

  it('gives time a capped video cannot take to the other clips', () => {
    // "short" can run 2 s at most; the image takes the rest.
    const { clips: out, shortByMs } = fitToVoiceover(
      clips(['short', 1000], ['img', 1000]),
      media,
      9000,
    );
    expect(lengths(out)).toEqual([2000, 7000]);
    expect(shortByMs).toBe(0);
  });

  it('reports a shortfall when only capped videos remain', () => {
    const { clips: out, shortByMs } = fitToVoiceover(clips(['short', 1000]), media, 5000);
    expect(lengths(out)).toEqual([2000]);
    expect(shortByMs).toBe(3000);
  });

  it('keeps every clip at least the minimum length', () => {
    const { clips: out } = fitToVoiceover(clips(['img', 100_000], ['img', 10]), media, 4000);
    expect(lengths(out)[1]).toBeGreaterThanOrEqual(200);
    expect(clipsEndMs(out)).toBe(4000);
  });

  it('respects a video trim when capping', () => {
    const trimmed = clips(['short', 500], ['img', 500]).map((c, i) =>
      i === 0 ? { ...c, trimInMs: 1500 } : c,
    );
    const { clips: out } = fitToVoiceover(trimmed, media, 4000);
    expect(lengths(out)).toEqual([500, 3500]);
  });

  it('snaps cuts to the gap between words', () => {
    const words: CaptionWord[] = [
      { text: 'one', startMs: 0, endMs: 1800 },
      { text: 'two', startMs: 2200, endMs: 4000 },
    ];
    // Proportional cut at 2000 → middle of the 1800–2200 gap is also 2000.
    const exact = fitToVoiceover(clips(['img', 1], ['img', 1]), media, 4000, words);
    expect(exact.clips[1]!.startMs).toBe(2000);

    const offset: CaptionWord[] = [
      { text: 'one', startMs: 0, endMs: 2100 },
      { text: 'two', startMs: 2300, endMs: 4000 },
    ];
    const snapped = fitToVoiceover(clips(['img', 1], ['img', 1]), media, 4000, offset);
    expect(snapped.clips[1]!.startMs).toBe(2200);
    expect(clipsEndMs(snapped.clips)).toBe(4000);
  });

  it("doesn't snap further than 400 ms or past a clip's limits", () => {
    const far: CaptionWord[] = [
      { text: 'one', startMs: 0, endMs: 2500 },
      { text: 'two', startMs: 2600, endMs: 4000 },
    ];
    const out = fitToVoiceover(clips(['img', 1], ['img', 1]), media, 4000, far);
    expect(out.clips[1]!.startMs).toBe(2000);

    // Snapping to 2550 would make the 2 s "short" video run 2.55 s: not allowed.
    const near: CaptionWord[] = [
      { text: 'a', startMs: 0, endMs: 2500 },
      { text: 'b', startMs: 2600, endMs: 4000 },
    ];
    const capped = fitToVoiceover(clips(['short', 1], ['img', 1]), media, 4000, near);
    expect(capped.clips[0]!.durationMs).toBeLessThanOrEqual(2000);
  });

  it('handles no clips', () => {
    expect(fitToVoiceover([], media, 3000)).toEqual({ clips: [], shortByMs: 3000 });
  });
});
