'use client';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@viraler/shared';
import { useEffect, useRef } from 'react';
import { mediaUrls } from '@/lib/media/urls';
import { ensureFont } from '@/lib/render/fonts';
import { MediaPool } from '@/lib/render/media-pool';
import { Renderer } from '@/lib/render/renderer';
import { syncVideos } from '@/lib/render/video-sync';
import { useEditorStoreApi, usePlaybackApi } from './editor-store-provider';

/**
 * Live preview: draws the project with lib/render at the playback time. Redraws
 * every animation frame while playing, otherwise only when something changes
 * (edits, seeks, a video frame arriving).
 */
export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useEditorStoreApi();
  const playback = usePlaybackApi();

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const renderer = new Renderer();
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const pool = new MediaPool(mediaUrls(), schedule);
    pool.sync(store.getState().project.media);

    function draw() {
      frame = 0;
      const { project } = store.getState();
      const { playing } = playback.getState();
      const t = playback.getState().nowMs();
      syncVideos(pool, project.clips, t, playing);
      renderer.render(ctx!, project, t, pool);
      if (playing && !frame) frame = requestAnimationFrame(draw);
    }

    // Redraw with the real font once it has loaded (text widths change).
    let fontKey = '';
    const loadFont = () => {
      const { style } = store.getState().project.captions;
      const key = `${style.fontFamily}/${style.fontSizePx}`;
      if (key === fontKey) return;
      fontKey = key;
      void ensureFont(style).then(() => {
        renderer.invalidateText();
        schedule();
      });
    };

    const unsubscribe = [
      store.subscribe((s, prev) => {
        if (s.project !== prev.project) {
          if (s.project.media !== prev.project.media) pool.sync(s.project.media);
          loadFont();
          schedule();
        }
      }),
      playback.subscribe(schedule),
    ];
    loadFont();
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      for (const off of unsubscribe) off();
      pool.dispose();
    };
  }, [store, playback]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="aspect-[9/16] h-full max-h-full max-w-full rounded-lg shadow-lg ring-1 ring-border"
      aria-label="Video preview"
    />
  );
}
