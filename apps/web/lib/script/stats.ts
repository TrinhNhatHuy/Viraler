/** Baseline speaking rate for Kokoro at speed 1.0 (words per minute). */
export const DEFAULT_WPM = 160;

/**
 * Words = runs of letters/digits (any script), joined by inner ' ’ - . ("don't",
 * "e-mail", "3.5") or a digit-grouping comma ("1,000").
 */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’\-.][\p{L}\p{N}]+|(?<=\p{N}),\p{N}+)*/gu)?.length ?? 0;
}

export function estimateDurationMs(words: number, wpm = DEFAULT_WPM, speed = 1): number {
  if (words <= 0) return 0;
  return Math.round((words / (wpm * speed)) * 60_000);
}

/** 83_000 → "1:23"; 3_723_000 → "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
