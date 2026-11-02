import { isUuid, notFound, requireApiUser } from '@/lib/api/http';
import { getJob } from '@/lib/jobs/service';

export async function GET(_req: Request, ctx: RouteContext<'/api/jobs/[id]'>) {
  const { id } = await ctx.params;
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!isUuid(id)) return notFound();

  const job = await getJob(auth.supabase, id);
  return job ? Response.json(job) : notFound();
}
