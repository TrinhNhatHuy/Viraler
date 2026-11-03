import { describe, expect, it } from 'vitest';
import sample from '../fixtures/project.sample.json' with { type: 'json' };
import { createEmptyProject, Project, SCRIPT_MAX_CHARS } from './project';

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
