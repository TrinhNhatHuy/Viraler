import { z } from 'zod';

export const JobType = z.enum(['tts', 'transcribe', 'stock_search', 'image', 'render']);
export type JobType = z.infer<typeof JobType>;

export const JobStatus = z.enum(['queued', 'running', 'done', 'failed']);
export type JobStatus = z.infer<typeof JobStatus>;

export const MAX_JOB_ATTEMPTS = 3;

// Per-type inputs. Stubs for now; each is fleshed out in the phase that implements the job.
export const TtsInput = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().min(1),
});
export const TranscribeInput = z.object({
  audioPath: z.string().min(1),
});
export const StockSearchInput = z.object({
  query: z.string().min(1).max(200),
  kind: z.enum(['video', 'image']),
  page: z.number().int().positive().default(1),
});
export const ImageInput = z.object({
  prompt: z.string().min(1).max(1000),
});
export const RenderInput = z.object({
  projectId: z.uuid(),
});

export const JobInputByType = {
  tts: TtsInput,
  transcribe: TranscribeInput,
  stock_search: StockSearchInput,
  image: ImageInput,
  render: RenderInput,
} as const satisfies Record<JobType, z.ZodType>;

/** A row of the `jobs` table as returned by Supabase (snake_case columns). */
export const Job = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  project_id: z.uuid().nullable(),
  type: JobType,
  status: JobStatus,
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  attempts: z.number().int().min(0).max(MAX_JOB_ATTEMPTS),
  locked_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Job = z.infer<typeof Job>;
