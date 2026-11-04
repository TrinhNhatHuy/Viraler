import type { Clip, Project } from '@viraler/shared';
import { clipAt } from '@/lib/timeline/model';

/**
 * Which overlay texts are on screen at a time. Shared by the preview and the
 * export so both show exactly the same thing.
 *
 * The hook title shows for its first `durationMs`; while it does, ranking
 * overlays are hidden so the top of the frame never holds two texts.
 */

/** At most this many ranks in the countdown list. */
export const RANK_LIST_MAX = 10;

export interface RankListItem {
  rank: number;
  label: string;
  /** Before its clip, while it plays, or after. */
  state: 'upcoming' | 'current' | 'done';
  /** Time since its clip started (for the pop-in while current). */
  elapsedMs: number;
}

export interface OverlayState {
  hook: { text: string; elapsedMs: number } | null;
  rankingTitle: string | null;
  /** Badge layout: the current clip's rank. */
  rank: { rank: number; label: string; elapsedMs: number } | null;
  /** List layout: every rank. */
  list: RankListItem[] | null;
}

const NONE = { rankingTitle: null, rank: null, list: null };

export function overlayState(
  project: Pick<Project, 'hookTitle' | 'ranking' | 'clips'>,
  tMs: number,
): OverlayState {
  const { hookTitle, ranking } = project;
  const hookText = hookTitle.text.trim();
  if (hookTitle.enabled && hookText && tMs >= 0 && tMs < hookTitle.durationMs) {
    return { hook: { text: hookText, elapsedMs: tMs }, ...NONE };
  }
  if (!ranking.enabled) return { hook: null, ...NONE };

  const rankingTitle = ranking.title.trim() || null;
  if (ranking.layout === 'list') {
    return { hook: null, rankingTitle, rank: null, list: rankList(project.clips, tMs) };
  }
  const clip = clipAt(project.clips, tMs)?.clip;
  return {
    hook: null,
    rankingTitle,
    rank:
      clip?.rank !== undefined
        ? { rank: clip.rank, label: clip.label?.trim() ?? '', elapsedMs: tMs - clip.startMs }
        : null,
    list: null,
  };
}

/**
 * The countdown list: each distinct rank once, shown 1…N top to bottom (at
 * most RANK_LIST_MAX), whatever order the clips play in. A rank spans from its
 * first clip's start to its last clip's end.
 */
export function rankList(clips: readonly Clip[], tMs: number): RankListItem[] {
  const spans = new Map<number, { start: number; end: number; label: string }>();
  for (const c of clips) {
    if (c.rank === undefined) continue;
    const span = spans.get(c.rank);
    const end = c.startMs + c.durationMs;
    const label = c.label?.trim() ?? '';
    if (!span) spans.set(c.rank, { start: c.startMs, end, label });
    else {
      span.start = Math.min(span.start, c.startMs);
      span.end = Math.max(span.end, end);
      span.label ||= label;
    }
  }
  return [...spans.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, RANK_LIST_MAX)
    .map(([rank, span]) => ({
      rank,
      label: span.label,
      state: tMs < span.start ? 'upcoming' : tMs < span.end ? 'current' : 'done',
      elapsedMs: tMs - span.start,
    }));
}

export function rankText(rank: { rank: number; label: string }): string {
  return rank.label ? `#${rank.rank} ${rank.label}` : `#${rank.rank}`;
}
