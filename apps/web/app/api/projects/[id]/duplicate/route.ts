import { isUuid, notFound, requireApiUser } from '@/lib/api/http';
import { duplicateProject } from '@/lib/projects/repo';

export async function POST(_req: Request, ctx: RouteContext<'/api/projects/[id]/duplicate'>) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!isUuid(id)) return notFound();

  const copy = await duplicateProject(auth.supabase, id);
  return copy ? Response.json(copy, { status: 201 }) : notFound();
}
