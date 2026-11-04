import { CANVAS_HEIGHT, type Project } from '@viraler/shared';
import { entrance } from './animation';
import { overlayState, rankText } from './overlays';
import { drawTextBlock, LINE_HEIGHT } from './text-block';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** List items are smaller than the badge, from the same label style. */
export const LIST_SIZE_FACTOR = 0.6;
const LIST_ROW_SPACING = 1.25;
const UPCOMING_ALPHA = 0.55;

/** Ranking title + the current rank (badge) or the countdown list; under the captions. */
export function drawRanking(ctx: Ctx, project: Project, tMs: number) {
  const { rankingTitle, rank, list } = overlayState(project, tMs);
  const { titleStyle, labelStyle, rankColor } = project.ranking;
  const pop = project.ranking.entrance === 'pop';
  if (rankingTitle) drawTextBlock(ctx, rankingTitle, titleStyle, { maxLines: 2 });

  if (rank) {
    drawTextBlock(ctx, rankText(rank), labelStyle, {
      maxLines: 2,
      firstWordColor: rankColor,
      ...(pop && entrance(rank.elapsedMs)),
    });
  }

  if (list) {
    const size = Math.round(labelStyle.fontSizePx * LIST_SIZE_FACTOR);
    const rowH = size * LINE_HEIGHT * LIST_ROW_SPACING;
    const style = { ...labelStyle, fontSizePx: size, align: 'left' as const };
    list.forEach((item, i) => {
      const positionY = labelStyle.positionY + (i * rowH) / CANVAS_HEIGHT;
      const itemStyle = { ...style, positionY };
      if (item.state === 'upcoming') {
        drawTextBlock(ctx, `#${item.rank}`, itemStyle, { maxLines: 1, alpha: UPCOMING_ALPHA });
      } else if (item.state === 'current') {
        drawTextBlock(ctx, rankText(item), itemStyle, {
          maxLines: 1,
          color: rankColor,
          firstWordColor: rankColor,
          ...(pop && entrance(item.elapsedMs)),
        });
      } else {
        drawTextBlock(ctx, rankText(item), itemStyle, { maxLines: 1, firstWordColor: rankColor });
      }
    });
  }
}

/** The hook title over everything, for its first `durationMs`. */
export function drawHook(ctx: Ctx, project: Project, tMs: number) {
  const { hook } = overlayState(project, tMs);
  if (!hook) return;
  drawTextBlock(ctx, hook.text, project.hookTitle.style, {
    maxLines: 3,
    ...(project.hookTitle.entrance === 'pop' && entrance(hook.elapsedMs)),
  });
}
