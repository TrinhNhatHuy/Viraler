import { CreateProjectBody, createEmptyProject } from '@viraler/shared';
import { parseJson, requireApiUser } from '@/lib/api/http';
import { createProject, listProjects } from '@/lib/projects/repo';

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json({ projects: await listProjects(auth.supabase) });
}

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await parseJson(req, CreateProjectBody);
  if (!body.ok) return body.response;

  const project = await createProject(auth.supabase, {
    title: body.data.title,
    data: createEmptyProject(),
  });
  return Response.json(project, { status: 201 });
}
