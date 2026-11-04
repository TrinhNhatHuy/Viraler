import { describe, expect, it } from 'vitest';
import sample from '../fixtures/project.sample.json' with { type: 'json' };
import { fontWeight, TEXT_FONTS } from './fonts';
import {
  createEmptyProject,
  DEFAULT_RANK_COLOR,
  DEFAULT_RANKING_TITLE_STYLE,
  Project,
  SCRIPT_MAX_CHARS,
} from './project';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('Project schema', () => {
  it('accepts the shared sample fixture', () => {
    expect(Project.safeParse(sample).success).toBe(true);
  });

  it('accepts an empty project', () => {
    expect(Project.safeParse(createEmptyProject()).success).toBe(true);
  });

  it('accepts a project without voiceover', () => {
    const p: Record<string, unknown> = clone(sample);
    delete p.voiceover;
    expect(Project.safeParse(p).success).toBe(true);
  });

  it('accepts captions without a voiceoverSrc', () => {
    const p = clone(sample);
    delete (p.captions as { voiceoverSrc?: string }).voiceoverSrc;
    expect(Project.safeParse(p).success).toBe(true);
  });

  it('accepts media items without the optional display fields', () => {
    const p = clone(sample);
    p.media[0] = { id: 'm', kind: 'image', src: 'u/media/m.jpg', origin: 'upload' };
    expect(Project.safeParse(p).success).toBe(true);
  });

  it('rejects zero-sized media dimensions', () => {
    const p = clone(sample);
    p.media[0]!.width = 0;
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('rejects negative times', () => {
    const p = clone(sample);
    p.clips[0]!.startMs = -1;
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('rejects non-integer times', () => {
    const p = clone(sample);
    p.clips[0]!.durationMs = 100.5;
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('rejects caption words that end before they start', () => {
    const p = clone(sample);
    p.captions.words[0] = { text: 'x', startMs: 500, endMs: 100 };
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('rejects scripts over the max length', () => {
    const p = clone(sample);
    p.script = 'a'.repeat(SCRIPT_MAX_CHARS + 1);
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('accepts a script at exactly the max length', () => {
    const p = clone(sample);
    p.script = 'a'.repeat(SCRIPT_MAX_CHARS);
    expect(Project.safeParse(p).success).toBe(true);
  });

  it('rejects unknown enum values', () => {
    const p = clone(sample);
    (p.canvas as { fit: string }).fit = 'stretch';
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('rejects a wrong canvas size', () => {
    const p = clone(sample);
    (p.canvas as { width: number }).width = 720;
    expect(Project.safeParse(p).success).toBe(false);
  });

  it('rejects unsupported versions', () => {
    const p = clone(sample);
    (p as { version: number }).version = 2;
    expect(Project.safeParse(p).success).toBe(false);
  });
});

describe('Phase 7 style fields', () => {
  /** A project as saved before Phase 7: none of the new fields. */
  function phase6Project(): Record<string, unknown> {
    const p = clone(sample) as unknown as {
      captions: { style: Record<string, unknown> };
      hookTitle: Record<string, unknown>;
      ranking: Record<string, unknown>;
    };
    for (const k of ['highlightMode', 'animation', 'maxLines']) delete p.captions.style[k];
    delete p.hookTitle.entrance;
    for (const k of ['layout', 'titleStyle', 'labelStyle', 'rankColor', 'entrance']) {
      delete p.ranking[k];
    }
    return p as unknown as Record<string, unknown>;
  }

  it('parses an older project, filling in defaults that keep its look', () => {
    const parsed = Project.parse(phase6Project());
    expect(parsed.captions.style).toMatchObject({
      highlightMode: 'color',
      animation: 'none',
      maxLines: 1,
    });
    expect(parsed.hookTitle.entrance).toBe('none');
    expect(parsed.ranking).toMatchObject({
      layout: 'badge',
      rankColor: DEFAULT_RANK_COLOR,
      entrance: 'none',
      titleStyle: DEFAULT_RANKING_TITLE_STYLE,
    });
  });

  it('rejects unknown values', () => {
    for (const [path, value] of [
      [['captions', 'style', 'highlightMode'], 'glow'],
      [['captions', 'style', 'maxLines'], 3],
      [['ranking', 'layout'], 'grid'],
      [['ranking', 'rankColor'], 'gold'],
      [['hookTitle', 'entrance'], 'spin'],
    ] as const) {
      const p = clone(sample) as unknown as Record<string, Record<string, unknown>>;
      let target: Record<string, unknown> = p;
      for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
      target[path.at(-1)!] = value;
      expect(Project.safeParse(p).success, path.join('.')).toBe(false);
    }
  });

  it('gives new projects pop-in animations', () => {
    const p = createEmptyProject();
    expect(p.captions.style.animation).toBe('pop');
    expect(p.hookTitle.entrance).toBe('pop');
    expect(p.ranking.entrance).toBe('pop');
  });

  it('knows each font weight', () => {
    expect(TEXT_FONTS.map((f) => f.id)).toContain('Bebas Neue');
    expect(fontWeight('Bebas Neue')).toBe(400);
    expect(fontWeight('Oswald')).toBe(700);
    expect(fontWeight('Comic Sans')).toBe(800);
  });
});
