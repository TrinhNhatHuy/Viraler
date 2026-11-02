import { UpdateProjectBody } from '@viraler/shared';
import { apiError, isUuid, notFound, parseJson, requireApiUser } from '@/lib/api/http';
import {
  CHECK_VIOLATION,
  deleteProject,
  getProject,
  RepoError,
  updateProject,
} from '@/lib/projects/repo';

export async function GET(_req: Request, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!isUuid(id)) return notFound();

  const result = await getProject(auth.supabase, id);
  if (result.kind === 'not_found') return notFound();
  if (result.kind === 'invalid') {
    return apiError(422, 'invalid_project_data', { message: result.issues });
  }
  return Response.json(result.project);
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!isUuid(id)) return notFound();

  const body = await parseJson(req, UpdateProjectBody);
  if (!body.ok) return body.response;

  try {
    const result = await updateProject(auth.supabase, id, body.data);
    switch (result.kind) {
      case 'ok':
        return Response.json({ revision: result.revision, updatedAt: result.updatedAt });
      case 'conflict':
        return apiError(409, 'conflict', {
          message: 'The project was changed elsewhere.',
          revision: result.revision,
        });
      case 'not_found':
        return notFound();
    }
  } catch (e) {
    if (e instanceof RepoError && e.code === CHECK_VIOLATION) {
      return apiError(413, 'payload_too_large', { message: 'Project data is too large.' });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/projects/[id]'>) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!isUuid(id)) return notFound();

  const deleted = await deleteProject(auth.supabase, id);
  return deleted ? new Response(null, { status: 204 }) : notFound();
}
