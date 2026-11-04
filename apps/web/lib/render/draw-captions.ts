import { CANVAS_HEIGHT, type Captions } from '@viraler/shared';
import {
  buildCaptionPages,
  CAPTION_SAFE_WIDTH,
  type CaptionPage,
  captionFrameAt,
  lineLeft,
} from './captions';
import { wordPopScale } from './animation';
import { fontFor } from './fonts';
import { LINE_HEIGHT } from './text-block';

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

/**
 * Draws the caption page on screen at `tMs` (nothing between pages): lines
 * stacked around `positionY`, the spoken word highlighted per `highlightMode`,
 * and popped when `animation` is 'pop'.
 */
export function drawCaptions(ctx: Ctx, captions: Captions, tMs: number, cache: CaptionLayoutCache) {
  const frame = captionFrameAt(cache.get(ctx, captions), tMs);
  if (!frame) return;
  const { page, activeIndex } = frame;
  const { style } = captions;
  const size = style.fontSizePx;

  // A single word wider than the safe area is scaled down to fit.
  const scale = page.width > CAPTION_SAFE_WIDTH ? CAPTION_SAFE_WIDTH / page.width : 1;
  const lineH = size * LINE_HEIGHT * scale;
  const top = style.positionY * CANVAS_HEIGHT - (page.lineWidths.length * lineH) / 2;
  const lineX = page.lineWidths.map((w) => lineLeft(w * scale, style.align));
  const lineY = page.lineWidths.map((_, i) => top + lineH * (i + 0.5));
  const active = page.words[activeIndex];
  const pop = style.animation === 'pop' && active ? wordPopScale(tMs - active.startMs) : 1;

  ctx.save();
  ctx.font = fontFor(style);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const base = ctx.getTransform();

  /** Moves to the word's centre (scaled, popped if active); text is drawn at -width/2. */
  const at = (i: number) => {
    const w = page.words[i]!;
    const s = scale * (i === activeIndex ? pop : 1);
    ctx.setTransform(base);
    ctx.translate(lineX[w.line]! + (w.x + w.width / 2) * scale, lineY[w.line]!);
    ctx.scale(s, s);
    return w;
  };

  if (style.backgroundColor) {
    const padX = size * 0.35 * scale;
    const padY = size * 0.2 * scale;
    const x0 = Math.min(...lineX) - padX;
    const x1 = Math.max(...lineX.map((x, i) => x + page.lineWidths[i]! * scale)) + padX;
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(x0, top - padY, x1 - x0, page.lineWidths.length * lineH + padY * 2, size * 0.25);
    ctx.fill();
  }

  if (style.highlightMode === 'box' && active) {
    const w = at(activeIndex);
    const pad = size * 0.14;
    ctx.fillStyle = style.highlightColor;
    ctx.beginPath();
    ctx.roundRect(-w.width / 2 - pad, -size * 0.58, w.width + pad * 2, size * 1.16, size * 0.18);
    ctx.fill();
  }

  // All strokes first, so an outline never covers the neighboring word's fill.
  if (style.strokeWidthPx > 0) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = style.strokeWidthPx * 2; // half of a stroke falls inside the glyph
    ctx.strokeStyle = style.strokeColor;
    page.words.forEach((_, i) => {
      const w = at(i);
      ctx.strokeText(w.text, -w.width / 2, 0);
    });
  }
  page.words.forEach((_, i) => {
    const lit =
      style.highlightMode === 'color'
        ? i === activeIndex
        : style.highlightMode === 'karaoke'
          ? i <= activeIndex
          : false;
    const w = at(i);
    ctx.fillStyle = lit ? style.highlightColor : style.color;
    ctx.fillText(w.text, -w.width / 2, 0);
  });
  ctx.restore();
}
