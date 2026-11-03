'use client';

import { useEffect, useRef } from 'react';
import { projectDurationMs } from '@/lib/timeline/model';
import { useEditorStore, usePlaybackApi } from './editor-store-provider';
import { useSignedUrl } from './use-signed-url';

/**
 * The editor's single voiceover <audio> element (hidden). The playback store
 * controls it; mounted once by the editor shell. Also keeps the store's
 * project/voiceover lengths up to date.
 */
export function VoiceoverAudio() {
  const src = useEditorStore((s) => s.project.voiceover?.src ?? null);
  const volume = useEditorStore((s) => s.project.voiceover?.volume ?? 1);
  const durationMs = useEditorStore((s) => projectDurationMs(s.project));
  const voiceoverMs = useEditorStore((s) => s.project.voiceover?.durationMs ?? 0);
  const playback = usePlaybackApi();
  const { url, error, refresh } = useSignedUrl(src);

  useEffect(() => {
    playback.getState().setDurations(durationMs, voiceoverMs);
  }, [playback, durationMs, voiceoverMs]);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Re-sign once per file (the URL may have expired); after that, report the error.
  const retried = useRef<string | null>(null);

  useEffect(() => {
    playback.getState().attach(url ? audioRef.current : null);
    return () => playback.getState().attach(null);
  }, [url, playback]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, url]);

  useEffect(() => {
    if (error) playback.getState().setError();
  }, [error, playback]);

  if (!url) return null;

  const onError = () => {
    if (src && retried.current !== src) {
      retried.current = src;
      refresh();
    } else {
      playback.getState().setError();
    }
  };

  return <audio ref={audioRef} src={url} preload="auto" onError={onError} hidden />;
}
