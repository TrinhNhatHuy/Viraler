import { describe, expect, it } from 'vitest';
import { CreateJobBody, Job, JobInputByType, JobType, JobView, TtsInput, TtsOutput } from './job';
import { VOICES } from './voices';

const row = {
  id: '6f1d3c3e-2b7a-4c1e-9f0a-1d2e3f4a5b6c',
  user_id: '0b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  project_id: null,
  type: 'tts',
  status: 'queued',
  input: { text: 'hi', voice: 'af_heart' },
  output: null,
  error: null,
  attempts: 0,
  locked_at: null,
  created_at: '2026-11-02T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
};
const projectId = '6f1d3c3e-2b7a-4c1e-9f0a-1d2e3f4a5b6d';

describe('Job schema', () => {
  it('accepts a queued job row', () => {
    expect(Job.safeParse(row).success).toBe(true);
  });

  it('rejects unknown job types and statuses', () => {
    expect(Job.safeParse({ ...row, type: 'upscale' }).success).toBe(false);
    expect(Job.safeParse({ ...row, status: 'paused' }).success).toBe(false);
  });

  it('rejects attempts above the max', () => {
    expect(Job.safeParse({ ...row, attempts: 4 }).success).toBe(false);
  });

  it('has an input schema for every job type', () => {
    for (const t of JobType.options) expect(JobInputByType[t]).toBeDefined();
  });
});

describe('TtsInput', () => {
  it('accepts every curated voice and defaults speed to 1', () => {
    for (const v of VOICES) {
      expect(TtsInput.parse({ text: 'hello', voice: v.id })).toEqual({
        text: 'hello',
        voice: v.id,
        speed: 1,
      });
    }
  });

  it('trims text and rejects blank text', () => {
    expect(TtsInput.parse({ text: '  hi  ', voice: 'af_heart' }).text).toBe('hi');
    expect(TtsInput.safeParse({ text: '   ', voice: 'af_heart' }).success).toBe(false);
  });

  it('rejects unknown voices and out-of-range speed', () => {
    expect(TtsInput.safeParse({ text: 'hi', voice: 'zz_nobody' }).success).toBe(false);
    expect(TtsInput.safeParse({ text: 'hi', voice: 'af_heart', speed: 0.4 }).success).toBe(false);
    expect(TtsInput.safeParse({ text: 'hi', voice: 'af_heart', speed: 2.1 }).success).toBe(false);
  });

  it('rejects text over 5000 chars', () => {
    expect(TtsInput.safeParse({ text: 'a'.repeat(5001), voice: 'af_heart' }).success).toBe(false);
  });
});

describe('CreateJobBody', () => {
  it('accepts a tts job', () => {
    const body = { type: 'tts', projectId, input: { text: 'hi', voice: 'af_heart', speed: 1.2 } };
    expect(CreateJobBody.safeParse(body).success).toBe(true);
  });

  it('rejects job types the API does not accept yet', () => {
    const body = { type: 'render', projectId, input: { projectId } };
    expect(CreateJobBody.safeParse(body).success).toBe(false);
  });

  it('requires a uuid projectId', () => {
    const body = { type: 'tts', projectId: 'nope', input: { text: 'hi', voice: 'af_heart' } };
    expect(CreateJobBody.safeParse(body).success).toBe(false);
  });
});

describe('JobView / TtsOutput', () => {
  it('parses a finished tts job view', () => {
    const view = {
      id: row.id,
      type: 'tts',
      status: 'done',
      projectId,
      input: row.input,
      output: {
        path: 'u/p/voiceover/tts-x.wav',
        durationMs: 4100,
        sampleRate: 24000,
        voice: 'af_heart',
      },
      error: null,
      attempts: 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    expect(JobView.safeParse(view).success).toBe(true);
    expect(TtsOutput.safeParse(view.output).success).toBe(true);
  });
});
