import { CreateJobBody } from '@viraler/shared';
import type { NextRequest } from 'next/server';
import { apiError, isUuid, parseJson, requireApiUser } from '@/lib/api/http';
import { createJob, listJobs } from '@/lib/jobs/service';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await parseJson(req, CreateJobBody);
  if (!body.ok) return body.response;

  const result = await createJob(auth.supabase, createAdminClient(), auth.user.id, body.data);
  switch (result.kind) {
    case 'ok':
      return Response.json(result.job, { status: 201 });
    case 'project_not_found':
      return apiError(404, 'not_found', { message: 'Project not found.' });
    case 'forbidden_path':
      return apiError(400, 'invalid_storage_path', {
        message: 'Audio must be a file in this project.',
      });
    case 'too_many_active':
      return apiError(429, 'too_many_jobs', {
        message: result.search
          ? 'A search is already running. Wait for it to finish.'
          : `You can have at most ${result.limit} jobs running. Wait for one to finish.`,
      });
  }
}

/** GET /api/jobs?projectId=<uuid>[&active=1] */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const projectId = req.nextUrl.searchParams.get('projectId') ?? '';
  if (!isUuid(projectId))
    return apiError(400, 'validation_error', { message: 'projectId required' });
  const activeOnly = req.nextUrl.searchParams.get('active') === '1';

  return Response.json({ jobs: await listJobs(auth.supabase, { projectId, activeOnly }) });
}
