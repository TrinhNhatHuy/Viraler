import type { Clip } from '@viraler/shared';
import { clipAt } from '@/lib/timeline/model';
import type { MediaPool } from './media-pool';

/** While playing, re-seek a video only when it drifts this far (seeking stutters). */
const PLAYING_DRIFT_S = 0.2;
/** While paused/scrubbing, show the exact frame. */
const PAUSED_DRIFT_S = 1 / 60;
const PRESEEK_DRIFT_S = 0.05;

/**
 * Keeps the preview's video elements on the timeline: the active clip's video
 * plays (or is seeked to the exact frame when paused); the next clip's video is
 * parked at its in-point so the cut is clean; everything else is paused.
 */
export function syncVideos(
  pool: MediaPool,
  clips: readonly Clip[],
  tMs: number,
  playing: boolean,
): void {
  const hit = clipAt(clips, tMs);
  const active = hit?.clip;
  const next = hit ? clips[hit.index + 1] : undefined;
  const activeEl = active ? pool.video(active.mediaId) : null;

  for (const v of pool.videos()) {
    if (v === activeEl && active) {
      const target = (active.trimInMs + (tMs - active.startMs)) / 1000;
      v.muted = active.muted;
      if (playing) {
        if (!v.seeking && Math.abs(v.currentTime - target) > PLAYING_DRIFT_S)
          v.currentTime = target;
        if (v.paused) v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (!v.seeking && Math.abs(v.currentTime - target) > PAUSED_DRIFT_S) v.currentTime = target;
      }
      continue;
    }
    if (!v.paused) v.pause();
    if (next && v === pool.video(next.mediaId)) {
      const inPoint = next.trimInMs / 1000;
      if (!v.seeking && Math.abs(v.currentTime - inPoint) > PRESEEK_DRIFT_S)
        v.currentTime = inPoint;
    }
  }
}
