'use client';

import { createContext, useContext, useState } from 'react';
import { useStore } from 'zustand';
import {
  createEditorStore,
  type EditorInit,
  type EditorState,
  type EditorStore,
} from '@/stores/editor-store';

const EditorStoreContext = createContext<EditorStore | null>(null);

/** Render with `key={projectId}` so switching projects creates a fresh store. */
export function EditorStoreProvider({
  initial,
  children,
}: {
  initial: EditorInit;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createEditorStore(initial));
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
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
