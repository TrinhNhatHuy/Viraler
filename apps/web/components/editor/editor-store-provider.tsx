'use client';

import { createContext, useContext, useState } from 'react';
import { useStore } from 'zustand';
import {
  createEditorStore,
  type EditorInit,
  type EditorState,
  type EditorStore,
} from '@/stores/editor-store';
import {
  createPlaybackStore,
  type PlaybackState,
  type PlaybackStore,
} from '@/stores/playback-store';
import {
  createTimelineStore,
  type TimelineState,
  type TimelineStore,
} from '@/stores/timeline-store';

const EditorStoreContext = createContext<EditorStore | null>(null);
const PlaybackStoreContext = createContext<PlaybackStore | null>(null);
const TimelineStoreContext = createContext<TimelineStore | null>(null);

/** Render with `key={projectId}` so switching projects creates a fresh store. */
export function EditorStoreProvider({
  initial,
  children,
}: {
  initial: EditorInit;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createEditorStore(initial));
  const [playback] = useState(createPlaybackStore);
  const [timeline] = useState(createTimelineStore);
  return (
    <EditorStoreContext.Provider value={store}>
      <PlaybackStoreContext.Provider value={playback}>
        <TimelineStoreContext.Provider value={timeline}>{children}</TimelineStoreContext.Provider>
      </PlaybackStoreContext.Provider>
    </EditorStoreContext.Provider>
  );
}

export function useEditorStoreApi(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditorStore must be used inside <EditorStoreProvider>');
  return store;
}

/** Select a slice of editor state. Return primitives or stable references (zustand v5). */
export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStoreApi(), selector);
}

export function usePlaybackApi(): PlaybackStore {
  const store = useContext(PlaybackStoreContext);
  if (!store) throw new Error('usePlayback must be used inside <EditorStoreProvider>');
  return store;
}

/** Select a slice of playback state (voiceover clock). */
export function usePlayback<T>(selector: (state: PlaybackState) => T): T {
  return useStore(usePlaybackApi(), selector);
}

export function useTimelineApi(): TimelineStore {
  const store = useContext(TimelineStoreContext);
  if (!store) throw new Error('useTimeline must be used inside <EditorStoreProvider>');
  return store;
}

/** Select a slice of timeline UI state (selection, zoom). */
export function useTimeline<T>(selector: (state: TimelineState) => T): T {
  return useStore(useTimelineApi(), selector);
}
