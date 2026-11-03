import {
  type Clip,
  DEFAULT_IMAGE_CLIP_MS,
  DEFAULT_VIDEO_CLIP_MS,
  MIN_CLIP_MS,
  type MediaItem,
  type Project,
} from '@viraler/shared';

/**
 * Timeline model: one "magnetic" track. Clips are kept in play order, back to
 * back from 0 (no gaps, no overlaps); `startMs` is always derived from the
 * order and durations by `normalizeClips`. All functions are pure and return
 * the same array when nothing changes.
 */

export type MediaById = ReadonlyMap<string, MediaItem>;

export const mediaById = (media: readonly MediaItem[]): MediaById =>
  new Map(media.map((m) => [m.id, m]));

/** Recomputes `startMs` so clips play back to back from 0. */
export function normalizeClips(clips: readonly Clip[]): Clip[] {
  let t = 0;
  let changed = false;
  const out = clips.map((c) => {
    const startMs = t;
    t += c.durationMs;
    if (c.startMs === startMs) return c;
    changed = true;
    return { ...c, startMs };
  });
  return changed ? out : (clips as Clip[]);
}

export function clipsEndMs(clips: readonly Clip[]): number {
  const last = clips.at(-1);
  return last ? last.startMs + last.durationMs : 0;
}

/** Project length: the voiceover or the clips, whichever ends later. */
export function projectDurationMs(project: Pick<Project, 'voiceover' | 'clips'>): number {
  return Math.max(project.voiceover?.durationMs ?? 0, clipsEndMs(project.clips));
}

/** Longest a clip may run from its current trim: a video stops at the end of its media. */
export function maxClipMs(clip: Pick<Clip, 'trimInMs'>, media: MediaItem | undefined): number {
  if (media?.kind === 'video' && media.durationMs !== undefined) {
    return Math.max(MIN_CLIP_MS, media.durationMs - clip.trimInMs);
  }
  return Number.POSITIVE_INFINITY;
}

export function newClip(media: MediaItem, id: string = crypto.randomUUID()): Clip {
  const durationMs =
    media.kind === 'video'
      ? Math.min(media.durationMs ?? DEFAULT_VIDEO_CLIP_MS, DEFAULT_VIDEO_CLIP_MS)
      : DEFAULT_IMAGE_CLIP_MS;
  return {
    id,
    mediaId: media.id,
    startMs: 0,
    durationMs: Math.max(MIN_CLIP_MS, durationMs),
    trimInMs: 0,
    // Voiceover-led shorts usually don't want the stock footage's own audio.
    muted: true,
  };
}

export function insertClip(clips: readonly Clip[], index: number, clip: Clip): Clip[] {
  const i = Math.max(0, Math.min(index, clips.length));
  return normalizeClips([...clips.slice(0, i), clip, ...clips.slice(i)]);
}

/** Moves the clip at `from` so it ends up at index `to` of the result. */
export function moveClip(clips: readonly Clip[], from: number, to: number): Clip[] {
  const clip = clips[from];
  if (!clip) return clips as Clip[];
  const target = Math.max(0, Math.min(to, clips.length - 1));
  if (target === from) return clips as Clip[];
  const rest = clips.filter((_, i) => i !== from);
  return normalizeClips([...rest.slice(0, target), clip, ...rest.slice(target)]);
}

export function deleteClip(clips: readonly Clip[], id: string): Clip[] {
  if (!clips.some((c) => c.id === id)) return clips as Clip[];
  return normalizeClips(clips.filter((c) => c.id !== id));
}

/**
 * Splits the clip under `atMs` in two. Returns null when there's nothing to
 * split: no clip there, or a part would be shorter than MIN_CLIP_MS.
 */
export function splitClip(
  clips: readonly Clip[],
  atMs: number,
  newId: string = crypto.randomUUID(),
): Clip[] | null {
  const hit = clipAt(clips, atMs);
  if (!hit) return null;
  const { clip, index } = hit;
  const offset = Math.round(atMs - clip.startMs);
  if (offset < MIN_CLIP_MS || clip.durationMs - offset < MIN_CLIP_MS) return null;
  const first: Clip = { ...clip, durationMs: offset };
  // The second part continues the same media where the first one stops.
  const second: Clip = {
    id: newId,
    mediaId: clip.mediaId,
    startMs: clip.startMs + offset,
    durationMs: clip.durationMs - offset,
    trimInMs: clip.trimInMs + offset,
    muted: clip.muted,
  };
  return normalizeClips([...clips.slice(0, index), first, second, ...clips.slice(index + 1)]);
}

/**
 * Drags a clip edge by `deltaMs` (relative to `clips`, i.e. the state when the
 * drag began). End edge: changes the length. Start edge: for a video, trims the
 * start of the media (its end stays put); for an image, changes the length.
 */
export function resizeClip(
  clips: readonly Clip[],
  id: string,
  edge: 'start' | 'end',
  deltaMs: number,
  media: MediaItem | undefined,
): Clip[] {
  const index = clips.findIndex((c) => c.id === id);
  const clip = clips[index];
  if (!clip) return clips as Clip[];
  const delta = Math.round(deltaMs);
  let next: Clip;
  if (edge === 'end') {
    const durationMs = clamp(clip.durationMs + delta, MIN_CLIP_MS, maxClipMs(clip, media));
    next = { ...clip, durationMs };
  } else if (media?.kind === 'video') {
    const mediaEnd = clip.trimInMs + clip.durationMs;
    const trimInMs = clamp(clip.trimInMs + delta, 0, mediaEnd - MIN_CLIP_MS);
    next = { ...clip, trimInMs, durationMs: mediaEnd - trimInMs };
  } else {
    next = { ...clip, durationMs: Math.max(MIN_CLIP_MS, clip.durationMs - delta) };
  }
  if (next.durationMs === clip.durationMs && next.trimInMs === clip.trimInMs) {
    return clips as Clip[];
  }
  return normalizeClips(clips.with(index, next));
}

export function setClipMuted(clips: readonly Clip[], id: string, muted: boolean): Clip[] {
  const index = clips.findIndex((c) => c.id === id);
  const clip = clips[index];
  if (!clip || clip.muted === muted) return clips as Clip[];
  return clips.with(index, { ...clip, muted });
}

/** The clip playing at `tMs` (start inclusive, end exclusive). */
export function clipAt(clips: readonly Clip[], tMs: number): { clip: Clip; index: number } | null {
  let lo = 0;
  let hi = clips.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = clips[mid]!;
    if (tMs < c.startMs) hi = mid - 1;
    else if (tMs >= c.startMs + c.durationMs) lo = mid + 1;
    else return { clip: c, index: mid };
  }
  return null;
}

/** Where a clip dropped at `tMs` goes: before the first clip whose middle is after it. */
export function insertionIndexAt(clips: readonly Clip[], tMs: number): number {
  const i = clips.findIndex((c) => c.startMs + c.durationMs / 2 > tMs);
  return i === -1 ? clips.length : i;
}

/** Adds `media` to the project (once) and a clip for it at `index` (default: the end). */
export function addMediaClip(
  project: Project,
  media: MediaItem,
  index: number = project.clips.length,
  clipId?: string,
): Project {
  const known = project.media.some((m) => m.id === media.id);
  return {
    ...project,
    media: known ? project.media : [...project.media, media],
    clips: insertClip(project.clips, index, newClip(media, clipId)),
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
