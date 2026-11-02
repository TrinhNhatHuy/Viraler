'use client';

import { UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { getAudioDurationMs } from '@/lib/audio/duration';
import { ACCEPTED_AUDIO, checkAudioFile, MAX_AUDIO_DURATION_MS } from '@/lib/audio/limits';
import { uploadVoiceover } from '@/lib/audio/upload-voiceover';
import { cn } from '@/lib/utils';
import { useEditorStore } from './editor-store-provider';
import { withVoiceover } from './voiceover-actions';

export function AudioUpload() {
  const userId = useEditorStore((s) => s.userId);
  const projectId = useEditorStore((s) => s.id);
  const updateProject = useEditorStore((s) => s.updateProject);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    const check = checkAudioFile(file);
    if (!check.ok) return setError(check.message);

    setBusy(true);
    try {
      let durationMs: number;
      try {
        durationMs = await getAudioDurationMs(file);
      } catch {
        return setError("Couldn't read this audio file. It may be corrupt or unsupported.");
      }
      if (durationMs > MAX_AUDIO_DURATION_MS) return setError('Audio is longer than 10 minutes.');
      if (durationMs === 0) return setError('Audio is empty.');

      const res = await uploadVoiceover({ userId, projectId, blob: file, kind: 'uploaded' });
      if (!res.ok) return setError(res.message);
      updateProject((p) => withVoiceover(p, { src: res.path, durationMs, source: 'uploaded' }));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="grid gap-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !busy) void handleFile(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50',
          dragging && 'border-foreground bg-muted',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <UploadIcon className="size-5" />
        <span>{busy ? 'Uploading…' : 'Drop an audio file or click to choose'}</span>
        <span className="text-xs">MP3, M4A, WAV, WebM, OGG, FLAC · max 25 MB, 10 min</span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_AUDIO}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
