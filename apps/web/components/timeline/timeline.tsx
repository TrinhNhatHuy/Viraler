'use client';

import { type CaptionWord, type Clip, MediaItem } from '@viraler/shared';
import { useCallback, useEffect, useRef } from 'react';
import { captionsStale } from '@/lib/captions/edit';
import { isTypingTarget } from '@/lib/keyboard';
import { setWordEdge } from '@/lib/timeline/caption-timing';
import { DEFAULT_PALETTE, type DragPreview, drawTimeline } from '@/lib/timeline/draw';
import {
  addMediaClip,
  insertionIndexAt,
  mediaById,
  moveClip,
  projectDurationMs,
  resizeClip,
} from '@/lib/timeline/model';
import {
  clampScroll,
  fitView,
  hitTest,
  layoutFor,
  msToX,
  snapMs,
  type TimelineView,
  xToMs,
  zoomAt,
} from '@/lib/timeline/view';
import {
  useEditorStore,
  useEditorStoreApi,
  usePlaybackApi,
  useTimelineApi,
} from '@/components/editor/editor-store-provider';
import { usePeaks } from './use-peaks';
import { useThumbnails } from './use-thumbnails';
import { useTimelineActions } from './use-timeline-actions';

/** Data type for media dragged from the library onto the timeline. */
export const MEDIA_DRAG_TYPE = 'application/x-viraler-media';

/** Pointer travel (px) before a press on a clip becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

type Drag =
  | { kind: 'scrub' }
  | { kind: 'press'; index: number; startX: number }
  | { kind: 'move'; index: number; x: number; insertAt: number }
  | { kind: 'resize'; clipId: string; edge: 'start' | 'end'; startX: number; original: Clip[] }
  | { kind: 'word'; index: number; edge: 'start' | 'end'; original: CaptionWord[] };

export function Timeline() {
  const store = useEditorStoreApi();
  const playback = usePlaybackApi();
  const timeline = useTimelineApi();
  const actions = useTimelineActions();
  const media = useEditorStore((s) => s.project.media);
  const voiceoverSrc = useEditorStore((s) => s.project.voiceover?.src ?? null);
  const peaks = usePeaks(voiceoverSrc);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const widthRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const dropRef = useRef<DragPreview | null>(null);
  const peaksRef = useRef(peaks);
  const frameRef = useRef(0);
  const scheduleRef = useRef<() => void>(() => {});

  const schedule = useCallback(() => scheduleRef.current(), []);
  const thumb = useThumbnails(media, schedule);

  useEffect(() => {
    peaksRef.current = peaks;
    schedule();
  }, [peaks, schedule]);

  /** The view in use: the user's zoom/scroll, or "fit everything". */
  const currentView = useCallback((): TimelineView => {
    const width = widthRef.current;
    const duration = projectDurationMs(store.getState().project);
    const view = timeline.getState().view;
    return view ? clampScroll(view, duration, width) : fitView(duration, width);
  }, [store, timeline]);

  // --- drawing --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !container || !ctx) return;

    const draw = () => {
      frameRef.current = 0;
      const width = widthRef.current;
      if (width <= 0) return;
      const { project } = store.getState();
      const { playing } = playback.getState();
      const playheadMs = playback.getState().nowMs();
      const layout = layoutFor(width);
      let view = currentView();

      // Keep the playhead in sight while playing (zoomed in).
      if (playing && timeline.getState().view) {
        const x = msToX(playheadMs, view);
        if (x > width - 40 || x < 0) {
          view = { ...view, scrollMs: Math.max(0, playheadMs - 1000) };
          timeline.getState().setView(view);
        }
      }

      const dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(width * dpr) ||
        canvas.height !== Math.round(layout.height * dpr)
      ) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(layout.height * dpr);
        canvas.style.height = `${layout.height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const drag = dragRef.current;
      drawTimeline(ctx, {
        width,
        view,
        layout,
        clips: project.clips,
        media: mediaById(project.media),
        words: project.captions.words,
        captionsStale: captionsStale(project),
        voiceoverMs: project.voiceover?.durationMs ?? 0,
        peaks: peaksRef.current,
        playheadMs,
        selectedClipId: timeline.getState().selectedClipId,
        thumb,
        drag:
          drag?.kind === 'move'
            ? { kind: 'move', index: drag.index, x: drag.x, insertAt: drag.insertAt }
            : dropRef.current,
        palette: {
          ...DEFAULT_PALETTE,
          fg: getComputedStyle(container).color || DEFAULT_PALETTE.fg,
        },
      });
      if (playing && !frameRef.current) frameRef.current = requestAnimationFrame(draw);
    };
    scheduleRef.current = () => {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
    };

    const resize = new ResizeObserver(([entry]) => {
      widthRef.current = entry?.contentRect.width ?? 0;
      schedule();
    });
    resize.observe(container);
    const unsubscribe = [
      store.subscribe((s, prev) => {
        if (s.project !== prev.project) schedule();
      }),
      playback.subscribe(schedule),
      timeline.subscribe(schedule),
    ];
    schedule();
    return () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      resize.disconnect();
      for (const off of unsubscribe) off();
    };
  }, [store, playback, timeline, currentView, schedule, thumb]);

  // --- pointer --------------------------------------------------------------
  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const seekToX = (x: number) => playback.getState().seek(Math.max(0, xToMs(x, currentView())));

  /** Times an edge may snap to: playhead, voiceover end, caption word edges. */
  const snapTargets = () => {
    const { project } = store.getState();
    const targets = [playback.getState().nowMs()];
    if (project.voiceover) targets.push(project.voiceover.durationMs);
    for (const w of project.captions.words) targets.push(w.startMs, w.endMs);
    return targets;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { x, y } = local(e);
    const view = currentView();
    const { project } = store.getState();
    const words = project.captions.enabled ? project.captions.words : [];
    const hit = hitTest(x, y, view, layoutFor(widthRef.current), project.clips, words);
    e.currentTarget.setPointerCapture(e.pointerId);

    switch (hit.type) {
      case 'ruler':
      case 'track':
        if (hit.type === 'track') timeline.getState().select(null);
        dragRef.current = { kind: 'scrub' };
        seekToX(x);
        break;
      case 'clip':
        timeline.getState().select(project.clips[hit.index]!.id);
        dragRef.current = { kind: 'press', index: hit.index, startX: x };
        break;
      case 'clip-start':
      case 'clip-end':
        timeline.getState().select(project.clips[hit.index]!.id);
        store.getState().beginGesture();
        dragRef.current = {
          kind: 'resize',
          clipId: project.clips[hit.index]!.id,
          edge: hit.type === 'clip-start' ? 'start' : 'end',
          startX: x,
          original: project.clips,
        };
        break;
      case 'word':
        playback.getState().seek(words[hit.index]!.startMs);
        break;
      case 'word-start':
      case 'word-end':
        store.getState().beginGesture();
        dragRef.current = {
          kind: 'word',
          index: hit.index,
          edge: hit.type === 'word-start' ? 'start' : 'end',
          original: project.captions.words,
        };
        break;
    }
    schedule();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e);
    const drag = dragRef.current;
    const view = currentView();
    const { project } = store.getState();

    if (!drag) {
      const words = project.captions.enabled ? project.captions.words : [];
      const hit = hitTest(x, y, view, layoutFor(widthRef.current), project.clips, words);
      e.currentTarget.style.cursor =
        hit.type.endsWith('-start') || hit.type.endsWith('-end')
          ? 'ew-resize'
          : hit.type === 'clip'
            ? 'grab'
            : 'default';
      return;
    }

    switch (drag.kind) {
      case 'scrub':
        seekToX(x);
        break;
      case 'press':
        if (Math.abs(x - drag.startX) > DRAG_THRESHOLD_PX) {
          dragRef.current = { kind: 'move', index: drag.index, x, insertAt: drag.index };
          e.currentTarget.style.cursor = 'grabbing';
        }
        break;
      case 'move':
        dragRef.current = { ...drag, x, insertAt: insertionIndexAt(project.clips, xToMs(x, view)) };
        schedule();
        break;
      case 'resize': {
        const clip = drag.original.find((c) => c.id === drag.clipId)!;
        const edgeMs = drag.edge === 'end' ? clip.startMs + clip.durationMs : clip.startMs;
        const raw = edgeMs + (x - drag.startX) / view.pxPerMs;
        const delta = (drag.edge === 'end' ? snapMs(raw, snapTargets(), view) : raw) - edgeMs;
        const m = project.media.find((item) => item.id === clip.mediaId);
        store.getState().updateProject((p) => ({
          ...p,
          clips: resizeClip(drag.original, drag.clipId, drag.edge, delta, m),
        }));
        break;
      }
      case 'word': {
        const ms = snapMs(xToMs(x, view), [playback.getState().nowMs()], view);
        const max = project.voiceover?.durationMs;
        store.getState().updateProject((p) => ({
          ...p,
          captions: {
            ...p.captions,
            words: setWordEdge(drag.original, drag.index, drag.edge, ms, max),
          },
        }));
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    e.currentTarget.style.cursor = 'default';
    if (!drag) return;
    if (drag.kind === 'press') {
      seekToX(local(e).x); // a click on a clip also moves the playhead there
    } else if (drag.kind === 'move') {
      // insertAt counts positions in the full list; moveClip wants the final index.
      const to = drag.insertAt > drag.index ? drag.insertAt - 1 : drag.insertAt;
      if (to !== drag.index) {
        store.getState().updateProject((p) => ({ ...p, clips: moveClip(p.clips, drag.index, to) }));
      }
    } else if (drag.kind === 'resize' || drag.kind === 'word') {
      store.getState().endGesture();
    }
    schedule();
  };

  // --- wheel: scroll, Ctrl/Cmd+wheel zooms (non-passive to stop page scroll) --
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const view = currentView();
      const duration = projectDurationMs(store.getState().project);
      if (e.ctrlKey || e.metaKey) {
        const x = e.clientX - canvas.getBoundingClientRect().left;
        timeline.getState().setView(zoomAt(view, Math.exp(-e.deltaY * 0.002), x));
      } else {
        const delta =
          (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / view.pxPerMs;
        timeline
          .getState()
          .setView(
            clampScroll({ ...view, scrollMs: view.scrollMs + delta }, duration, widthRef.current),
          );
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [store, timeline, currentView]);

  // --- keyboard shortcuts -----------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        actions.split();
      } else if (key === 'delete' || key === 'backspace') {
        if (!timeline.getState().selectedClipId) return;
        e.preventDefault();
        actions.deleteSelected();
      } else if (key === 'm') {
        e.preventDefault();
        actions.toggleMute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, timeline]);

  // --- drop from the media library ---------------------------------------------
  const dropIndex = (e: React.DragEvent) =>
    insertionIndexAt(store.getState().project.clips, xToMs(local(e).x, currentView()));

  const onDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (!e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropRef.current = { kind: 'drop', insertAt: dropIndex(e) };
    schedule();
  };

  const onDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    const parsed = MediaItem.safeParse(safeJson(e.dataTransfer.getData(MEDIA_DRAG_TYPE)));
    const at = dropIndex(e);
    dropRef.current = null;
    schedule();
    if (!parsed.success) return;
    e.preventDefault();
    const clipId = crypto.randomUUID();
    store.getState().updateProject((p) => addMediaClip(p, parsed.data, at, clipId));
    timeline.getState().select(clipId);
  };

  return (
    <div ref={containerRef} className="w-full text-foreground select-none">
      <canvas
        ref={canvasRef}
        className="block w-full touch-none"
        aria-label="Timeline"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={onDragOver}
        onDragLeave={() => {
          dropRef.current = null;
          schedule();
        }}
        onDrop={onDrop}
      />
    </div>
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
