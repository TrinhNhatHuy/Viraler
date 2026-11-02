'use client';

import { useEditorStore } from './editor-store-provider';

/** Stand-in for the canvas renderer (Phase 6, lib/render/). Shows the 9:16 frame and canvas settings. */
export function PreviewPlaceholder() {
  const background = useEditorStore((s) => s.project.canvas.background);
  const fit = useEditorStore((s) => s.project.canvas.fit);
  return (
    <div
      className="relative aspect-[9/16] h-full max-h-full overflow-hidden rounded-lg shadow-lg ring-1 ring-border"
      style={{ backgroundColor: background }}
      aria-label="Video preview"
    >
      <div className="absolute inset-x-0 bottom-3 text-center">
        <span className="rounded bg-black/60 px-2 py-1 text-xs text-white">
          1080×1920 · {fit === 'fill' ? 'Fill' : 'Fit'} · preview in Phase 6
        </span>
      </div>
    </div>
  );
}
