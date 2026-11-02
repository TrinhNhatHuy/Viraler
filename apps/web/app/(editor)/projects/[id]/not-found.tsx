import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ProjectNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Project not found</h1>
      <p className="text-sm text-muted-foreground">
        It may have been deleted, or it belongs to another account.
      </p>
      <Button nativeButton={false} render={<Link href="/projects" />}>
        Back to projects
      </Button>
    </main>
  );
}
