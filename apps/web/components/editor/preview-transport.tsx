'use client';

import { PauseIcon, PlayIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatDuration } from '@/lib/script/stats';
import { useEditorStore, usePlayback, usePlaybackApi } from './editor-store-provider';

/** Elements where Space has its own meaning (typing, pressing, sliding). */
const SPACE_TARGETS =
  'input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="tab"], [role="switch"], [role="option"], [role="menuitem"]';

function isSpaceTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SPACE_TARGETS) !== null;
}

/** Play/pause, scrubber and time under the preview. Space toggles playback. */
export function PreviewTransport() {
  const durationMs = useEditorStore((s) => s.project.voiceover?.durationMs ?? 0);
  const hasVoiceover = useEditorStore((s) => Boolean(s.project.voiceover));
  const playback = usePlaybackApi();
  const playing = usePlayback((s) => s.playing);
  const positionMs = usePlayback((s) => s.positionMs);
  const status = usePlayback((s) => s.status);
  const disabled = !hasVoiceover || status === 'empty' || status === 'error';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isSpaceTarget(e.target)) return;
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
