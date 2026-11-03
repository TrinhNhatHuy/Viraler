import { createStore } from 'zustand/vanilla';
import type { TimelineView } from '@/lib/timeline/view';

/** Timeline UI state (not part of the project): selection and zoom/scroll. */
export interface TimelineState {
  selectedClipId: string | null;
  /** null = zoom to fit the whole project (until the user zooms or scrolls). */
  view: TimelineView | null;
  /** Shortfall reported by the last "fit to voiceover" (ms). */
  fitShortByMs: number;
  select(id: string | null): void;
  setView(view: TimelineView | null): void;
  setFitShortBy(ms: number): void;
}

export function createTimelineStore() {
  return createStore<TimelineState>()((set) => ({
    selectedClipId: null,
    view: null,
    fitShortByMs: 0,
    select: (selectedClipId) => set({ selectedClipId }),
    setView: (view) => set({ view }),
    setFitShortBy: (fitShortByMs) => set({ fitShortByMs }),
  }));
}

export type TimelineStore = ReturnType<typeof createTimelineStore>;
