import {
  type CaptionWord,
  type Clip,
  createEmptyProject,
  type MediaItem,
  type Project,
} from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { clipsEndMs, normalizeClips } from '@/lib/timeline/model';
import { findRankMarkers, syncRanksToVoiceover } from './sync';

/** Words 300 ms long with 100 ms gaps, from `startMs`. */
function words(text: string, startMs = 0): CaptionWord[] {
  return text.split(' ').map((t, i) => ({
    text: t,
    startMs: startMs + i * 400,
    endMs: startMs + i * 400 + 300,
  }));
}

const media: MediaItem[] = [
  { id: 'img', kind: 'image', src: 'u/media/i.jpg', origin: 'upload' },
  { id: 'short', kind: 'video', src: 'u/media/s.mp4', origin: 'upload', durationMs: 1500 },
];

const clip = (id: string, extra: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'img',
  startMs: 0,
  durationMs: 2000,
  trimInMs: 0,
  muted: true,
  ...extra,
});

function project(script: string, clips: Clip[], durationMs = 20_000): Project {
  const src = 'u/p/voiceover/vo.wav';
  const p = createEmptyProject();
  return {
    ...p,
    voiceover: { src, durationMs, source: 'tts', volume: 1 },
    captions: { ...p.captions, words: words(script), voiceoverSrc: src },
    media,
    clips: normalizeClips(clips),
  };
}

describe('findRankMarkers', () => {
  it('finds "Number 3:", "number three", "#2" and "No. 1"', () => {
    const w = words('Number 3: pronghorn. number three again #2 cheetah No. 1 falcon');
    expect(findRankMarkers(w).map((m) => [m.rank, w[m.wordIndex]!.text])).toEqual([
      [3, 'Number'],
      [3, 'number'],
      [2, '#2'],
      [1, 'No.'],
    ]);
  });

  it('ignores "no" without a dot and numbers without a marker word', () => {
    expect(findRankMarkers(words('no one knows the top 3 animals'))).toEqual([]);
  });

  it('cuts in the middle of the gap before the marker', () => {
    const [m] = findRankMarkers(words('intro then Number two'));
    // "then" ends at 700, "Number" starts at 800.
    expect(m!.cutMs).toBe(750);
  });
});

describe('syncRanksToVoiceover', () => {
  const script =
    'Top three fastest animals. Number three: pronghorn runs fast. Number two: the cheetah. Number one: peregrine falcon dives.';
  const w = words(script);
  const cutAt = (marker: number) => Math.round((w[marker - 1]!.endMs + w[marker]!.startMs) / 2);
  const idx = (n: number) =>
    w.findIndex(
      (x, i) => x.text === 'Number' && w[i + 1]!.text.startsWith(['', 'one', 'two', 'three'][n]!),
    );

  it('starts each ranked clip where its number is said, after an intro clip', () => {
    const p = project(script, [
      clip('intro'),
      clip('c3', { rank: 3 }),
      clip('c2', { rank: 2 }),
      clip('c1', { rank: 1 }),
    ]);
    const res = syncRanksToVoiceover(p);
    if (res.kind !== 'ok') throw new Error(res.message);
    expect(res.found).toEqual([3, 2, 1]);
    expect(res.missing).toEqual([]);
    expect(res.clips.map((c) => c.startMs)).toEqual([
      0,
      cutAt(idx(3)),
      cutAt(idx(2)),
      cutAt(idx(1)),
    ]);
    expect(clipsEndMs(res.clips)).toBe(20_000);
    expect(res.shortfalls).toEqual([]);
  });

  it('skips an early decoy mention of a rank', () => {
    const decoy = 'Wait until number one surprises you. Number two: cheetah. Number one: falcon.';
    const dw = words(decoy);
    const p = project(decoy, [clip('intro'), clip('c2', { rank: 2 }), clip('c1', { rank: 1 })]);
    const res = syncRanksToVoiceover(p);
    if (res.kind !== 'ok') throw new Error(res.message);
    const second = dw.findIndex(
      (x, i) => i > 5 && x.text === 'Number' && dw[i + 1]!.text === 'one:',
    );
    expect(res.clips[2]!.startMs).toBe(
      Math.round((dw[second - 1]!.endMs + dw[second]!.startMs) / 2),
    );
  });

  it('lets unranked clips share their span', () => {
    const p = project(script, [
      clip('intro'),
      clip('c3', { rank: 3 }),
      clip('broll', { durationMs: 2000 }),
      clip('c2', { rank: 2 }),
      clip('c1', { rank: 1 }),
    ]);
    const res = syncRanksToVoiceover(p);
    if (res.kind !== 'ok') throw new Error(res.message);
    const span = cutAt(idx(2)) - cutAt(idx(3));
    expect(res.clips[1]!.durationMs + res.clips[2]!.durationMs).toBe(span);
    expect(Math.abs(res.clips[1]!.durationMs - res.clips[2]!.durationMs)).toBeLessThanOrEqual(1);
  });

  it('reports a span a video is too short for, and re-syncs at the next rank', () => {
    const p = project(script, [
      clip('intro'),
      clip('c3', { rank: 3, mediaId: 'short' }),
      clip('c2', { rank: 2 }),
      clip('c1', { rank: 1 }),
    ]);
    const res = syncRanksToVoiceover(p);
    if (res.kind !== 'ok') throw new Error(res.message);
    expect(res.clips[1]!.durationMs).toBe(1500);
    expect(res.shortfalls).toEqual([
      { rank: 3, needMs: cutAt(idx(2)) - cutAt(idx(3)), haveMs: 1500 },
    ]);
    expect(res.clips[3]!.startMs).toBe(cutAt(idx(1))); // back in sync
  });

  it('reports ranks that are never said', () => {
    const p = project('Number two: cheetah. Number one: falcon.', [
      clip('c3', { rank: 3 }),
      clip('c2', { rank: 2 }),
      clip('c1', { rank: 1 }),
    ]);
    const res = syncRanksToVoiceover(p);
    if (res.kind !== 'ok') throw new Error(res.message);
    expect(res.found).toEqual([2, 1]);
    expect(res.missing).toEqual([3]);
  });

  it('explains what is missing', () => {
    const ok = project(script, [clip('c1', { rank: 1 })]);
    const noVo = { ...ok };
    delete noVo.voiceover;
    expect(syncRanksToVoiceover(noVo)).toMatchObject({ kind: 'error', message: /voiceover/ });
    const stale = { ...ok, captions: { ...ok.captions, voiceoverSrc: 'u/p/voiceover/old.wav' } };
    expect(syncRanksToVoiceover(stale)).toMatchObject({ kind: 'error', message: /captions/ });
    expect(syncRanksToVoiceover(project(script, [clip('a')]))).toMatchObject({
      kind: 'error',
      message: /ranks first/,
    });
    expect(
      syncRanksToVoiceover(project('just some words', [clip('a', { rank: 1 })])),
    ).toMatchObject({ kind: 'error', message: /No rank markers/ });
  });
});
