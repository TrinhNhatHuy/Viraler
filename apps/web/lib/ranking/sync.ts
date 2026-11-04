import { type CaptionWord, type Clip, MIN_CLIP_MS, type Project } from '@viraler/shared';
import { captionsStale } from '@/lib/captions/edit';
import { fitDurations } from '@/lib/timeline/fit';
import { maxClipMs, mediaById, normalizeClips } from '@/lib/timeline/model';

/**
 * "Sync ranks to voiceover": finds where each rank is announced in the
 * captions ("Number three:", "#3", "No. 3") and moves each ranked clip's start
 * there. Clips between two announced ranks share that span.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

export interface RankMarker {
  rank: number;
  /** Index of the word that starts the marker ("Number" or "#3"). */
  wordIndex: number;
  /** Where the cut goes: the middle of the gap just before that word. */
  cutMs: number;
}

const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}#]/gu, '');

function parseRank(text: string): number | null {
  const k = key(text);
  if (/^\d{1,2}$/.test(k)) return Number(k) || null;
  return NUMBER_WORDS[k] ?? null;
}

/** "number" always counts; "no" only written as "No." ("no one" isn't a rank). */
function isMarkerWord(text: string): boolean {
  const k = key(text);
  return k === 'number' || k === 'num' || (k === 'no' && /\.\W*$/.test(text.trim()));
}

function cutBefore(words: readonly CaptionWord[], i: number): number {
  const prev = words[i - 1];
  const word = words[i]!;
  return prev ? Math.round((prev.endMs + word.startMs) / 2) : word.startMs;
}

export function findRankMarkers(words: readonly CaptionWord[]): RankMarker[] {
  const markers: RankMarker[] = [];
  for (let i = 0; i < words.length; i++) {
    const text = words[i]!.text;
    const hash = /^#(\d{1,2})$/.exec(key(text));
    let rank: number | null = null;
    if (hash) rank = Number(hash[1]) || null;
    else if (isMarkerWord(text) && words[i + 1]) rank = parseRank(words[i + 1]!.text);
    if (rank !== null) markers.push({ rank, wordIndex: i, cutMs: cutBefore(words, i) });
  }
  return markers;
}

export interface Shortfall {
  /** Rank whose span couldn't be filled (null: the clips before the first rank). */
  rank: number | null;
  needMs: number;
  haveMs: number;
}

export type SyncResult =
  | { kind: 'ok'; clips: Clip[]; found: number[]; missing: number[]; shortfalls: Shortfall[] }
  | { kind: 'error'; message: string };

export function syncRanksToVoiceover(project: Project): SyncResult {
  const { voiceover, clips } = project;
  if (!voiceover) return { kind: 'error', message: 'Add a voiceover first.' };
  if (project.captions.words.length === 0 || captionsStale(project)) {
    return { kind: 'error', message: 'Generate captions for this voiceover first.' };
  }
  const ranked = clips.flatMap((c, i) => (c.rank !== undefined ? [{ i, rank: c.rank }] : []));
  if (ranked.length === 0) {
    return { kind: 'error', message: 'Give the clips ranks first (Number clips).' };
  }
  const markers = findRankMarkers(project.captions.words);
  if (markers.length === 0) {
    return {
      kind: 'error',
      message: 'No rank markers found in the captions. Say "Number three" (or "#3") in the script.',
    };
  }

  // Each ranked clip, in timeline order, takes the first marker for its rank
  // after the previous one (so an early "number one will surprise you" is skipped).
  const anchors = new Map<number, number>(); // clip index → cut time
  const found: number[] = [];
  const missing: number[] = [];
  const seen = new Set<number>();
  let after = Number.NEGATIVE_INFINITY;
  for (const { i, rank } of ranked) {
    if (seen.has(rank)) continue; // later clips of the same rank share its span
    seen.add(rank);
    const marker = markers.find((m) => m.rank === rank && m.cutMs > after);
    if (!marker) {
      missing.push(rank);
      continue;
    }
    found.push(rank);
    after = marker.cutMs;
    if (i > 0) anchors.set(i, marker.cutMs); // the first clip always starts at 0
  }
  if (found.length === 0) {
    return {
      kind: 'error',
      message: `None of the ranks (${missing.join(', ')}) are announced in the captions.`,
    };
  }

  // Segments: [0, first anchor), [anchor, next anchor), …, [last anchor, voiceover end).
  const media = mediaById(project.media);
  const starts = [0, ...[...anchors.keys()].sort((a, b) => a - b)];
  const durations = clips.map((c) => c.durationMs);
  const shortfalls: Shortfall[] = [];
  let t = 0; // where the next segment actually starts (earlier than its anchor after a shortfall)
  starts.forEach((from, s) => {
    const to = starts[s + 1] ?? clips.length;
    const segment = clips.slice(from, to);
    const end = s + 1 < starts.length ? anchors.get(starts[s + 1]!)! : voiceover.durationMs;
    const target = Math.max(end - t, segment.length * MIN_CLIP_MS);
    const caps = segment.map((c) => maxClipMs(c, media.get(c.mediaId)));
    const real = fitDurations(
      segment.map((c) => c.durationMs),
      caps,
      target,
    );
    // Integer cuts from cumulative times, so the segment ends exactly on target.
    let acc = t;
    let prevCut = t;
    real.forEach((d, k) => {
      acc += d;
      const cut = Math.round(acc);
      durations[from + k] = cut - prevCut;
      prevCut = cut;
    });
    const have = prevCut - t;
    if (have < end - t - 1) {
      shortfalls.push({ rank: clips[from]?.rank ?? null, needMs: end - t, haveMs: have });
    }
    t = prevCut;
  });

  const synced = normalizeClips(clips.map((c, i) => ({ ...c, durationMs: durations[i]! })));
  return { kind: 'ok', clips: synced, found, missing, shortfalls };
}
