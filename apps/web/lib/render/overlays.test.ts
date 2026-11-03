import { type Clip, createEmptyProject, type Project } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { normalizeClips } from '@/lib/timeline/model';
import { overlayState, rankText } from './overlays';

const clip = (id: string, durationMs: number, extra: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'm',
  startMs: 0,
  durationMs,
  trimInMs: 0,
  muted: true,
  ...extra,
});

function project(patch: Partial<Project> = {}): Project {
  const p = createEmptyProject();
  return {
    ...p,
    hookTitle: { ...p.hookTitle, enabled: true, text: 'Wait for #1', durationMs: 3000 },
    ranking: { enabled: true, title: 'Fastest animals', order: 'descending' },
    clips: normalizeClips([
      clip('a', 4000, { rank: 3, label: ' Pronghorn ' }),
      clip('b', 4000),
      clip('c', 4000, { rank: 1 }),
    ]),
    ...patch,
  };
}

describe('overlayState', () => {
  it('shows the hook title only during its duration and hides ranking meanwhile', () => {
    expect(overlayState(project(), 0)).toEqual({
      hook: 'Wait for #1',
      rankingTitle: null,
      rank: null,
    });
    expect(overlayState(project(), 2999).hook).toBe('Wait for #1');
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

  it('shows the ranking title and the current clip rank after the hook', () => {
    expect(overlayState(project(), 3500)).toEqual({
      hook: null,
      rankingTitle: 'Fastest animals',
      rank: { rank: 3, label: 'Pronghorn' },
    });
    expect(overlayState(project(), 5000).rank).toBeNull(); // clip b has no rank
    expect(overlayState(project(), 9000).rank).toEqual({ rank: 1, label: '' });
    expect(overlayState(project(), 12_000)).toMatchObject({
      rankingTitle: 'Fastest animals',
      rank: null,
    });
  });

  it('shows nothing for ranking when it is off', () => {
    const p = project();
    expect(overlayState({ ...p, ranking: { ...p.ranking, enabled: false } }, 5000)).toEqual({
      hook: null,
      rankingTitle: null,
      rank: null,
    });
  });
});

describe('rankText', () => {
  it('formats the rank with an optional label', () => {
    expect(rankText({ rank: 3, label: 'Pronghorn' })).toBe('#3 Pronghorn');
    expect(rankText({ rank: 1, label: '' })).toBe('#1');
  });
});
