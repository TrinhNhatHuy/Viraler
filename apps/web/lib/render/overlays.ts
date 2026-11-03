import { DEFAULT_TEXT_STYLE, type Project, type TextStyle } from '@viraler/shared';
import { clipAt } from '@/lib/timeline/model';

/**
 * Which overlay texts are on screen at a time. Shared by the preview and the
 * export so both show exactly the same thing.
 *
 * The hook title shows for its first `durationMs`; while it does, ranking
 * overlays are hidden so the top of the frame never holds two texts.
 */

/** Ranking texts have no style in the project yet (Phase 7 adds that). */
export const RANKING_TITLE_STYLE: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontSizePx: 64,
  positionY: 0.09,
  strokeWidthPx: 6,
};
export const RANK_LABEL_STYLE: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontSizePx: 88,
  positionY: 0.17,
  strokeWidthPx: 8,
};
export const RANK_COLOR = '#ffd400';

export interface OverlayState {
  hook: string | null;
  rankingTitle: string | null;
  rank: { rank: number; label: string } | null;
}

export function overlayState(
  project: Pick<Project, 'hookTitle' | 'ranking' | 'clips'>,
  tMs: number,
): OverlayState {
  const { hookTitle, ranking } = project;
  const hookText = hookTitle.text.trim();
  const hook =
    hookTitle.enabled && hookText && tMs >= 0 && tMs < hookTitle.durationMs ? hookText : null;
  if (hook || !ranking.enabled) return { hook, rankingTitle: null, rank: null };

  const clip = clipAt(project.clips, tMs)?.clip;
  return {
    hook: null,
    rankingTitle: ranking.title.trim() || null,
    rank: clip?.rank !== undefined ? { rank: clip.rank, label: clip.label?.trim() ?? '' } : null,
  };
}

export function rankText(rank: { rank: number; label: string }): string {
  return rank.label ? `#${rank.rank} ${rank.label}` : `#${rank.rank}`;
}
