'use client';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@viraler/shared';

/**
 * Approximate areas TikTok / Reels / Shorts cover with their own UI: the top
 * bar, the action buttons on the right and the caption/username block at the
 * bottom. Drawn over the preview canvas (not on it), so it never reaches the export.
 */
const ZONES = [
  { label: 'Top bar', x: 0, y: 0, w: CANVAS_WIDTH, h: 150 },
  { label: 'Buttons', x: 920, y: 640, w: 160, h: 860 },
  { label: 'Caption & username', x: 0, y: 1500, w: 920, h: 420 },
];
const SAFE_MARGIN = Math.round(CANVAS_WIDTH * 0.08); // the 84% text safe width

export function SafeAreaGuides() {
  return (
    <svg
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {ZONES.map((z) => (
        <g key={z.label}>
          <rect
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            fill="rgba(239, 68, 68, 0.18)"
            stroke="rgba(239, 68, 68, 0.8)"
            strokeWidth={4}
            strokeDasharray="16 12"
          />
          <text
            x={z.x + 24}
            y={z.y + 56}
            fill="rgba(255, 255, 255, 0.85)"
            fontSize={40}
            fontWeight={600}
          >
            {z.label}
          </text>
        </g>
      ))}
      <rect
        x={SAFE_MARGIN}
        y={150}
        width={CANVAS_WIDTH - SAFE_MARGIN * 2}
        height={1350}
        fill="none"
        stroke="rgba(255, 255, 255, 0.6)"
        strokeWidth={3}
        strokeDasharray="8 10"
      />
    </svg>
  );
}
