import { describe, expect, it } from 'vitest';
import { Job, JobInputByType, JobType } from './job';

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

  it('validates tts input', () => {
    expect(JobInputByType.tts.safeParse({ text: 'hello', voice: 'af_heart' }).success).toBe(true);
    expect(JobInputByType.tts.safeParse({ text: '', voice: 'af_heart' }).success).toBe(false);
  });
});
