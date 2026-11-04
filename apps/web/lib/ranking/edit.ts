import type { Clip, Ranking } from '@viraler/shared';

/** Ranking mode edits on clips. Pure; return the same array when nothing changes. */

export const MAX_RANK = 99;
export const RANK_LABEL_MAX = 60;

/** Ranks clips in timeline order: countdown (N…1) for 'descending', 1…N for 'ascending'. */
export function numberClips(clips: readonly Clip[], order: Ranking['order']): Clip[] {
  const n = clips.length;
  return clips.map((c, i) => {
    const rank = Math.min(MAX_RANK, order === 'descending' ? n - i : i + 1);
    return c.rank === rank ? c : { ...c, rank };
  });
}

export function setClipRank(clips: readonly Clip[], id: string, rank: number | undefined): Clip[] {
  const index = clips.findIndex((c) => c.id === id);
  const clip = clips[index];
  if (!clip) return clips as Clip[];
  const value =
    rank === undefined || !Number.isFinite(rank) || rank < 1
      ? undefined
      : Math.min(MAX_RANK, Math.round(rank));
  if (clip.rank === value) return clips as Clip[];
  const next = { ...clip };
  if (value === undefined) delete next.rank;
  else next.rank = value;
  return clips.with(index, next);
}

/** Stores the label as typed (so spaces survive typing); blank removes it. Trimmed when drawn. */
export function setClipLabel(clips: readonly Clip[], id: string, label: string): Clip[] {
  const index = clips.findIndex((c) => c.id === id);
  const clip = clips[index];
  if (!clip) return clips as Clip[];
  const value = label.slice(0, RANK_LABEL_MAX);
  const next = { ...clip };
  if (value.trim() === '') delete next.label;
  else next.label = value;
  if (next.label === clip.label) return clips as Clip[];
  return clips.with(index, next);
}
