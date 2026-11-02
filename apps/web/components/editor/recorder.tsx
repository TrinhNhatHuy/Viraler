'use client';

import { MicIcon, SquareIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAudioDurationMs } from '@/lib/audio/duration';
import { MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_MS } from '@/lib/audio/limits';
import { uploadVoiceover } from '@/lib/audio/upload-voiceover';
import { formatDuration } from '@/lib/script/stats';
import { useEditorStore } from './editor-store-provider';
import { withVoiceover } from './voiceover-actions';

/** Preferred recording formats, best first (Safari only supports audio/mp4). */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

type Phase =
  | { name: 'idle' }
  | { name: 'requesting' }
  | { name: 'recording'; startedAt: number }
  | { name: 'recorded'; blob: Blob; url: string }
  | { name: 'saving'; blob: Blob; url: string };

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  audioCtx: AudioContext;
  raf: number;
  autoStop: ReturnType<typeof setTimeout>;
}

function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "Microphone access is blocked. Allow it in your browser's site settings and try again.";
  }
  if (name === 'NotFoundError') return 'No microphone found.';
  if (name === 'NotReadableError') return 'The microphone is being used by another app.';
  return "Couldn't start recording.";
}

export function Recorder() {
  const userId = useEditorStore((s) => s.userId);
  const projectId = useEditorStore((s) => s.id);
  const updateProject = useEditorStore((s) => s.updateProject);

  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const previewUrl = useRef<string | null>(null);

  const teardown = () => {
    const s = session.current;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    clearTimeout(s.autoStop);
    for (const track of s.stream.getTracks()) track.stop();
    void s.audioCtx.close();
    session.current = null;
  };

  const clearPreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  };

  // Release the mic and blob URL if the editor closes mid-recording.
  useEffect(
    () => () => {
      if (session.current?.recorder.state === 'recording') session.current.recorder.stop();
      teardown();
      clearPreview();
    },
    [],
  );

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return setError("This browser can't record audio.");
    }
    setPhase({ name: 'requesting' });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      setPhase({ name: 'idle' });
      return setError(micErrorMessage(e));
    }

    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      teardown();
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      clearPreview();
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setLevel(0);
      setPhase({ name: 'recorded', blob, url });
    };

    // Input level meter + elapsed time, updated once per animation frame.
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    const frame = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
      setElapsedMs(performance.now() - startedAt);
      if (session.current) session.current.raf = requestAnimationFrame(frame);
    };

    session.current = {
      stream,
      recorder,
      audioCtx,
      raf: 0,
      autoStop: setTimeout(() => recorder.stop(), MAX_AUDIO_DURATION_MS),
    };
    recorder.start(1000);
    session.current.raf = requestAnimationFrame(frame);
    setElapsedMs(0);
    setPhase({ name: 'recording', startedAt });
  };

  const stop = () => {
    if (session.current?.recorder.state === 'recording') session.current.recorder.stop();
  };

  const discard = () => {
    clearPreview();
    setPhase({ name: 'idle' });
  };

  const acceptTake = async () => {
    if (phase.name !== 'recorded') return;
    const { blob, url } = phase;
    setError(null);
    if (blob.size > MAX_AUDIO_BYTES) return setError('Recording is larger than 25 MB.');
    setPhase({ name: 'saving', blob, url });

    let durationMs: number;
    try {
      durationMs = await getAudioDurationMs(blob);
    } catch {
      setPhase({ name: 'recorded', blob, url });
      return setError("Couldn't read the recording. Try recording again.");
    }
    const res = await uploadVoiceover({ userId, projectId, blob, kind: 'recorded' });
    if (!res.ok) {
      setPhase({ name: 'recorded', blob, url });
      return setError(res.message);
    }
    updateProject((p) => withVoiceover(p, { src: res.path, durationMs, source: 'recorded' }));
    discard();
  };

  return (
    <div className="grid gap-3">
      {(phase.name === 'idle' || phase.name === 'requesting') && (
        <Button onClick={start} disabled={phase.name === 'requesting'} variant="outline">
          <MicIcon />
          {phase.name === 'requesting' ? 'Waiting for microphone…' : 'Start recording'}
        </Button>
      )}

      {phase.name === 'recording' && (
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span className="font-mono text-sm tabular-nums" aria-live="off">
              {formatDuration(elapsedMs)} / {formatDuration(MAX_AUDIO_DURATION_MS)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label="Input level">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>
          <Button onClick={stop} variant="destructive">
            <SquareIcon />
            Stop
          </Button>
        </div>
      )}

      {(phase.name === 'recorded' || phase.name === 'saving') && (
        <div className="grid gap-3">
          <audio controls src={phase.url} className="w-full" />
          <div className="flex gap-2">
            <Button onClick={acceptTake} disabled={phase.name === 'saving'} className="flex-1">
              {phase.name === 'saving' ? 'Saving…' : 'Use this take'}
            </Button>
            <Button onClick={discard} disabled={phase.name === 'saving'} variant="outline">
              Discard
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
