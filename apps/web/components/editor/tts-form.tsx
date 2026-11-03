'use client';

import {
  DEFAULT_VOICE,
  type JobView,
  TtsOutput,
  VOICES,
  type VoiceId,
  voiceLabel,
} from '@viraler/shared';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { scriptHash } from '@/lib/script/hash';
import { countWords, estimateDurationMs, formatDuration } from '@/lib/script/stats';
import { useEditorStore, useEditorStoreApi } from './editor-store-provider';
import { useProjectJob } from './use-project-job';
import { withVoiceover } from './voiceover-actions';

const VOICE_ITEMS = Object.fromEntries(VOICES.map((v) => [v.id, voiceLabel(v.id)]));
const SPEED_MIN = 0.8;
const SPEED_MAX = 1.4;

export function TtsForm() {
  const store = useEditorStoreApi();
  const script = useEditorStore((s) => s.project.script);
  const projectId = useEditorStore((s) => s.id);
  const updateProject = useEditorStore((s) => s.updateProject);
  const currentVoice = useEditorStore((s) =>
    s.project.voiceover?.source === 'tts' ? s.project.voiceover.voice : undefined,
  );
  const hasVoiceover = useEditorStore((s) => Boolean(s.project.voiceover));

  const [voice, setVoice] = useState<VoiceId>(
    currentVoice && currentVoice in VOICE_ITEMS ? currentVoice : DEFAULT_VOICE,
  );
  const [speed, setSpeed] = useState(1);

  const apply = useCallback(
    (job: JobView) => {
      const output = TtsOutput.safeParse(job.output);
      const text = typeof job.input.text === 'string' ? job.input.text : '';
      if (!output.success) return;
      updateProject((p) =>
        p.voiceover?.src === output.data.path
          ? p
          : withVoiceover(p, {
              src: output.data.path,
              durationMs: output.data.durationMs,
              source: 'tts',
              voice: output.data.voice,
              scriptHash: scriptHash(text),
            }),
      );
    },
    [updateProject],
  );

  const { start, job, busy, stalled, error } = useProjectJob({
    type: 'tts',
    onDone: apply,
    failedMessage: 'Voiceover generation failed.',
  });

  const generate = () =>
    start({
      type: 'tts',
      projectId,
      input: { text: store.getState().project.script, voice, speed },
    });

  const words = countWords(script);
  const status = !busy
    ? null
    : stalled
      ? 'Still waiting for the worker. Is it running?'
      : job?.status === 'running'
        ? 'Generating voiceover…'
        : 'Waiting for the worker…';

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="tts-voice">Voice</Label>
        <Select
          items={VOICE_ITEMS}
          value={voice}
          onValueChange={(v) => {
            if (typeof v === 'string' && v in VOICE_ITEMS) setVoice(v);
          }}
        >
          <SelectTrigger id="tts-voice" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['US', 'UK'] as const).map((accent) => (
              <SelectGroup key={accent}>
                <SelectLabel>
                  {accent === 'US' ? 'American English' : 'British English'}
                </SelectLabel>
                {VOICES.filter((v) => v.accent === accent).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label} · {v.gender}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label id="tts-speed-label">Speed</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{speed.toFixed(2)}×</span>
        </div>
        <Slider
          aria-labelledby="tts-speed-label"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={0.05}
          value={speed}
          onValueChange={(v) => setSpeed(typeof v === 'number' ? v : (v[0] ?? 1))}
        />
        <p className="text-xs text-muted-foreground">
          ≈ {formatDuration(estimateDurationMs(words, undefined, speed))} at this speed
        </p>
      </div>

      <Button onClick={generate} disabled={busy || !script.trim()}>
        {busy ? 'Generating…' : hasVoiceover ? 'Regenerate voiceover' : 'Generate voiceover'}
      </Button>
      {!script.trim() && <p className="text-xs text-muted-foreground">Write a script first.</p>}
      {status && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {status}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
