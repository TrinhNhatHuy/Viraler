import type { CaptionWord } from '@viraler/shared';
import { clamp } from './model';

export const MIN_WORD_MS = 40;

/**
 * Moves one edge of a caption word to `ms`, kept between its neighbors and at
 * least MIN_WORD_MS long. Returns the same array if nothing changes.
 */
export function setWordEdge(
  words: readonly CaptionWord[],
  index: number,
  edge: 'start' | 'end',
  ms: number,
  maxMs: number = Number.POSITIVE_INFINITY,
): CaptionWord[] {
  const word = words[index];
  if (!word) return words as CaptionWord[];
  const t = Math.round(ms);
  let next: CaptionWord;
  if (edge === 'start') {
    const lo = words[index - 1]?.endMs ?? 0;
    const hi = word.endMs - MIN_WORD_MS;
    if (lo > hi) return words as CaptionWord[];
    next = { ...word, startMs: clamp(t, lo, hi) };
  } else {
    const lo = word.startMs + MIN_WORD_MS;
    const hi = words[index + 1]?.startMs ?? maxMs;
    if (lo > hi) return words as CaptionWord[];
    next = { ...word, endMs: clamp(t, lo, hi) };
  }
  if (next.startMs === word.startMs && next.endMs === word.endMs) return words as CaptionWord[];
  return words.with(index, next);
}
