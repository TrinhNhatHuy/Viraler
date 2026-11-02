'use client';

import { voiceLabel } from '@viraler/shared';
import { Trash2Icon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { scriptHash } from '@/lib/script/hash';
import { formatDuration } from '@/lib/script/stats';
import { AudioUpload } from './audio-upload';
import { useEditorStore } from './editor-store-provider';
import { Recorder } from './recorder';
import { TtsForm } from './tts-form';
import { useSignedUrl } from './use-signed-url';
import { withoutVoiceover } from './voiceover-actions';

const SOURCE_LABEL = { tts: 'AI voice', recorded: 'Recorded', uploaded: 'Uploaded' } as const;

export function VoiceoverPanel() {
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold">Voiceover</h2>
      <CurrentVoiceover />
      <Tabs defaultValue="tts">
        <TabsList className="w-full">
          <TabsTrigger value="tts">AI voice</TabsTrigger>
          <TabsTrigger value="record">Record</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        {/* keepMounted: switching tabs must not cancel a running job or recording */}
        <TabsContent value="tts" keepMounted className="pt-3">
          <TtsForm />
        </TabsContent>
        <TabsContent value="record" keepMounted className="pt-3">
          <Recorder />
        </TabsContent>
        <TabsContent value="upload" className="pt-3">
          <AudioUpload />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function CurrentVoiceover() {
  const voiceover = useEditorStore((s) => s.project.voiceover);
  const script = useEditorStore((s) => s.project.script);
  const updateProject = useEditorStore((s) => s.updateProject);
  const { url, error, refresh } = useSignedUrl(voiceover?.src ?? null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const volume = voiceover?.volume ?? 1;

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, url]);

  if (!voiceover) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        No voiceover yet. Generate one with an AI voice, record one, or upload a file.
      </p>
    );
  }

  const stale =
    voiceover.source === 'tts' &&
    voiceover.scriptHash !== undefined &&
    voiceover.scriptHash !== scriptHash(script);

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-medium">
            {SOURCE_LABEL[voiceover.source]}
            {voiceover.source === 'tts' && voiceover.voice && ` · ${voiceLabel(voiceover.voice)}`}
          </p>
          <p className="text-xs text-muted-foreground">{formatDuration(voiceover.durationMs)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove voiceover"
          onClick={() => updateProject(withoutVoiceover)}
        >
          <Trash2Icon />
        </Button>
      </div>

      {url ? (
        <audio ref={audioRef} controls src={url} onError={refresh} className="w-full" />
      ) : (
        <div className="h-10 animate-pulse rounded bg-muted" aria-label="Loading audio" />
      )}
      {error && <p className="text-xs text-destructive">Couldn&apos;t load audio: {error}</p>}

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label id="vo-volume-label">Volume</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(volume * 100)}%
          </span>
        </div>
        <Slider
          aria-labelledby="vo-volume-label"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onValueChange={(v) => {
            const pct = typeof v === 'number' ? v : (v[0] ?? 100);
            updateProject((p) =>
              p.voiceover ? { ...p, voiceover: { ...p.voiceover, volume: pct / 100 } } : p,
            );
          }}
        />
      </div>

      {stale && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          The script changed since this voiceover was generated. Regenerate it below to match.
        </p>
      )}
    </div>
  );
}
