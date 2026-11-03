import { CANVAS_HEIGHT, CANVAS_WIDTH, type Project } from '@viraler/shared';
import { clipAt } from '@/lib/timeline/model';
import { fitRect } from './fit';
import type { FrameSource } from './media-pool';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws the clip playing at `tMs` (fill = cover, fit = letterbox over the background). */
export function drawClips(ctx: Ctx, project: Project, tMs: number, frames: FrameSource): void {
  const hit = clipAt(project.clips, tMs);
  if (!hit) return;
  const frame = frames.frame(hit.clip.mediaId);
  if (frame === 'loading' || frame === 'missing') {
    drawNotice(ctx, frame === 'loading' ? 'Loading…' : 'Missing media');
    return;
  }
  const r = fitRect(frame.width, frame.height, CANVAS_WIDTH, CANVAS_HEIGHT, project.canvas.fit);
  frame.draw(ctx, r.x, r.y, r.w, r.h);
}

function drawNotice(ctx: Ctx, text: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '600 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.restore();
}
