import type { Clip, Project } from '@viraler/shared';
import { captionsStale } from '@/lib/captions/edit';
import { formatTimecode } from '@/lib/format';
import { clipsEndMs, projectDurationMs } from '@/lib/timeline/model';

/** Pure planning for the MP4 export: frames, per-clip source times, audio mix, checks. */

export const EXPORT_FPS_OPTIONS = [30, 60] as const;
export type ExportFps = (typeof EXPORT_FPS_OPTIONS)[number];

export function frameCount(durationMs: number, fps: number): number {
  return Math.max(0, Math.ceil((durationMs * fps) / 1000 - 1e-9));
}

/** Output time (ms) of frame `i`. The frame loop and per-clip times both use this. */
export function frameTimeMs(i: number, fps: number): number {
  return (i * 1000) / fps;
}

/**
 * Source-media times (seconds) for every output frame that falls inside `clip`,
 * in order: what the clip's decoder is asked for, one per frame.
 */
export function clipSourceTimes(clip: Clip, fps: number): number[] {
  const end = clip.startMs + clip.durationMs;
  const times: number[] = [];
  for (let i = Math.max(0, Math.floor((clip.startMs * fps) / 1000) - 1); ; i++) {
    const t = frameTimeMs(i, fps);
    if (t >= end) break;
    if (t >= clip.startMs) times.push((clip.trimInMs + (t - clip.startMs)) / 1000);
  }
  return times;
}

export interface AudioSegment {
  kind: 'voiceover' | 'clip';
  /** Storage path or URL of the source file. */
  src: string;
  /** For clip audio: the media item whose decoded file is reused. */
  mediaId?: string;
  /** Where it starts in the output (s). */
  startSec: number;
  /** Where to start reading in the source (s). */
  offsetSec: number;
  durationSec: number;
  gain: number;
}

/** What goes into the audio mix: the voiceover and every unmuted video clip. */
export function audioPlan(project: Pick<Project, 'voiceover' | 'clips' | 'media'>): AudioSegment[] {
  const segments: AudioSegment[] = [];
  const vo = project.voiceover;
  if (vo && vo.volume > 0 && vo.durationMs > 0) {
    segments.push({
      kind: 'voiceover',
      src: vo.src,
      startSec: 0,
      offsetSec: 0,
      durationSec: vo.durationMs / 1000,
      gain: vo.volume,
    });
  }
  const media = new Map(project.media.map((m) => [m.id, m]));
  for (const clip of project.clips) {
    const m = media.get(clip.mediaId);
    if (clip.muted || m?.kind !== 'video') continue;
    segments.push({
      kind: 'clip',
      src: m.src,
      mediaId: m.id,
      startSec: clip.startMs / 1000,
      offsetSec: clip.trimInMs / 1000,
      durationSec: clip.durationMs / 1000,
      gain: 1,
    });
  }
  return segments;
}

export interface ExportChecks {
  errors: string[];
  warnings: string[];
}

export function exportChecks(project: Project): ExportChecks {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (projectDurationMs(project) <= 0) {
    errors.push('Nothing to export yet: add a voiceover or some clips.');
    return { errors, warnings };
  }
  const known = new Set(project.media.map((m) => m.id));
  const missing = project.clips.filter((c) => !known.has(c.mediaId)).length;
  if (missing > 0)
    errors.push(`${missing} clip(s) refer to missing media. Delete or replace them.`);

  const voMs = project.voiceover?.durationMs ?? 0;
  const clipsMs = clipsEndMs(project.clips);
  if (project.clips.length === 0) {
    warnings.push('There are no clips: the video shows only the background, captions and titles.');
  } else if (clipsMs < voMs) {
    const gap = ((voMs - clipsMs) / 1000).toFixed(1);
    warnings.push(
      `The clips end at ${formatTimecode(clipsMs)} but the voiceover runs to ${formatTimecode(voMs)}: ` +
        `the last ${gap} s show only the background. Try "Fit to voiceover".`,
    );
  }
  if (project.captions.enabled && captionsStale(project)) {
    warnings.push('The captions were made for a different voiceover. Regenerate them first?');
  }
  return { errors, warnings };
}

/** A safe `.mp4` file name from the project title. */
export function exportFileName(title: string): string {
  const base = title
    // Path separators, characters Windows forbids, and control characters.
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim();
  return `${base || 'video'}.mp4`;
}
