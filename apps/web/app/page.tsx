import { Button } from '@/components/ui/button';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@viraler/shared';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Viraler</h1>
      <p className="text-muted-foreground">
        Vertical video editor · {CANVAS_WIDTH}×{CANVAS_HEIGHT}
      </p>
      <Button disabled>New project (Phase 2)</Button>
    </main>
  );
}
