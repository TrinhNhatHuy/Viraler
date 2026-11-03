import type { Clip } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { numberClips, setClipLabel, setClipRank } from './ranking';

const clips: Clip[] = ['a', 'b', 'c'].map((id, i) => ({
  id,
  mediaId: 'm',
  startMs: i * 1000,
  durationMs: 1000,
  trimInMs: 0,
  muted: true,
}));

describe('numberClips', () => {
  it('counts down for descending order', () => {
    expect(numberClips(clips, 'descending').map((c) => c.rank)).toEqual([3, 2, 1]);
  });

  it('counts up for ascending order', () => {
    expect(numberClips(clips, 'ascending').map((c) => c.rank)).toEqual([1, 2, 3]);
  });
});

describe('setClipRank', () => {
  it('sets, clamps and clears a rank', () => {
    expect(setClipRank(clips, 'b', 4)[1]!.rank).toBe(4);
    expect(setClipRank(clips, 'b', 500)[1]!.rank).toBe(99);
    const ranked = setClipRank(clips, 'b', 2);
    expect(setClipRank(ranked, 'b', undefined)[1]).not.toHaveProperty('rank');
    expect(setClipRank(ranked, 'b', 0)[1]).not.toHaveProperty('rank');
    expect(setClipRank(ranked, 'b', 2)).toBe(ranked);
  });
});

describe('setClipLabel', () => {
  it('keeps the label as typed and removes it when blank', () => {
    const typed = setClipLabel(clips, 'a', 'Pronghorn ');
    expect(typed[0]!.label).toBe('Pronghorn ');
    expect(setClipLabel(typed, 'a', '   ')[0]).not.toHaveProperty('label');
    expect(setClipLabel(clips, 'a', 'x'.repeat(100))[0]!.label).toHaveLength(60);
    expect(setClipLabel(clips, 'zz', 'x')).toBe(clips);
  });
});
