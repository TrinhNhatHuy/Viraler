'use client';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@viraler/shared';
import { useEffect, useRef } from 'react';
import { ensureFont } from '@/lib/render/fonts';
import { Renderer } from '@/lib/render/renderer';
import { useEditorStoreApi, usePlaybackApi } from './editor-store-provider';

/**
 * Live preview: draws the project with lib/render at the playback time. Redraws
 * every animation frame while playing, otherwise only when something changes.
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

    const draw = () => {
      frame = 0;
      renderer.render(ctx, store.getState().project, playback.getState().nowMs());
      if (playback.getState().playing) frame = requestAnimationFrame(draw);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

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
