'use client';

import { PauseIcon, PlayIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { isInteractiveTarget } from '@/lib/keyboard';
import { formatDuration } from '@/lib/script/stats';
import { usePlayback, usePlaybackApi } from './editor-store-provider';

/** Play/pause, scrubber and time under the preview. Space toggles playback. */
export function PreviewTransport() {
  const playback = usePlaybackApi();
  const durationMs = usePlayback((s) => s.durationMs);
  const playing = usePlayback((s) => s.playing);
  const positionMs = usePlayback((s) => s.positionMs);
  const disabled = durationMs <= 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isInteractiveTarget(e.target)) return;
      e.preventDefault();
      playback.getState().toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback]);

  return (
    <div className="flex w-full max-w-md items-center gap-3">
      <Button
        size="icon"
        variant="secondary"
        onClick={() => playback.getState().toggle()}
        disabled={disabled}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <Slider
        aria-label="Playback position"
        min={0}
        max={Math.max(durationMs, 1)}
        step={10}
        value={Math.min(positionMs, durationMs)}
        disabled={disabled}
        onValueChange={(v) => playback.getState().seek(typeof v === 'number' ? v : (v[0] ?? 0))}
        className="flex-1"
      />
      <span className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {formatDuration(positionMs)} / {formatDuration(durationMs)}
      </span>
    </div>
  );
}
