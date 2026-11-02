'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CanvasSettings } from './canvas-settings';
import { ConflictBanner } from './conflict-banner';
import { EditorHeader } from './editor-header';
import { PreviewPlaceholder } from './preview-placeholder';
import { ScriptPanel } from './script-panel';
import { useAutosave } from './use-autosave';
import { VoiceoverPanel } from './voiceover-panel';

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
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[22rem_1fr_18rem] md:overflow-hidden">
        <aside className="min-h-0 border-b md:border-r md:border-b-0">
          <Tabs defaultValue="script" className="flex h-full flex-col gap-0">
            <TabsList variant="line" className="w-full shrink-0 border-b px-3">
              <TabsTrigger value="script">Script &amp; voice</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
            </TabsList>
            {/* keepMounted: a running TTS job or recording survives switching tabs */}
            <TabsContent value="script" keepMounted className="min-h-0 overflow-y-auto">
              <div className="grid gap-6 p-4">
                <ScriptPanel />
                <VoiceoverPanel />
              </div>
            </TabsContent>
            <TabsContent value="media" className="p-3">
              <Placeholder>Media library — Phase 5</Placeholder>
            </TabsContent>
          </Tabs>
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
