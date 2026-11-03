'use client';

import { useRef } from 'react';
import { Timeline } from './timeline';
import { TimelineToolbar } from './timeline-toolbar';

/** The editor footer: toolbar + timeline canvas. */
export function TimelinePanel() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="grid gap-1">
      <TimelineToolbar width={() => ref.current?.clientWidth ?? 800} />
      <Timeline />
    </div>
  );
}
