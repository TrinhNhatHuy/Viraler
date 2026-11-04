import { type Clip, createEmptyProject, type Project } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { normalizeClips } from '@/lib/timeline/model';
import { overlayState, RANK_LIST_MAX, rankList, rankText } from './overlays';

const clip = (id: string, durationMs: number, extra: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'm',
  startMs: 0,
  durationMs,
  trimInMs: 0,
  muted: true,
  ...extra,
});

/** Hook 0–3 s; clips: a (#3, 0–4 s), b (no rank, 4–8 s), c (#1, 8–12 s). */
function project(patch: Partial<Project['ranking']> = {}): Project {
  const p = createEmptyProject();
  return {
    ...p,
    hookTitle: { ...p.hookTitle, enabled: true, text: 'Wait for #1', durationMs: 3000 },
    ranking: { ...p.ranking, enabled: true, title: 'Fastest animals', ...patch },
    clips: normalizeClips([
      clip('a', 4000, { rank: 3, label: ' Pronghorn ' }),
      clip('b', 4000),
      clip('c', 4000, { rank: 1 }),
    ]),
  };
}

describe('overlayState', () => {
  it('shows the hook title only during its duration and hides ranking meanwhile', () => {
    expect(overlayState(project(), 0)).toEqual({
      hook: { text: 'Wait for #1', elapsedMs: 0 },
      rankingTitle: null,
      rank: null,
      list: null,
    });
    expect(overlayState(project(), 2999).hook?.elapsedMs).toBe(2999);
    expect(overlayState(project(), 3000).hook).toBeNull();
  });

  it('skips a disabled or empty hook title', () => {
    const p = project();
    expect(
      overlayState({ ...p, hookTitle: { ...p.hookTitle, enabled: false } }, 0).hook,
    ).toBeNull();
    expect(overlayState({ ...p, hookTitle: { ...p.hookTitle, text: '  ' } }, 0).rankingTitle).toBe(
      'Fastest animals',
    );
  });

  it('badge: the current clip rank, timed from the clip start', () => {
    expect(overlayState(project(), 3500)).toEqual({
      hook: null,
      rankingTitle: 'Fastest animals',
      rank: { rank: 3, label: 'Pronghorn', elapsedMs: 3500 },
      list: null,
    });
    expect(overlayState(project(), 5000).rank).toBeNull(); // clip b has no rank
    expect(overlayState(project(), 9000).rank).toEqual({ rank: 1, label: '', elapsedMs: 1000 });
  });

  it('list layout: every rank instead of a badge', () => {
    const state = overlayState(project({ layout: 'list' }), 9000);
    expect(state.rank).toBeNull();
    expect(state.list?.map((i) => [i.rank, i.state])).toEqual([
      [1, 'current'],
      [3, 'done'],
    ]);
  });

  it('shows nothing for ranking when it is off', () => {
    expect(overlayState(project({ enabled: false }), 5000)).toEqual({
      hook: null,
      rankingTitle: null,
      rank: null,
      list: null,
    });
  });
});

describe('rankList', () => {
  const clips = normalizeClips([
    clip('a', 1000, { rank: 3, label: 'Three' }),
    clip('b', 1000, { rank: 2, label: 'Two' }),
    clip('b2', 1000, { rank: 2 }), // a second clip for #2
    clip('c', 1000, { rank: 1, label: 'One' }),
  ]);

  it('lists ranks 1…N whatever the play order, with their state', () => {
    const at = (t: number) => rankList(clips, t).map((i) => `${i.rank}:${i.state}`);
    expect(at(0)).toEqual(['1:upcoming', '2:upcoming', '3:current']);
    expect(at(1500)).toEqual(['1:upcoming', '2:current', '3:done']);
    expect(at(2500)).toEqual(['1:upcoming', '2:current', '3:done']); // #2 spans both clips
    expect(at(3500)).toEqual(['1:current', '2:done', '3:done']);
  });

  it('times the pop-in from the rank first clip and keeps its label', () => {
    const two = rankList(clips, 2500).find((i) => i.rank === 2)!;
    expect(two).toMatchObject({ label: 'Two', elapsedMs: 1500 });
  });

  it(`shows at most ${RANK_LIST_MAX} ranks`, () => {
    const many = normalizeClips(
      Array.from({ length: 12 }, (_, i) => clip(`c${i}`, 100, { rank: 12 - i })),
    );
    const list = rankList(many, 0);
    expect(list).toHaveLength(RANK_LIST_MAX);
    expect(list[0]!.rank).toBe(1);
  });
});

describe('rankText', () => {
  it('formats the rank with an optional label', () => {
    expect(rankText({ rank: 3, label: 'Pronghorn' })).toBe('#3 Pronghorn');
    expect(rankText({ rank: 1, label: '' })).toBe('#1');
  });
});
