import { CANVAS_HEIGHT, type TextStyle } from '@viraler/shared';
import { CAPTION_SAFE_WIDTH, lineLeft } from './captions';
import { fontFor } from './fonts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Line height as a multiple of the font size. */
export const LINE_HEIGHT = 1.15;

/**
 * Greedy word wrap within `maxWidth`. A word wider than the line gets a line of
 * its own (the caller scales it down). Past `maxLines`, the last line ends in "…".
 */
export function wrapText(
  text: string,
  measure: (text: string) => number,
  maxWidth: number,
  maxLines = 3,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]!} ${lines.slice(maxLines).join(' ')}`;
  while (measure(`${last}…`) > maxWidth && last.includes(' ')) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export interface TextBlockOptions {
  maxLines?: number;
  /** Draws the first word in this color (e.g. the "#3" of a rank label). */
  firstWordColor?: string;
  /** Overrides `style.color` for the rest of the text. */
  color?: string;
  /** Extra scale around the block's centre and opacity (entrance animations). */
  scale?: number;
  alpha?: number;
}

/**
 * Draws wrapped text centred on `style.positionY`, with stroke and an optional
 * rounded background box. Blocks wider than the safe area are scaled down.
 */
export function drawTextBlock(
  ctx: Ctx,
  text: string,
  style: TextStyle,
  opts: TextBlockOptions = {},
) {
  const display = style.uppercase ? text.toUpperCase() : text;
  ctx.save();
  ctx.font = fontFor(style);
  const measure = (t: string) => ctx.measureText(t).width;
  const lines = wrapText(display, measure, CAPTION_SAFE_WIDTH, opts.maxLines ?? 3);
  if (lines.length === 0) {
    ctx.restore();
    return;
  }
  const widths = lines.map(measure);
  const widest = Math.max(...widths);
  const scale = widest > CAPTION_SAFE_WIDTH ? CAPTION_SAFE_WIDTH / widest : 1;
  const size = style.fontSizePx * scale;
  const lineH = size * LINE_HEIGHT;
  const top = style.positionY * CANVAS_HEIGHT - (lines.length * lineH) / 2;
  const lefts = widths.map((w) => lineLeft(w * scale, style.align));

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const color = opts.color ?? style.color;
  if (opts.alpha !== undefined) ctx.globalAlpha *= Math.max(0, Math.min(1, opts.alpha));
  if (opts.scale !== undefined && opts.scale !== 1) {
    // Scale around the block's centre.
    const cx = (Math.min(...lefts) + Math.max(...lefts.map((l, i) => l + widths[i]! * scale))) / 2;
    const cy = style.positionY * CANVAS_HEIGHT;
    ctx.translate(cx, cy);
    ctx.scale(opts.scale, opts.scale);
    ctx.translate(-cx, -cy);
  }

  if (style.backgroundColor) {
    const padX = size * 0.35;
    const padY = size * 0.18;
    const x0 = Math.min(...lefts) - padX;
    const x1 = Math.max(...lefts.map((l, i) => l + widths[i]! * scale)) + padX;
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(x0, top - padY, x1 - x0, lines.length * lineH + padY * 2, size * 0.25);
    ctx.fill();
  }

  const each = (fn: (line: string, i: number, y: number) => void) =>
    lines.forEach((line, i) => fn(line, i, top + lineH * (i + 0.5)));

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // Each line is drawn at its left edge, scaled; the caller's transform is kept.
  const base = ctx.getTransform();
  const at = (i: number, y: number) => {
    ctx.setTransform(base);
    ctx.translate(lefts[i]!, y);
    ctx.scale(scale, scale);
  };

  if (style.strokeWidthPx > 0) {
    ctx.lineWidth = style.strokeWidthPx * 2;
    ctx.strokeStyle = style.strokeColor;
    each((line, i, y) => {
      at(i, y);
      ctx.strokeText(line, 0, 0);
    });
  }
  each((line, i, y) => {
    at(i, y);
    const space = line.indexOf(' ');
    if (i === 0 && opts.firstWordColor) {
      const first = space === -1 ? line : line.slice(0, space);
      ctx.fillStyle = opts.firstWordColor;
      ctx.fillText(first, 0, 0);
      if (space !== -1) {
        ctx.fillStyle = color;
        ctx.fillText(line.slice(space), measure(first), 0);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillText(line, 0, 0);
    }
  });
  ctx.restore();
}
