import { type Clip, createEmptyProject, type Project } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { normalizeClips } from '@/lib/timeline/model';
import {
  audioPlan,
  clipSourceTimes,
  exportChecks,
  exportFileName,
  frameCount,
  frameTimeMs,
} from './plan';

const clip = (id: string, durationMs: number, extra: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'v',
  startMs: 0,
  durationMs,
  trimInMs: 0,
  muted: true,
  ...extra,
});

function project(patch: Partial<Project> = {}): Project {
  return {
    ...createEmptyProject(),
    voiceover: { src: 'u/p/voiceover/vo.wav', durationMs: 6000, source: 'tts', volume: 0.8 },
    media: [
      { id: 'v', kind: 'video', src: 'u/media/v.mp4', origin: 'upload', durationMs: 20_000 },
      { id: 'i', kind: 'image', src: 'u/media/i.jpg', origin: 'upload' },
    ],
    clips: normalizeClips([
      clip('a', 2000, { trimInMs: 500, muted: false }),
      clip('b', 2000, { mediaId: 'i', muted: false }),
      clip('c', 2000),
    ]),
    ...patch,
  };
}

describe('frames', () => {
  it('counts frames to cover the whole duration', () => {
    expect(frameCount(10_001, 30)).toBe(301);
    expect(frameCount(10_000, 30)).toBe(300);
    expect(frameCount(1000, 60)).toBe(60);
    expect(frameCount(0, 30)).toBe(0);
    expect(frameTimeMs(3, 30)).toBe(100);
  });

  it('gives each clip the source times of the frames inside it', () => {
    const c = clip('a', 100, { startMs: 1000, trimInMs: 500 });
    // Frames at 1000, 1033.3, 1066.7 ms fall in [1000, 1100).
    const times = clipSourceTimes(c, 30);
    expect(times).toHaveLength(3);
    expect(times[0]).toBeCloseTo(0.5);
    expect(times[2]).toBeCloseTo(0.5 + 2 / 30);
    expect(times.every((s) => s < 0.6)).toBe(true);
  });

  it('assigns every frame to exactly one clip', () => {
    const clips = normalizeClips([clip('a', 1234), clip('b', 999), clip('c', 2001)]);
    const total = clips.reduce((n, c) => n + clipSourceTimes(c, 30).length, 0);
    expect(total).toBe(frameCount(1234 + 999 + 2001, 30));
  });
});

describe('audioPlan', () => {
  it('mixes the voiceover and unmuted video clips only', () => {
    expect(audioPlan(project())).toEqual([
      {
        kind: 'voiceover',
        src: 'u/p/voiceover/vo.wav',
        startSec: 0,
        offsetSec: 0,
        durationSec: 6,
        gain: 0.8,
      },
      {
        kind: 'clip',
        src: 'u/media/v.mp4',
        mediaId: 'v',
        startSec: 0,
        offsetSec: 0.5,
        durationSec: 2,
        gain: 1,
      },
    ]);
  });

  it('leaves out a silent voiceover', () => {
    const p = project();
    expect(audioPlan({ ...p, voiceover: { ...p.voiceover!, volume: 0 } })).toHaveLength(1);
  });
});

describe('exportChecks', () => {
  it('blocks an empty project', () => {
    const empty = { ...createEmptyProject() };
    expect(exportChecks(empty).errors).toHaveLength(1);
  });

  it('blocks clips with missing media', () => {
    const p = project();
    expect(exportChecks({ ...p, media: p.media.slice(1) }).errors[0]).toMatch(/missing media/);
  });

  it('warns when clips end before the voiceover or captions are stale', () => {
    const p = project({
      voiceover: { src: 'u/p/voiceover/vo.wav', durationMs: 9000, source: 'tts', volume: 1 },
    });
    const stale = {
      ...p,
      captions: {
        ...p.captions,
        words: [{ text: 'hi', startMs: 0, endMs: 100 }],
        voiceoverSrc: 'u/p/voiceover/old.wav',
      },
    };
    const { errors, warnings } = exportChecks(stale);
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/last 3\.0 s/);
    expect(warnings[1]).toMatch(/different voiceover/);
  });

  it('passes a fitted project', () => {
    expect(exportChecks(project())).toEqual({ errors: [], warnings: [] });
  });
});

describe('exportFileName', () => {
  it('makes a safe file name', () => {
    expect(exportFileName('Top 3: fastest/animals?')).toBe('Top 3 fastest animals.mp4');
    expect(exportFileName('  ')).toBe('video.mp4');
    expect(exportFileName('...hidden')).toBe('hidden.mp4');
    expect(exportFileName('x'.repeat(300))).toHaveLength(104);
  });
});
