import type { CaptionWord, Clip, MediaItem } from '@viraler/shared';
import { formatTimecode } from '@/lib/format';
import { msToX, PAD_X, rulerTicks, type TimelineLayout, type TimelineView } from './view';

/** Draws the timeline canvas: ruler, clips, voiceover waveform, caption words, playhead. */

export interface Palette {
  /** Text/lines, from the page's foreground color. */
  fg: string;
  clip: string;
  selected: string;
  playhead: string;
  wave: string;
  word: string;
  wordActive: string;
  warn: string;
}

export const DEFAULT_PALETTE: Palette = {
  fg: '#111827',
  clip: '#3b82f6',
  selected: '#f59e0b',
  playhead: '#ef4444',
  wave: '#10b981',
  word: '#8b5cf6',
  wordActive: '#f59e0b',
  warn: '#f59e0b',
};

export type DragPreview =
  { kind: 'move'; index: number; x: number; insertAt: number } | { kind: 'drop'; insertAt: number };

export interface TimelineScene {
  width: number;
  view: TimelineView;
  layout: TimelineLayout;
  clips: readonly Clip[];
  media: ReadonlyMap<string, MediaItem>;
  words: readonly CaptionWord[];
  captionsStale: boolean;
  voiceoverMs: number;
  peaks: Float32Array | null;
  playheadMs: number;
  selectedClipId: string | null;
  thumb: (mediaId: string) => HTMLImageElement | null;
  drag: DragPreview | null;
  palette: Palette;
}

type Ctx = CanvasRenderingContext2D;

export function drawTimeline(ctx: Ctx, s: TimelineScene): void {
  const { layout, width } = s;
  ctx.clearRect(0, 0, width, layout.height);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  drawRuler(ctx, s);
  drawClips(ctx, s);
  drawVoice(ctx, s);
  drawWords(ctx, s);
  drawPlayhead(ctx, s);
}

function drawRuler(ctx: Ctx, { view, width, layout, palette }: TimelineScene) {
  const { y, h } = layout.ruler;
  ctx.save();
  ctx.strokeStyle = palette.fg;
  ctx.fillStyle = palette.fg;
  for (const tick of rulerTicks(view, width)) {
    const x = Math.round(msToX(tick.ms, view)) + 0.5;
    if (x < 0 || x > width) continue;
    ctx.globalAlpha = tick.label ? 0.5 : 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y + h - (tick.label ? 8 : 4));
    ctx.lineTo(x, y + h);
    ctx.stroke();
    if (tick.label) {
      ctx.globalAlpha = 0.65;
      ctx.fillText(tick.label, x + 3, y + 7);
    }
  }
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, w / 2));
}

function drawClips(ctx: Ctx, s: TimelineScene) {
  const { view, layout, clips, palette, drag, width } = s;
  const { y, h } = layout.clips;
  if (clips.length === 0) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = palette.fg;
    ctx.fillText('Add media from the Media tab (or drag it here)', PAD_X, y + h / 2);
    ctx.restore();
  }
  clips.forEach((clip, index) => {
    const x0 = msToX(clip.startMs, view);
    const x1 = msToX(clip.startMs + clip.durationMs, view);
    if (x1 < 0 || x0 > width) return;
    const dragged = drag?.kind === 'move' && drag.index === index;
    drawClip(ctx, s, clip, x0 + 1, y, x1 - x0 - 2, h, dragged ? 0.35 : 1);
  });
  if (drag?.kind === 'move') {
    const clip = clips[drag.index];
    if (clip) {
      const w = clip.durationMs * view.pxPerMs;
      drawClip(ctx, s, clip, drag.x - Math.min(w, 80) / 2, y - 3, Math.min(w, 160), h, 0.85);
    }
  }
  if (drag) {
    const at = drag.insertAt;
    const ms = at < clips.length ? clips[at]!.startMs : clips.reduce((t, c) => t + c.durationMs, 0);
    const x = msToX(ms, view);
    ctx.save();
    ctx.fillStyle = palette.selected;
    ctx.fillRect(x - 1.5, y - 4, 3, h + 8);
    ctx.restore();
  }
}

function drawClip(
  ctx: Ctx,
  s: TimelineScene,
  clip: Clip,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
) {
  const { palette } = s;
  const media = s.media.get(clip.mediaId);
  const selected = clip.id === s.selectedClipId;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = media ? palette.clip : palette.warn;
  ctx.globalAlpha = alpha * 0.35;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.clip();

  // Thumbnail tiles across the clip.
  const img = media ? s.thumb(media.id) : null;
  if (img && img.naturalWidth > 0) {
    const tileW = Math.max(24, (h * img.naturalWidth) / img.naturalHeight);
    for (let tx = x; tx < x + w; tx += tileW) ctx.drawImage(img, tx, y, tileW, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x, y + h - 18, w, 18);
  }

  ctx.fillStyle = img ? '#ffffff' : palette.fg;
  const label = media
    ? (media.name ?? (media.kind === 'video' ? 'Video' : 'Image'))
    : 'Missing media';
  const text = `${clip.muted ? '🔇 ' : ''}${label} · ${formatTimecode(clip.durationMs)}`;
  if (w > 30) ctx.fillText(text, x + 6, y + h - 9, w - 12);
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, 6);
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeStyle = selected ? palette.selected : palette.clip;
  ctx.globalAlpha = alpha * (selected ? 1 : 0.7);
  ctx.stroke();
  if (selected && w > 16) {
    // Trim handles.
    ctx.fillStyle = palette.selected;
    ctx.fillRect(x, y + h / 2 - 10, 3, 20);
    ctx.fillRect(x + w - 3, y + h / 2 - 10, 3, 20);
  }
  ctx.restore();
}

function drawVoice(ctx: Ctx, { view, layout, voiceoverMs, peaks, palette, width }: TimelineScene) {
  const { y, h } = layout.voice;
  ctx.save();
  if (voiceoverMs <= 0) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = palette.fg;
    ctx.fillText('No voiceover', PAD_X, y + h / 2);
    ctx.restore();
    return;
  }
  const x0 = Math.max(0, msToX(0, view));
  const x1 = Math.min(width, msToX(voiceoverMs, view));
  ctx.fillStyle = palette.wave;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(x0, y, x1 - x0, h);
  ctx.globalAlpha = 0.8;
  const mid = y + h / 2;
  for (let x = Math.floor(x0); x < x1; x += 2) {
    const ms = (x - PAD_X) / view.pxPerMs + view.scrollMs;
    const peak = peaks ? (peaks[Math.floor((ms / voiceoverMs) * peaks.length)] ?? 0) : 0.15;
    const bar = Math.max(1, peak * (h - 4));
    ctx.fillRect(x, mid - bar / 2, 1.5, bar);
  }
  ctx.restore();
}

function drawWords(ctx: Ctx, s: TimelineScene) {
  const { view, layout, words, palette, playheadMs, width, captionsStale } = s;
  const { y, h } = layout.captions;
  ctx.save();
  if (words.length === 0) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = palette.fg;
    ctx.fillText('No captions', PAD_X, y + h / 2);
    ctx.restore();
    return;
  }
  for (const word of words) {
    const x0 = msToX(word.startMs, view);
    const x1 = msToX(word.endMs, view);
    if (x1 < 0 || x0 > width) continue;
    const active = playheadMs >= word.startMs && playheadMs < word.endMs;
    roundRect(ctx, x0, y + 2, Math.max(2, x1 - x0 - 1), h - 4, 3);
    ctx.fillStyle = captionsStale ? palette.warn : active ? palette.wordActive : palette.word;
    ctx.globalAlpha = active ? 0.9 : 0.45;
    ctx.fill();
    const textW = ctx.measureText(word.text).width;
    if (x1 - x0 > textW + 6) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.fg;
      ctx.fillText(word.text, x0 + 3, y + h / 2);
    }
  }
  ctx.restore();
}

function drawPlayhead(ctx: Ctx, { view, layout, playheadMs, palette }: TimelineScene) {
  const x = Math.round(msToX(playheadMs, view)) + 0.5;
  ctx.save();
  ctx.strokeStyle = palette.playhead;
  ctx.fillStyle = palette.playhead;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, layout.height);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, 0);
  ctx.lineTo(x + 5, 0);
  ctx.lineTo(x, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
