import { createStore } from 'zustand/vanilla';
import type { TimelineView } from '@/lib/timeline/view';

/** Editor UI state (not part of the project): timeline selection and zoom, preview guides. */
export interface TimelineState {
  selectedClipId: string | null;
  /** null = zoom to fit the whole project (until the user zooms or scrolls). */
  view: TimelineView | null;
  /** Shortfall reported by the last "fit to voiceover" (ms). */
  fitShortByMs: number;
  /** Preview overlay showing where platform buttons cover the video (never exported). */
  showGuides: boolean;
  select(id: string | null): void;
  setView(view: TimelineView | null): void;
  setFitShortBy(ms: number): void;
  setShowGuides(show: boolean): void;
}

export function createTimelineStore() {
  return createStore<TimelineState>()((set) => ({
    selectedClipId: null,
    view: null,
    fitShortByMs: 0,
    showGuides: false,
    select: (selectedClipId) => set({ selectedClipId }),
    setView: (view) => set({ view }),
    setFitShortBy: (fitShortByMs) => set({ fitShortByMs }),
    setShowGuides: (showGuides) => set({ showGuides }),
  }));
}

export type TimelineStore = ReturnType<typeof createTimelineStore>;
