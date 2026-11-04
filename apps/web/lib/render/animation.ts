/**
 * Text animations as pure functions of elapsed time, so the preview and the
 * export draw exactly the same frames.
 */

export const WORD_POP_MS = 200;
export const ENTRANCE_MS = 250;
const WORD_POP_SCALE = 0.15;
const ENTRANCE_FROM = 0.85;

/** The spoken word's scale: 1 → 1.15 → 1 over WORD_POP_MS after it starts. */
export function wordPopScale(elapsedMs: number): number {
  if (elapsedMs <= 0 || elapsedMs >= WORD_POP_MS) return 1;
  return 1 + WORD_POP_SCALE * Math.sin((Math.PI * elapsedMs) / WORD_POP_MS);
}

/** A pop-in: scale 0.85 → 1 with a slight overshoot (ease-out-back) and a quick fade-in. */
export function entrance(elapsedMs: number): { scale: number; alpha: number } {
  if (elapsedMs >= ENTRANCE_MS) return { scale: 1, alpha: 1 };
  if (elapsedMs <= 0) return { scale: ENTRANCE_FROM, alpha: 0 };
  const p = elapsedMs / ENTRANCE_MS;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const eased = 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
  return { scale: ENTRANCE_FROM + (1 - ENTRANCE_FROM) * eased, alpha: Math.min(1, p / 0.6) };
}
