import { CANVAS_HEIGHT, CANVAS_WIDTH, type Project } from '@viraler/shared';
import { drawClips } from './draw-clips';
import { CaptionLayoutCache, drawCaptions } from './draw-captions';
import type { FrameSource } from './media-pool';

/**
 * Draws one frame of the project at `tMs` onto a 1080×1920 canvas. Used by the
 * editor preview now and by the MP4 export later (Phase 6 adds the hook
 * title and ranking layers). Layers: background, the current clip, captions.
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
    if (project.captions.enabled) drawCaptions(ctx, project.captions, tMs, this.captions);
  }

  /** Text measurements are stale (e.g. a font finished loading). */
  invalidateText() {
    this.captions.clear();
  }
}
