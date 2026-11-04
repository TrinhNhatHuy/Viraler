import { CANVAS_WIDTH, type CaptionStyle, type CaptionWord } from '@viraler/shared';

/**
 * Caption paging and timing: which words are on screen at a given time, and
 * where. Pure (text measuring is injected) so it can be unit-tested and reused
 * by the export renderer.
 */

/** Captions stay inside this share of the canvas width (platform UI covers the edges). */
export const CAPTION_SAFE_WIDTH = Math.round(CANVAS_WIDTH * 0.84);
/** A gap at least this long between words starts a new page. */
export const PAUSE_BREAK_MS = 600;
/** How long a page stays up after its last word when the next page isn't right behind it. */
export const LINGER_MS = 400;

const SENTENCE_END = /[.!?…]["'”’)\]]*$/u;

export interface PageWord {
  /** Index into `captions.words`. */
  index: number;
  /** Display text (uppercase applied). */
  text: string;
  startMs: number;
  endMs: number;
  /** Line of the page (0 or 1). */
  line: number;
  /** Left edge relative to the start of its line, in canvas px. */
  x: number;
  width: number;
}

export interface CaptionPage {
  startMs: number;
  /** Exclusive. */
  endMs: number;
  words: PageWord[];
  /** Width of each line in canvas px (a single long word may exceed the safe width). */
  lineWidths: number[];
  /** Widest line. */
  width: number;
}

export type MeasureText = (text: string) => number;

export function displayText(text: string, style: Pick<CaptionStyle, 'uppercase'>): string {
  const trimmed = text.trim();
  return style.uppercase ? trimmed.toUpperCase() : trimmed;
}

/**
 * Splits words into pages of up to `maxLines` lines. A line holds at most
 * `maxWordsPerLine` words within `maxWidth`; when it's full the next line
 * starts, and when the last line is full a new page does. A sentence end or a
 * pause always starts a new page.
 */
export function buildCaptionPages(
  words: readonly CaptionWord[],
  style: Pick<CaptionStyle, 'uppercase' | 'maxWordsPerLine'> & { maxLines?: number },
  measure: MeasureText,
  maxWidth: number = CAPTION_SAFE_WIDTH,
): CaptionPage[] {
  const maxLines = Math.max(1, style.maxLines ?? 1);
  const space = measure(' ');
  const groups: PageWord[][] = [];
  let current: PageWord[] = [];
  let line = 0;
  let lineWords = 0;
  let lineWidth = 0;

  words.forEach((word, index) => {
    const text = displayText(word.text, style);
    if (!text) return;
    const width = measure(text);
    const prev = current.at(-1);
    if (prev) {
      const prevSource = words[prev.index]!;
      const pageBreak =
        SENTENCE_END.test(prevSource.text.trim()) ||
        word.startMs - prevSource.endMs >= PAUSE_BREAK_MS;
      const lineFull = lineWords >= style.maxWordsPerLine || lineWidth + space + width > maxWidth;
      if (pageBreak || (lineFull && line + 1 >= maxLines)) {
        groups.push(current);
        current = [];
        line = 0;
        lineWords = 0;
        lineWidth = 0;
      } else if (lineFull) {
        line += 1;
        lineWords = 0;
        lineWidth = 0;
      }
    }
    const x = lineWords === 0 ? 0 : lineWidth + space;
    current.push({ index, text, startMs: word.startMs, endMs: word.endMs, line, x, width });
    lineWidth = x + width;
    lineWords += 1;
  });
  if (current.length > 0) groups.push(current);

  return groups.map((group, i) => {
    const first = group[0]!;
    const last = group.at(-1)!;
    const next = groups[i + 1]?.[0];
    const linger = last.endMs + LINGER_MS;
    const lineWidths: number[] = [];
    for (const w of group) lineWidths[w.line] = Math.max(lineWidths[w.line] ?? 0, w.x + w.width);
    return {
      startMs: first.startMs,
      endMs: next ? Math.max(first.startMs, Math.min(next.startMs, linger)) : linger,
      words: group,
      lineWidths,
      width: Math.max(...lineWidths),
    };
  });
}

export interface CaptionFrame {
  page: CaptionPage;
  /** Index into `page.words` of the word being spoken (stays lit through short gaps). */
  activeIndex: number;
}

/** The page on screen at `tMs`, or null between pages. */
export function captionFrameAt(pages: readonly CaptionPage[], tMs: number): CaptionFrame | null {
  // Last page that has started.
  let lo = 0;
  let hi = pages.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid]!.startMs <= tMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const page = pages[found];
  if (!page || tMs >= page.endMs) return null;

  let activeIndex = 0;
  for (let i = 1; i < page.words.length; i++) {
    if (page.words[i]!.startMs <= tMs) activeIndex = i;
  }
  return { page, activeIndex };
}

/** Left edge of a line of `width` px for the given alignment, centered in the safe area. */
export function lineLeft(
  width: number,
  align: CaptionStyle['align'],
  canvasWidth: number = CANVAS_WIDTH,
  safeWidth: number = CAPTION_SAFE_WIDTH,
): number {
  const safeLeft = (canvasWidth - safeWidth) / 2;
  if (align === 'left') return safeLeft;
  if (align === 'right') return safeLeft + safeWidth - width;
  return (canvasWidth - width) / 2;
}
