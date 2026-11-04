'use client';

import { PauseIcon, PlayIcon, ScanIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { isInteractiveTarget } from '@/lib/keyboard';
import { formatDuration } from '@/lib/script/stats';
import { usePlayback, usePlaybackApi, useTimeline, useTimelineApi } from './editor-store-provider';

const GUIDES_KEY = 'viraler:preview-guides';

/** Play/pause, scrubber and time under the preview. Space toggles playback. */
export function PreviewTransport() {
  const playback = usePlaybackApi();
  const durationMs = usePlayback((s) => s.durationMs);
  const playing = usePlayback((s) => s.playing);
  const positionMs = usePlayback((s) => s.positionMs);
  const disabled = durationMs <= 0;

  const timeline = useTimelineApi();
  const showGuides = useTimeline((s) => s.showGuides);
  // Remember the guides toggle per browser (read after mount: no SSR mismatch).
  useEffect(() => {
    try {
      if (localStorage.getItem(GUIDES_KEY) === '1') timeline.getState().setShowGuides(true);
    } catch {
      // storage unavailable: default off
    }
  }, [timeline]);
  const toggleGuides = () => {
    const next = !timeline.getState().showGuides;
    timeline.getState().setShowGuides(next);
    try {
      localStorage.setItem(GUIDES_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
  };

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
      <Button
        size="icon-sm"
        variant={showGuides ? 'secondary' : 'ghost'}
        aria-pressed={showGuides}
        aria-label="Safe-area guides"
        title="Show where TikTok / Reels / Shorts buttons cover the video (preview only)"
        onClick={toggleGuides}
      >
        <ScanIcon />
      </Button>
    </div>
  );
}
