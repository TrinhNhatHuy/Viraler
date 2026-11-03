import type { Project } from '@viraler/shared';
import {
  overlayState,
  RANK_COLOR,
  RANK_LABEL_STYLE,
  RANKING_TITLE_STYLE,
  rankText,
} from './overlays';
import { drawTextBlock } from './text-block';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Ranking title + the current clip's "#N label" (under the captions layer). */
export function drawRanking(ctx: Ctx, project: Project, tMs: number) {
  const { rankingTitle, rank } = overlayState(project, tMs);
  if (rankingTitle) drawTextBlock(ctx, rankingTitle, RANKING_TITLE_STYLE, { maxLines: 2 });
  if (rank) {
    drawTextBlock(ctx, rankText(rank), RANK_LABEL_STYLE, {
      maxLines: 2,
      firstWordColor: RANK_COLOR,
    });
  }
}

/** The hook title over everything, for its first `durationMs`. */
export function drawHook(ctx: Ctx, project: Project, tMs: number) {
  const { hook } = overlayState(project, tMs);
  if (hook) drawTextBlock(ctx, hook, project.hookTitle.style, { maxLines: 3 });
}
