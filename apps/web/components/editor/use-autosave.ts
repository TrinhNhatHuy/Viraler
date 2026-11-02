'use client';

import { useCallback, useEffect, useRef } from 'react';
import { saveProjectRequest } from '@/lib/projects/client';
import { isDirty, snapshotToBody } from '@/stores/editor-store';
import { useEditorStoreApi } from './editor-store-provider';

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/**
 * Autosaves the open project:
 * - `delayMs` after the last edit, with at most one request in flight
 * - Ctrl/Cmd+S saves immediately
 * - warns before unload while dirty; flushes with keepalive when the tab is hidden
 * - retries failed saves with backoff; stops on conflict until the user resolves it
 *
 * Returns `saveNow()`, which resolves once the store has nothing left to save
 * (or a save failed / conflicted).
 */
export function useAutosave(delayMs = 1500): { saveNow: () => Promise<void> } {
  const store = useEditorStoreApi();
  const saveRef = useRef<(opts?: { keepalive?: boolean }) => Promise<void>>(async () => {});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: Promise<void> | null = null;
    let retryMs = RETRY_MIN_MS;
    let disposed = false;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void save(), ms);
    };

    const save = async (opts: { keepalive?: boolean } = {}): Promise<void> => {
      clearTimeout(timer);
      if (inFlight) {
        await inFlight;
        return save(opts); // edits may have arrived meanwhile
      }
      const state = store.getState();
      const snapshot = state.beginSave();
      if (!snapshot) return;

      inFlight = (async () => {
        const res = await saveProjectRequest(state.id, snapshotToBody(snapshot), opts);
        const s = store.getState();
        if (res.ok) {
          s.saveSucceeded(snapshot, res.value.revision);
          retryMs = RETRY_MIN_MS;
        } else if (res.kind === 'conflict') {
          s.saveConflicted(res.revision);
        } else {
          s.saveFailed(res.message);
          if (!disposed && res.kind === 'error') {
            schedule(retryMs);
            retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
          }
        }
      })();

      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
      const after = store.getState();
      if (!disposed && after.saveStatus === 'idle' && isDirty(after)) schedule(delayMs);
    };
    saveRef.current = save;

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.changeSeq !== prev.changeSeq) schedule(delayMs);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty(store.getState())) e.preventDefault();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isDirty(store.getState())) {
        void save({ keepalive: true });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [store, delayMs]);

  const saveNow = useCallback(() => saveRef.current(), []);
  return { saveNow };
}
