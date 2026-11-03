import type { Clip, MediaItem, Project } from '@viraler/shared';
import { createEmptyProject } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import {
  addMediaClip,
  clipAt,
  clipsEndMs,
  deleteClip,
  insertClip,
  insertionIndexAt,
  maxClipMs,
  moveClip,
  newClip,
  normalizeClips,
  projectDurationMs,
  resizeClip,
  setClipMuted,
  splitClip,
} from './model';

const video: MediaItem = {
  id: 'v',
  kind: 'video',
  src: 'u/media/v.mp4',
  origin: 'upload',
  durationMs: 8000,
};
const image: MediaItem = { id: 'i', kind: 'image', src: 'u/media/i.jpg', origin: 'upload' };

function clip(id: string, durationMs: number, extra: Partial<Clip> = {}): Clip {
  return { id, mediaId: 'v', startMs: 0, durationMs, trimInMs: 0, muted: true, ...extra };
}

/** Clips a (1000), b (2000), c (3000), back to back. */
const abc = () => normalizeClips([clip('a', 1000), clip('b', 2000), clip('c', 3000)]);
const layout = (clips: Clip[]) => clips.map((c) => `${c.id}@${c.startMs}+${c.durationMs}`);

describe('normalizeClips', () => {
  it('lays clips back to back from 0', () => {
    expect(layout(abc())).toEqual(['a@0+1000', 'b@1000+2000', 'c@3000+3000']);
    expect(clipsEndMs(abc())).toBe(6000);
  });

  it('returns the same array when already normalized', () => {
    const clips = abc();
    expect(normalizeClips(clips)).toBe(clips);
  });
});

describe('newClip / addMediaClip', () => {
  it('uses 5 s (or less) for videos, 3 s for images, muted', () => {
    expect(newClip(video, 'x')).toMatchObject({ durationMs: 5000, trimInMs: 0, muted: true });
    expect(newClip({ ...video, durationMs: 2500 }, 'x').durationMs).toBe(2500);
    expect(newClip(image, 'x').durationMs).toBe(3000);
  });

  it('adds the media once and inserts the clip', () => {
    let p: Project = createEmptyProject();
    p = addMediaClip(p, video, undefined, 'c1');
    p = addMediaClip(p, video, 0, 'c2');
    expect(p.media).toEqual([video]);
    expect(layout(p.clips)).toEqual(['c2@0+5000', 'c1@5000+5000']);
  });
});

describe('insert / move / delete', () => {
  it('inserts and keeps clips back to back', () => {
    expect(layout(insertClip(abc(), 1, clip('x', 500)))).toEqual([
      'a@0+1000',
      'x@1000+500',
      'b@1500+2000',
      'c@3500+3000',
    ]);
  });

  it('moves a clip to a new index', () => {
    expect(layout(moveClip(abc(), 0, 2))).toEqual(['b@0+2000', 'c@2000+3000', 'a@5000+1000']);
    expect(layout(moveClip(abc(), 2, 0))).toEqual(['c@0+3000', 'a@3000+1000', 'b@4000+2000']);
    const clips = abc();
    expect(moveClip(clips, 1, 1)).toBe(clips);
  });

  it('deletes and closes the gap', () => {
    expect(layout(deleteClip(abc(), 'b'))).toEqual(['a@0+1000', 'c@1000+3000']);
  });
});

describe('splitClip', () => {
  it('splits at the playhead and continues the media', () => {
    const clips = normalizeClips([
      clip('a', 1000),
      clip('b', 2000, { trimInMs: 300, muted: false }),
    ]);
    const out = splitClip(clips, 1600, 'b2')!;
    expect(layout(out)).toEqual(['a@0+1000', 'b@1000+600', 'b2@1600+1400']);
    expect(out[2]).toMatchObject({ trimInMs: 900, muted: false, mediaId: 'v' });
    expect(clipsEndMs(out)).toBe(clipsEndMs(clips));
  });

  it('does nothing outside clips or too close to an edge', () => {
    expect(splitClip(abc(), 6000)).toBeNull();
    expect(splitClip(abc(), 1100)).toBeNull(); // 100 ms into b
    expect(splitClip(abc(), 2900)).toBeNull(); // 100 ms before b ends
    expect(splitClip([], 10)).toBeNull();
  });

  it("doesn't copy ranking labels onto the second part", () => {
    const out = splitClip([clip('a', 2000, { rank: 1, label: 'One' })], 1000, 'a2')!;
    expect(out[0]).toMatchObject({ rank: 1, label: 'One' });
    expect(out[1]).not.toHaveProperty('rank');
  });
});

describe('resizeClip', () => {
  it('drags the end edge, clamped to min length and the media end', () => {
    expect(resizeClip(abc(), 'a', 'end', 500, video)[0]!.durationMs).toBe(1500);
    expect(resizeClip(abc(), 'a', 'end', -5000, video)[0]!.durationMs).toBe(200);
    expect(resizeClip(abc(), 'a', 'end', 99_000, video)[0]!.durationMs).toBe(8000);
    expect(resizeClip(abc(), 'a', 'end', 99_000, image)[0]!.durationMs).toBe(100_000);
  });

  it('trims the start of a video, keeping where it ends in the media', () => {
    const clips = normalizeClips([clip('a', 3000, { trimInMs: 1000 })]);
    expect(resizeClip(clips, 'a', 'start', 500, video)[0]).toMatchObject({
      trimInMs: 1500,
      durationMs: 2500,
    });
    expect(resizeClip(clips, 'a', 'start', -5000, video)[0]).toMatchObject({
      trimInMs: 0,
      durationMs: 4000,
    });
    expect(resizeClip(clips, 'a', 'start', 5000, video)[0]).toMatchObject({
      trimInMs: 3800,
      durationMs: 200,
    });
  });

  it('changes an image length from the start edge', () => {
    expect(resizeClip(abc(), 'b', 'start', 500, image)[1]!.durationMs).toBe(1500);
  });

  it('shifts later clips', () => {
    expect(layout(resizeClip(abc(), 'a', 'end', 500, video))).toEqual([
      'a@0+1500',
      'b@1500+2000',
      'c@3500+3000',
    ]);
  });

  it('caps a video at the media left after its trim', () => {
    expect(maxClipMs({ trimInMs: 6000 }, video)).toBe(2000);
    expect(maxClipMs({ trimInMs: 0 }, image)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('lookup', () => {
  it('finds the clip at a time (end exclusive)', () => {
    const clips = abc();
    expect(clipAt(clips, 0)?.clip.id).toBe('a');
    expect(clipAt(clips, 999)?.clip.id).toBe('a');
    expect(clipAt(clips, 1000)?.clip.id).toBe('b');
    expect(clipAt(clips, 5999)?.clip.id).toBe('c');
    expect(clipAt(clips, 6000)).toBeNull();
    expect(clipAt(clips, -1)).toBeNull();
  });

  it('picks the insertion index by clip middles', () => {
    const clips = abc();
    expect(insertionIndexAt(clips, 400)).toBe(0);
    expect(insertionIndexAt(clips, 600)).toBe(1);
    expect(insertionIndexAt(clips, 4600)).toBe(3);
  });

  it('mutes a clip', () => {
    expect(setClipMuted(abc(), 'b', false)[1]!.muted).toBe(false);
    const clips = abc();
    expect(setClipMuted(clips, 'b', true)).toBe(clips);
  });

  it('measures the project as voiceover or clips, whichever is longer', () => {
    expect(projectDurationMs({ clips: abc() })).toBe(6000);
    expect(
      projectDurationMs({
        clips: abc(),
        voiceover: { src: 'x', durationMs: 9000, source: 'tts', volume: 1 },
      }),
    ).toBe(9000);
  });
});
