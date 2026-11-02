import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EditorShell } from '@/components/editor/editor-shell';
import { EditorStoreProvider } from '@/components/editor/editor-store-provider';
import { Button } from '@/components/ui/button';
import { isUuid } from '@/lib/api/http';
import { requireUser } from '@/lib/auth/dal';
import { getProject } from '@/lib/projects/repo';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Editor · Viraler' };

export default async function EditorPage({ params }: PageProps<'/projects/[id]'>) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}`);
  if (!isUuid(id)) notFound();

  const result = await getProject(await createClient(), id);
  if (result.kind === 'not_found') notFound();

  if (result.kind === 'invalid') {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">This project can&apos;t be opened</h1>
        <p className="text-sm text-muted-foreground">
          “{result.summary.title}” has data this version of Viraler doesn&apos;t understand. It
          hasn&apos;t been changed.
        </p>
        <Button nativeButton={false} render={<Link href="/projects" />}>
          Back to projects
        </Button>
      </main>
    );
  }

  const { project } = result;
  return (
    <EditorStoreProvider
      key={project.id}
      initial={{
        id: project.id,
        userId: user.id,
        title: project.title,
        project: project.data,
        revision: project.revision,
        loadedUpdatedAt: project.updatedAt,
      }}
    >
      <EditorShell />
    </EditorStoreProvider>
  );
}
