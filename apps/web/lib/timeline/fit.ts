import { type CaptionWord, type Clip, MIN_CLIP_MS } from '@viraler/shared';
import { type MediaById, maxClipMs, normalizeClips } from './model';

/** Cuts move to a gap between words if one is this close. */
export const SNAP_TO_WORD_MS = 400;

export interface FitResult {
  clips: Clip[];
  /** How much footage is missing to reach the target (videos can't run past their media). */
  shortByMs: number;
}

/**
 * Stretches/shrinks clips so they end exactly at `targetMs` (the voiceover's
 * length), keeping their relative lengths. Videos can't run past their media,
 * so time they can't take is shared by the other clips ("water-filling").
 * With caption `words`, cuts snap to the nearest gap between words.
 */
export function fitToVoiceover(
  clips: readonly Clip[],
  media: MediaById,
  targetMs: number,
  words: readonly CaptionWord[] = [],
): FitResult {
  if (clips.length === 0 || targetMs <= 0) {
    return { clips: clips as Clip[], shortByMs: Math.max(0, targetMs) };
  }
  const caps = clips.map((c) => maxClipMs(c, media.get(c.mediaId)));
  const real = waterFill(
    clips.map((c) => c.durationMs),
    caps,
    targetMs,
  );

  // Integer cut points from the cumulative real lengths: the total stays exact.
  const cuts = [0];
  let acc = 0;
  for (const d of real) {
    acc += d;
    cuts.push(Math.round(acc));
  }
  snapCuts(cuts, caps, words);

  const out = clips.map((c, i) => ({ ...c, durationMs: cuts[i + 1]! - cuts[i]! }));
  const total = cuts.at(-1)!;
  return { clips: normalizeClips(out), shortByMs: Math.max(0, targetMs - total) };
}

/** Proportional lengths summing to `target`, each within [MIN_CLIP_MS, cap]. */
function waterFill(weights: number[], caps: number[], target: number): number[] {
  const out = new Array<number>(weights.length).fill(0);
  const free = new Set(weights.map((_, i) => i));
  let remaining = target;
  // Each round fixes at least one clip at a bound, so this ends within n rounds.
  for (let round = 0; round <= weights.length && free.size > 0; round++) {
    const sum = [...free].reduce((s, i) => s + Math.max(weights[i]!, 1), 0);
    const scale = remaining / sum;
    const fixed = [...free].filter((i) => {
      const d = Math.max(weights[i]!, 1) * scale;
      return d > caps[i]! || d < MIN_CLIP_MS;
    });
    if (fixed.length === 0) {
      for (const i of free) out[i] = Math.max(weights[i]!, 1) * scale;
      return out;
    }
    for (const i of fixed) {
      const d = Math.max(weights[i]!, 1) * scale;
      out[i] = d > caps[i]! ? caps[i]! : MIN_CLIP_MS;
      remaining -= out[i]!;
      free.delete(i);
    }
  }
  return out; // every clip at a bound (e.g. not enough footage)
}

/** Moves inner cuts to the middle of the nearest gap between words, within limits. */
function snapCuts(cuts: number[], caps: number[], words: readonly CaptionWord[]) {
  if (words.length < 2) return;
  const gaps: number[] = [];
  for (let i = 0; i + 1 < words.length; i++) {
    gaps.push(Math.round((words[i]!.endMs + words[i + 1]!.startMs) / 2));
  }
  for (let k = 1; k < cuts.length - 1; k++) {
    const cut = cuts[k]!;
    const near = gaps
      .filter((g) => Math.abs(g - cut) <= SNAP_TO_WORD_MS)
      .sort((a, b) => Math.abs(a - cut) - Math.abs(b - cut));
    for (const g of near) {
      const before = g - cuts[k - 1]!;
      const after = cuts[k + 1]! - g;
      if (
        before >= MIN_CLIP_MS &&
        after >= MIN_CLIP_MS &&
        before <= caps[k - 1]! &&
        after <= caps[k]!
      ) {
        cuts[k] = g;
        break;
      }
    }
  }
}
