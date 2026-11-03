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
    const result = await updateProject(auth.supabase, auth.user.id, id, body.data);
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
      case 'forbidden_path':
        return apiError(400, 'invalid_storage_path', {
          message: "Project data references a file that isn't yours or isn't allowed.",
        });
      case 'invalid_clip':
        return apiError(400, 'invalid_project', {
          message: 'A clip refers to media that is not in the project.',
        });
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

  const deleted = await deleteProject(auth.supabase, auth.user.id, id);
  return deleted ? new Response(null, { status: 204 }) : notFound();
}
