'use client';

import { CanvasSettings } from './canvas-settings';
import { ConflictBanner } from './conflict-banner';
import { EditorHeader } from './editor-header';
import { PreviewPlaceholder } from './preview-placeholder';
import { useAutosave } from './use-autosave';

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function EditorShell() {
  const { saveNow } = useAutosave();
  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader saveNow={saveNow} />
      <ConflictBanner saveNow={saveNow} />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[16rem_1fr_18rem]">
        <aside className="hidden border-r p-3 md:block">
          <Placeholder>Media library — Phase 5</Placeholder>
        </aside>
        <main className="flex min-h-0 items-center justify-center bg-muted/40 p-6">
          <PreviewPlaceholder />
        </main>
        <aside className="border-t p-4 md:border-t-0 md:border-l">
          <CanvasSettings />
        </aside>
      </div>
      <footer className="h-36 shrink-0 border-t p-3">
        <Placeholder>Timeline — Phase 5</Placeholder>
      </footer>
    </div>
  );
}
