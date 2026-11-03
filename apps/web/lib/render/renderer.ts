import { CANVAS_HEIGHT, CANVAS_WIDTH, type Project } from '@viraler/shared';
import { drawClips } from './draw-clips';
import { CaptionLayoutCache, drawCaptions } from './draw-captions';
import { drawHook, drawRanking } from './draw-overlays';
import type { FrameSource } from './media-pool';

/**
 * Draws one frame of the project at `tMs` onto a 1080×1920 canvas. The editor
 * preview and the MP4 export both use it, so they match. Layers, bottom to top:
 * background, current clip, ranking overlays, captions, hook title.
 */
export class Renderer {
  private readonly captions = new CaptionLayoutCache();

  render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    project: Project,
    tMs: number,
    frames?: FrameSource,
  ) {
    ctx.fillStyle = project.canvas.background;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (frames) drawClips(ctx, project, tMs, frames);
    drawRanking(ctx, project, tMs);
    if (project.captions.enabled) drawCaptions(ctx, project.captions, tMs, this.captions);
    drawHook(ctx, project, tMs);
  }

  /** Text measurements are stale (e.g. a font finished loading). */
  invalidateText() {
    this.captions.clear();
  }
}
