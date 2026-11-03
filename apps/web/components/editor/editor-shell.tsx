'use client';

import { MediaPanel } from '@/components/media/media-panel';
import { TimelinePanel } from '@/components/timeline/timeline-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CanvasSettings } from './canvas-settings';
import { CaptionsPanel } from './captions-panel';
import { ConflictBanner } from './conflict-banner';
import { EditorHeader } from './editor-header';
import { OverlaysPanel } from './overlays-panel';
import { Preview } from './preview';
import { PreviewTransport } from './preview-transport';
import { ScriptPanel } from './script-panel';
import { useAutosave } from './use-autosave';
import { useUndoShortcuts } from './use-undo-shortcuts';
import { VoiceoverAudio } from './voiceover-audio';
import { VoiceoverPanel } from './voiceover-panel';

export function EditorShell() {
  const { saveNow } = useAutosave();
  useUndoShortcuts();
  return (
    <div className="flex h-dvh flex-col">
      <VoiceoverAudio />
      <EditorHeader saveNow={saveNow} />
      <ConflictBanner saveNow={saveNow} />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[22rem_1fr_18rem] md:overflow-hidden">
        {/* Shrinkable (min-h-0) only in the 3-column layout; stacked, it keeps its height and the page scrolls. */}
        <aside className="border-b md:min-h-0 md:border-r md:border-b-0">
          <Tabs defaultValue="script" className="flex h-full flex-col gap-0">
            <TabsList variant="line" className="w-full shrink-0 border-b px-3">
              <TabsTrigger value="script">Script &amp; voice</TabsTrigger>
              <TabsTrigger value="captions">Captions</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
            </TabsList>
            {/* keepMounted: a running job or recording survives switching tabs */}
            <TabsContent value="script" keepMounted className="min-h-0 overflow-y-auto">
              <div className="grid gap-6 p-4">
                <ScriptPanel />
                <VoiceoverPanel />
              </div>
            </TabsContent>
            <TabsContent value="captions" keepMounted className="min-h-0 overflow-y-auto">
              <div className="p-4">
                <CaptionsPanel />
              </div>
            </TabsContent>
            <TabsContent value="media" keepMounted className="min-h-0 overflow-y-auto">
              <div className="p-4">
                <MediaPanel />
              </div>
            </TabsContent>
          </Tabs>
        </aside>
        <main className="flex min-h-[28rem] flex-col items-center gap-3 bg-muted/40 p-6 md:min-h-0">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <Preview />
          </div>
          <PreviewTransport />
        </main>
        <aside className="grid content-start gap-6 border-t p-4 md:min-h-0 md:overflow-y-auto md:border-t-0 md:border-l">
          <CanvasSettings />
          <OverlaysPanel />
        </aside>
      </div>
      <footer className="shrink-0 border-t px-3 py-2">
        <TimelinePanel />
      </footer>
    </div>
  );
}
