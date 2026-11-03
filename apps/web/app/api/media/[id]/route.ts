import type { NextRequest } from 'next/server';
import { apiError, isUuid, notFound, requireApiUser } from '@/lib/api/http';
import { deleteMedia } from '@/lib/media/repo';

/** DELETE /api/media/[id][?force=1]: 409 `media_in_use` lists the projects using it. */
export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/media/[id]'>) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!isUuid(id)) return notFound();

  const force = req.nextUrl.searchParams.get('force') === '1';
  const result = await deleteMedia(auth.supabase, id, { force });
  switch (result.kind) {
    case 'ok':
      return new Response(null, { status: 204 });
    case 'not_found':
      return notFound();
    case 'in_use':
      return apiError(409, 'media_in_use', {
        message: `Used in ${result.projects.length} project(s).`,
        details: { projects: result.projects },
      });
  }
}
