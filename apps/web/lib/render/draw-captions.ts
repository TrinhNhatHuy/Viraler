import { CANVAS_HEIGHT, type Captions } from '@viraler/shared';
import {
  buildCaptionPages,
  CAPTION_SAFE_WIDTH,
  type CaptionPage,
  captionFrameAt,
  lineLeft,
} from './captions';
import { fontFor } from './fonts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Builds caption pages once per (words, style, font) and reuses them for every
 * frame. Project updates create new objects, so identity is enough to detect changes.
 */
export class CaptionLayoutCache {
  private key: { words: Captions['words']; style: Captions['style']; font: string } | null = null;
  private pages: CaptionPage[] = [];

  get(ctx: Ctx, captions: Captions): CaptionPage[] {
    const font = fontFor(captions.style);
    const k = this.key;
    if (k && k.words === captions.words && k.style === captions.style && k.font === font) {
      return this.pages;
    }
    ctx.save();
    ctx.font = font;
    this.pages = buildCaptionPages(captions.words, captions.style, (t) => ctx.measureText(t).width);
    ctx.restore();
    this.key = { words: captions.words, style: captions.style, font };
    return this.pages;
  }

  /** Call after fonts finish loading: text widths change. */
  clear() {
    this.key = null;
  }
}

/** Draws the caption page on screen at `tMs` (nothing between pages). */
export function drawCaptions(ctx: Ctx, captions: Captions, tMs: number, cache: CaptionLayoutCache) {
  const frame = captionFrameAt(cache.get(ctx, captions), tMs);
  if (!frame) return;
  const { page, activeIndex } = frame;
  const { style } = captions;
  const size = style.fontSizePx;

  // A single word wider than the safe area is scaled down to fit.
  const scale = page.width > CAPTION_SAFE_WIDTH ? CAPTION_SAFE_WIDTH / page.width : 1;
  const x0 = lineLeft(page.width * scale, style.align);
  const y = style.positionY * CANVAS_HEIGHT;

  ctx.save();
  ctx.translate(x0, y);
  ctx.scale(scale, scale);
  ctx.font = fontFor(style);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  if (style.backgroundColor) {
    const padX = size * 0.35;
    const padY = size * 0.2;
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(-padX, -size / 2 - padY, page.width + padX * 2, size + padY * 2, size * 0.25);
    ctx.fill();
  }

  // All strokes first, so an outline never covers the neighboring word's fill.
  if (style.strokeWidthPx > 0) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = style.strokeWidthPx * 2; // half of a stroke falls inside the glyph
    ctx.strokeStyle = style.strokeColor;
    for (const w of page.words) ctx.strokeText(w.text, w.x, 0);
  }
  page.words.forEach((w, i) => {
    ctx.fillStyle = i === activeIndex ? style.highlightColor : style.color;
    ctx.fillText(w.text, w.x, 0);
  });
  ctx.restore();
}
