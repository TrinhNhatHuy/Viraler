'use client';

import { useCallback, useMemo } from 'react';
import { captionsStale } from '@/lib/captions/edit';
import { fitToVoiceover } from '@/lib/timeline/fit';
import { deleteClip, mediaById, setClipMuted, splitClip } from '@/lib/timeline/model';
import {
  useEditorStoreApi,
  usePlaybackApi,
  useTimelineApi,
} from '@/components/editor/editor-store-provider';

/** Timeline edits shared by the toolbar and keyboard shortcuts. */
export function useTimelineActions() {
  const store = useEditorStoreApi();
  const playback = usePlaybackApi();
  const timeline = useTimelineApi();

  const selected = useCallback(() => {
    const id = timeline.getState().selectedClipId;
    return store.getState().project.clips.find((c) => c.id === id) ?? null;
  }, [store, timeline]);

  /** Splits the clip under the playhead. Returns false if there's nothing to split. */
  const split = useCallback(() => {
    const t = playback.getState().nowMs();
    const newId = crypto.randomUUID();
    let did = false;
    store.getState().updateProject((p) => {
      const clips = splitClip(p.clips, t, newId);
      if (!clips) return p;
      did = true;
      return { ...p, clips };
    });
    if (did) timeline.getState().select(newId);
    return did;
  }, [store, playback, timeline]);

  const deleteSelected = useCallback(() => {
    const clip = selected();
    if (!clip) return;
    store.getState().updateProject((p) => ({ ...p, clips: deleteClip(p.clips, clip.id) }));
    timeline.getState().select(null);
  }, [store, timeline, selected]);

  const toggleMute = useCallback(() => {
    const clip = selected();
    if (!clip) return;
    store
      .getState()
      .updateProject((p) => ({ ...p, clips: setClipMuted(p.clips, clip.id, !clip.muted) }));
  }, [store, selected]);

  const fit = useCallback(() => {
    const { project } = store.getState();
    if (!project.voiceover) return;
    // Snap cuts to word gaps only if the captions match this voiceover.
    const words = captionsStale(project) ? [] : project.captions.words;
    const { clips, shortByMs } = fitToVoiceover(
      project.clips,
      mediaById(project.media),
      project.voiceover.durationMs,
      words,
    );
    store.getState().updateProject((p) => ({ ...p, clips }));
    timeline.getState().setFitShortBy(shortByMs);
  }, [store, timeline]);

  return useMemo(
    () => ({ split, deleteSelected, toggleMute, fit }),
    [split, deleteSelected, toggleMute, fit],
  );
}
