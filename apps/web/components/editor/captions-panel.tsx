'use client';

import { type JobView, TranscribeOutput } from '@viraler/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { applyTranscript, setCaptionsEnabled } from '@/lib/captions/edit';
import { CaptionStyleForm } from './caption-style-form';
import { CaptionWords } from './caption-words';
import { useEditorStore, useEditorStoreApi } from './editor-store-provider';
import { type DoneInfo, useProjectJob } from './use-project-job';

/**
 * Captions: generate word timings from the voiceover (transcribe job), style
 * them and fix words. A new voiceover set while the editor is open is captioned
 * automatically when captions are on.
 */
export function CaptionsPanel() {
  const store = useEditorStoreApi();
  const projectId = useEditorStore((s) => s.id);
  const updateProject = useEditorStore((s) => s.updateProject);
  const enabled = useEditorStore((s) => s.project.captions.enabled);
  const wordCount = useEditorStore((s) => s.project.captions.words.length);
  const voiceoverSrc = useEditorStore((s) => s.project.voiceover?.src ?? null);
  const captionsSrc = useEditorStore((s) => s.project.captions.voiceoverSrc ?? null);
  const [aligned, setAligned] = useState<boolean | null>(null);

  // Voiceover files already captioned (or tried) this session, so auto-run never
  // repeats one. Seeded with the file the project opened with: opening a project
  // doesn't start a job.
  const [attempted] = useState(() => {
    const src = store.getState().project.voiceover?.src;
    return new Set<string>(src ? [src] : []);
  });
  // The job hook's settle callback re-checks auto-run; set once `autoRun` exists.
  const autoRunRef = useRef<() => void>(() => {});

  const onDone = useCallback(
    (job: JobView, { resumed }: DoneInfo) => {
      const out = TranscribeOutput.safeParse(job.output);
      if (!out.success) return;
      // A job found on open may already be applied (and edited since): leave it.
      if (resumed && store.getState().project.captions.voiceoverSrc === out.data.audioPath) return;
      if (store.getState().project.voiceover?.src !== out.data.audioPath) return; // replaced mid-job
      updateProject((p) => applyTranscript(p, out.data));
      setAligned(out.data.aligned);
    },
    [store, updateProject],
  );
  const onSettled = useCallback(() => autoRunRef.current(), []);

  const { start, isBusy, job, busy, stalled, error } = useProjectJob({
    type: 'transcribe',
    onDone,
    onSettled,
    failedMessage: "Couldn't generate captions.",
  });

  const generate = useCallback(() => {
    const { project } = store.getState();
    if (!project.voiceover) return;
    attempted.add(project.voiceover.src);
    setAligned(null);
    void start({
      type: 'transcribe',
      projectId,
      input: { audioPath: project.voiceover.src, script: project.script },
    });
  }, [store, start, projectId, attempted]);

  /** Captions a voiceover set during this session, if captions are on and it isn't done yet. */
  const autoRun = useCallback(() => {
    const { project } = store.getState();
    const src = project.voiceover?.src;
    if (!project.captions.enabled || !src || src === project.captions.voiceoverSrc) return;
    if (attempted.has(src) || isBusy()) return; // a busy job re-checks when it settles
    generate();
  }, [store, attempted, isBusy, generate]);

  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);

  // A new voiceover (TTS finished, take accepted, file uploaded) or captions switched on.
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (
          s.project.voiceover?.src !== prev.project.voiceover?.src ||
          s.project.captions.enabled !== prev.project.captions.enabled
        ) {
          autoRun();
        }
      }),
    [store, autoRun],
  );

  const stale = Boolean(voiceoverSrc && wordCount > 0 && captionsSrc !== voiceoverSrc);
  const status = !busy
    ? null
    : stalled
      ? 'Still waiting for the worker. Is it running?'
      : job?.status === 'running'
        ? 'Generating captions…'
        : 'Waiting for the worker…';

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Captions</h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="captions-enabled" className="text-xs text-muted-foreground">
              Show captions
            </Label>
            <Switch
              id="captions-enabled"
              checked={enabled}
              onCheckedChange={(checked) => updateProject((p) => setCaptionsEnabled(p, checked))}
            />
          </div>
        </div>

        {!voiceoverSrc ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Add a voiceover first. Captions are timed to it.
          </p>
        ) : (
          <>
            <Button onClick={generate} disabled={busy} variant={wordCount ? 'outline' : 'default'}>
              {busy ? 'Generating…' : wordCount ? 'Regenerate captions' : 'Generate captions'}
            </Button>
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
            {!busy && stale && (
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                The voiceover changed since these captions were made. Regenerate them to match.
              </p>
            )}
            {!busy && aligned === false && (
              <p className="text-xs text-muted-foreground">
                The audio didn&apos;t match your script, so captions use what was heard.
              </p>
            )}
            {!busy && !error && wordCount === 0 && captionsSrc === voiceoverSrc && (
              <p className="text-xs text-muted-foreground">No speech was found in the voiceover.</p>
            )}
          </>
        )}
      </section>

      {wordCount > 0 && <CaptionWords />}
      <CaptionStyleForm />
    </div>
  );
}
