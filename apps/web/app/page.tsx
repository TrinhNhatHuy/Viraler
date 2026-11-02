import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/dal';

export default async function Home() {
  if (await getCurrentUser()) redirect('/projects');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Viraler</h1>
      <p className="max-w-md text-muted-foreground">
        Script → AI voiceover → captions → visuals → MP4. Vertical short-form videos for TikTok,
        Shorts and Reels.
      </p>
      <div className="flex gap-3">
        <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
          Get started
        </Button>
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login" />}>
          Log in
        </Button>
      </div>
    </main>
  );
}
