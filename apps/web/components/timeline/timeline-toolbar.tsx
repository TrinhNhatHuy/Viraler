'use client';

import {
  ScissorsIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
  WandSparklesIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTimecode } from '@/lib/format';
import { clipsEndMs, projectDurationMs } from '@/lib/timeline/model';
import { fitView, PAD_X, zoomAt } from '@/lib/timeline/view';
import {
  useEditorStore,
  useTimeline,
  useTimelineApi,
} from '@/components/editor/editor-store-provider';
import { useTimelineActions } from './use-timeline-actions';

export function TimelineToolbar({ width }: { width: () => number }) {
  const actions = useTimelineActions();
  const timeline = useTimelineApi();
  const selectedId = useTimeline((s) => s.selectedClipId);
  const shortBy = useTimeline((s) => s.fitShortByMs);
  const selected = useEditorStore((s) => s.project.clips.find((c) => c.id === selectedId) ?? null);
  const clipsMs = useEditorStore((s) => clipsEndMs(s.project.clips));
  const voiceoverMs = useEditorStore((s) => s.project.voiceover?.durationMs ?? null);
  const durationMs = useEditorStore((s) => projectDurationMs(s.project));
  const hasClips = clipsMs > 0;

  const zoom = (factor: number) => {
    const w = width();
    const view = timeline.getState().view ?? fitView(durationMs, w);
    timeline.getState().setView(zoomAt(view, factor, PAD_X + (w - PAD_X * 2) / 2));
  };

  const fits = voiceoverMs !== null && hasClips && clipsMs === voiceoverMs;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={actions.split}
        disabled={!hasClips}
        title="Split at playhead (S)"
      >
        <ScissorsIcon /> Split
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={actions.deleteSelected}
        disabled={!selected}
        title="Delete clip (Del)"
      >
        <Trash2Icon /> Delete
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={actions.toggleMute}
        disabled={!selected}
        title="Mute or unmute the clip's own audio (M)"
      >
        {selected && !selected.muted ? <Volume2Icon /> : <VolumeXIcon />}
        {selected && !selected.muted ? 'Sound on' : 'Muted'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={actions.fit}
        disabled={!hasClips || voiceoverMs === null}
        title="Stretch the clips to end with the voiceover"
      >
        <WandSparklesIcon /> Fit to voiceover
      </Button>

      <span className="ml-2 text-xs text-muted-foreground tabular-nums">
        Clips {formatTimecode(clipsMs)}
        {voiceoverMs !== null && <> · Voiceover {formatTimecode(voiceoverMs)}</>}
        {fits && ' ✓'}
      </span>
      {shortBy > 0 && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          {(shortBy / 1000).toFixed(1)} s short: add a clip
        </span>
      )}

      <div className="ml-auto flex items-center">
        <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}>
          <ZoomOutIcon />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => zoom(1.5)}>
          <ZoomInIcon />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => timeline.getState().setView(null)}>
          Fit
        </Button>
      </div>
    </div>
  );
}
