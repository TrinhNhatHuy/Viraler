import type { Metadata } from 'next';
import { NewProjectButton } from '@/components/projects/new-project-button';
import { ProjectCard } from '@/components/projects/project-card';
import { requireUser } from '@/lib/auth/dal';
import { formatRelativeTime } from '@/lib/format';
import { listProjects } from '@/lib/projects/repo';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Projects · Viraler' };

export default async function ProjectsPage() {
  await requireUser('/projects');
  const projects = await listProjects(await createClient());
  const now = new Date();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
        {projects.length > 0 && <NewProjectButton />}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-20 text-center">
          <p className="text-lg font-medium">No projects yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create your first vertical video: write a script, add a voiceover and captions, then
            export an MP4.
          </p>
          <NewProjectButton />
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard
                id={p.id}
                title={p.title}
                editedLabel={`Edited ${formatRelativeTime(p.updatedAt, now)}`}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
