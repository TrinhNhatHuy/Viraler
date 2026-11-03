import { z } from 'zod';
import { CaptionWord, Ms, SCRIPT_MAX_CHARS } from './project';
import { VoiceId } from './voices';

export const JobType = z.enum(['tts', 'transcribe', 'stock_search', 'image', 'render']);
export type JobType = z.infer<typeof JobType>;

export const JobStatus = z.enum(['queued', 'running', 'done', 'failed']);
export type JobStatus = z.infer<typeof JobStatus>;

export const ACTIVE_JOB_STATUSES = ['queued', 'running'] as const satisfies readonly JobStatus[];

export const MAX_JOB_ATTEMPTS = 3;
/** Max queued + running jobs per user. */
export const MAX_ACTIVE_JOBS_PER_USER = 3;

export const TTS_SPEED_MIN = 0.5;
export const TTS_SPEED_MAX = 2;

// Per-type inputs. Mirrored in services/worker/app/models.py.
export const TtsInput = z.object({
  text: z.string().trim().min(1, 'Script is empty').max(SCRIPT_MAX_CHARS),
  voice: VoiceId,
  speed: z.number().min(TTS_SPEED_MIN).max(TTS_SPEED_MAX).default(1),
});
export type TtsInput = z.infer<typeof TtsInput>;

export const TtsOutput = z.object({
  path: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  sampleRate: z.number().int().positive(),
  voice: z.string(),
});
export type TtsOutput = z.infer<typeof TtsOutput>;

export const TranscribeInput = z.object({
  /** Storage key of the voiceover; must be inside the job's project folder. */
  audioPath: z.string().min(1),
  /** Script the captions are aligned to (empty = use the raw transcript). */
  script: z.string().max(SCRIPT_MAX_CHARS).default(''),
});
export type TranscribeInput = z.infer<typeof TranscribeInput>;

export const TranscribeOutput = z.object({
  audioPath: z.string().min(1),
  words: z.array(CaptionWord),
  language: z.string(),
  /** True if the words are the script's text with Whisper's timing; false = raw transcript. */
  aligned: z.boolean(),
  durationMs: Ms,
});
export type TranscribeOutput = z.infer<typeof TranscribeOutput>;

// Fleshed out in the phase that implements each job.
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

// --- API (/api/jobs) -----------------------------------------------------------

/** Job types the web API accepts so far. Others are added as their phase lands. */
export const CreateJobBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tts'), projectId: z.uuid(), input: TtsInput }),
  z.object({ type: z.literal('transcribe'), projectId: z.uuid(), input: TranscribeInput }),
]);
export type CreateJobBody = z.infer<typeof CreateJobBody>;

/** Job as returned by the web API (camelCase). */
export const JobView = z.object({
  id: z.uuid(),
  type: JobType,
  status: JobStatus,
  projectId: z.uuid().nullable(),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  attempts: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobView = z.infer<typeof JobView>;
