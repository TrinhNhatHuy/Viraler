import type { CaptionWord, Clip } from '@viraler/shared';
import { clamp } from './model';

/** Timeline geometry: time ↔ pixels, zoom, rows, ruler ticks and hit testing. */

export const PAD_X = 12;
/** Pointer distance (px) that grabs a clip or word edge. */
export const EDGE_GRAB_PX = 6;
export const MIN_PX_PER_MS = 0.005; // 5 px per second
export const MAX_PX_PER_MS = 0.5; // 500 px per second

export interface Row {
  y: number;
  h: number;
}

export interface TimelineLayout {
  width: number;
  height: number;
  ruler: Row;
  clips: Row;
  voice: Row;
  captions: Row;
}

export function layoutFor(width: number): TimelineLayout {
  const ruler = { y: 0, h: 20 };
  const clips = { y: 26, h: 56 };
  const voice = { y: 88, h: 26 };
  const captions = { y: 118, h: 26 };
  return { width, height: captions.y + captions.h + 6, ruler, clips, voice, captions };
}

export interface TimelineView {
  pxPerMs: number;
  /** Time at the left edge of the content area. */
  scrollMs: number;
}

export const msToX = (ms: number, v: TimelineView): number => (ms - v.scrollMs) * v.pxPerMs + PAD_X;
export const xToMs = (x: number, v: TimelineView): number => (x - PAD_X) / v.pxPerMs + v.scrollMs;

/** Zoom that shows `durationMs` (plus a little room) across `width` px. */
export function fitView(durationMs: number, width: number): TimelineView {
  const content = Math.max(1, width - PAD_X * 2);
  const span = Math.max(durationMs * 1.05, 5000);
  return { pxPerMs: clamp(content / span, MIN_PX_PER_MS, MAX_PX_PER_MS), scrollMs: 0 };
}

/** Zooms by `factor`, keeping the time under `anchorX` in place. */
export function zoomAt(v: TimelineView, factor: number, anchorX: number): TimelineView {
  const anchorMs = xToMs(anchorX, v);
  const pxPerMs = clamp(v.pxPerMs * factor, MIN_PX_PER_MS, MAX_PX_PER_MS);
  return { pxPerMs, scrollMs: Math.max(0, anchorMs - (anchorX - PAD_X) / pxPerMs) };
}

/** Keeps the scroll within [0, end of content]. */
export function clampScroll(v: TimelineView, durationMs: number, width: number): TimelineView {
  const visibleMs = (width - PAD_X * 2) / v.pxPerMs;
  const max = Math.max(0, durationMs - visibleMs * 0.5);
  const scrollMs = clamp(v.scrollMs, 0, max);
  return scrollMs === v.scrollMs ? v : { ...v, scrollMs };
}

const TICK_STEPS = [100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000];

export interface Tick {
  ms: number;
  label: string | null;
}

/** Ruler ticks for the visible range: labelled ones at least ~70 px apart. */
export function rulerTicks(v: TimelineView, width: number): Tick[] {
  const step = TICK_STEPS.find((s) => s * v.pxPerMs >= 70) ?? TICK_STEPS.at(-1)!;
  const minor = step / 5;
  const start = Math.max(0, Math.floor(v.scrollMs / minor) * minor);
  const end = xToMs(width, v);
  const ticks: Tick[] = [];
  for (let ms = start; ms <= end; ms += minor) {
    const t = Math.round(ms);
    ticks.push({ ms: t, label: t % step === 0 ? formatTick(t, step) : null });
  }
  return ticks;
}

function formatTick(ms: number, step: number): string {
  const s = ms / 1000;
  if (step < 1000) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return m > 0 ? `${m}:${String(rest).padStart(2, '0')}` : `${rest}s`;
}

export type Hit =
  | { type: 'clip' | 'clip-start' | 'clip-end'; index: number }
  | { type: 'word' | 'word-start' | 'word-end'; index: number }
  | { type: 'ruler' | 'track' };

const inRow = (y: number, r: Row) => y >= r.y && y < r.y + r.h;

/** What's under the pointer. Edges win over bodies when within EDGE_GRAB_PX. */
export function hitTest(
  x: number,
  y: number,
  v: TimelineView,
  layout: TimelineLayout,
  clips: readonly Clip[],
  words: readonly CaptionWord[],
): Hit {
  if (inRow(y, layout.ruler)) return { type: 'ruler' };
  if (inRow(y, layout.clips)) {
    const hit = spanHit(x, v, clips, (c) => [c.startMs, c.startMs + c.durationMs]);
    if (hit) return { type: `clip${hit.edge}`, index: hit.index };
  }
  if (inRow(y, layout.captions)) {
    const hit = spanHit(x, v, words, (w) => [w.startMs, w.endMs]);
    if (hit) return { type: `word${hit.edge}`, index: hit.index };
  }
  return { type: 'track' };
}

function spanHit<T>(
  x: number,
  v: TimelineView,
  items: readonly T[],
  span: (item: T) => [number, number],
): { index: number; edge: '' | '-start' | '-end' } | null {
  const xs = items.map((item) => span(item).map((ms) => msToX(ms, v)) as [number, number]);
  const body = xs.findIndex(([xa, xb]) => x >= xa && x < xb);
  // Where two items touch, grab the edge of the one under the pointer; past the
  // last item (nothing under the pointer) an edge can be grabbed from outside.
  let edgeHit: { index: number; edge: '-start' | '-end'; dist: number } | null = null;
  xs.forEach(([xa, xb], index) => {
    const dStart = Math.abs(x - xa);
    if (dStart <= EDGE_GRAB_PX && (x >= xa || body === -1) && (!edgeHit || dStart < edgeHit.dist)) {
      edgeHit = { index, edge: '-start', dist: dStart };
    }
    const dEnd = Math.abs(x - xb);
    if (dEnd <= EDGE_GRAB_PX && (x < xb || body === -1) && (!edgeHit || dEnd < edgeHit.dist)) {
      edgeHit = { index, edge: '-end', dist: dEnd };
    }
  });
  const hit = edgeHit as { index: number; edge: '-start' | '-end' } | null;
  if (hit) return { index: hit.index, edge: hit.edge };
  return body !== -1 ? { index: body, edge: '' } : null;
}

/** Snaps `ms` to the nearest target within `thresholdPx` on screen. */
export function snapMs(
  ms: number,
  targets: readonly number[],
  v: TimelineView,
  thresholdPx = 6,
): number {
  let best = ms;
  let bestPx = thresholdPx + 1;
  for (const t of targets) {
    const px = Math.abs(t - ms) * v.pxPerMs;
    if (px <= thresholdPx && px < bestPx) {
      best = t;
      bestPx = px;
    }
  }
  return best;
}
