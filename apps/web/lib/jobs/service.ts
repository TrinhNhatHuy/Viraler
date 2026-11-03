import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACTIVE_JOB_STATUSES,
  type CreateJobBody,
  HEAVY_JOB_TYPES,
  isInProjectFolder,
  type JobView,
  MAX_ACTIVE_JOBS_PER_USER,
  MAX_ACTIVE_SEARCHES_PER_USER,
} from '@viraler/shared';
import { RepoError } from '@/lib/projects/repo';
import type { Database, Json, Tables } from '@/lib/supabase/database.types';

type Db = SupabaseClient<Database>;
type JobRow = Tables<'jobs'>;

const VIEW_COLUMNS =
  'id, type, status, project_id, input, output, error, attempts, created_at, updated_at';

type ViewRow = Pick<
  JobRow,
  | 'id'
  | 'type'
  | 'status'
  | 'project_id'
  | 'input'
  | 'output'
  | 'error'
  | 'attempts'
  | 'created_at'
  | 'updated_at'
>;

const asRecord = (v: Json | null): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function toView(row: ViewRow): JobView {
  return {
    id: row.id,
    type: row.type as JobView['type'],
    status: row.status as JobView['status'],
    projectId: row.project_id,
    input: asRecord(row.input) ?? {},
    output: asRecord(row.output),
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreateJobResult =
  | { kind: 'ok'; job: JobView }
  | { kind: 'project_not_found' }
  | { kind: 'forbidden_path'; path: string }
  | { kind: 'too_many_active'; limit: number; search: boolean };

/**
 * Queues a job. Ownership is checked with the *user's* client (RLS); the insert
 * uses the service-role client because users can't write `jobs` directly.
 */
export async function createJob(
  userDb: Db,
  adminDb: Db,
  userId: string,
  body: CreateJobBody,
): Promise<CreateJobResult> {
  // The worker reads files with the service role, so a job may only point at
  // files in its own project's folder.
  if (
    body.type === 'transcribe' &&
    !isInProjectFolder(body.input.audioPath, userId, body.projectId)
  ) {
    return { kind: 'forbidden_path', path: body.input.audioPath };
  }

  const { data: project, error: projectError } = await userDb
    .from('projects')
    .select('id')
    .eq('id', body.projectId)
    .maybeSingle();
  if (projectError) throw new RepoError(projectError.message, projectError.code);
  if (!project) return { kind: 'project_not_found' };

  // Heavy jobs and stock searches have separate caps (the worker runs them in
  // separate loops), so a search is never refused because TTS is running.
  const search = body.type === 'stock_search';
  const limit = search ? MAX_ACTIVE_SEARCHES_PER_USER : MAX_ACTIVE_JOBS_PER_USER;
  const { count, error: countError } = await adminDb
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', [...ACTIVE_JOB_STATUSES])
    .in('type', search ? ['stock_search'] : [...HEAVY_JOB_TYPES]);
  if (countError) throw new RepoError(countError.message, countError.code);
  if ((count ?? 0) >= limit) return { kind: 'too_many_active', limit, search };

  const { data: row, error } = await adminDb
    .from('jobs')
    .insert({
      user_id: userId,
      project_id: body.projectId,
      type: body.type,
      input: body.input as unknown as NonNullable<Json>,
    })
    .select(VIEW_COLUMNS)
    .single();
  if (error) throw new RepoError(error.message, error.code);
  return { kind: 'ok', job: toView(row) };
}

/** RLS: returns null for other users' jobs. */
export async function getJob(userDb: Db, id: string): Promise<JobView | null> {
  const { data, error } = await userDb.from('jobs').select(VIEW_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new RepoError(error.message, error.code);
  return data ? toView(data) : null;
}

export async function listJobs(
  userDb: Db,
  opts: { projectId: string; activeOnly: boolean },
): Promise<JobView[]> {
  let query = userDb
    .from('jobs')
    .select(VIEW_COLUMNS)
    .eq('project_id', opts.projectId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (opts.activeOnly) query = query.in('status', [...ACTIVE_JOB_STATUSES]);
  const { data, error } = await query;
  if (error) throw new RepoError(error.message, error.code);
  return data.map(toView);
}
