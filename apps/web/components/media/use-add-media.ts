'use client';

import type { MediaItem } from '@viraler/shared';
import { useCallback } from 'react';
import { addMediaClip } from '@/lib/timeline/model';
import { useEditorStoreApi, useTimelineApi } from '@/components/editor/editor-store-provider';

/** Adds a media item to the project and a clip for it at the end of the timeline. */
export function useAddMedia() {
  const store = useEditorStoreApi();
  const timeline = useTimelineApi();
  return useCallback(
    (item: MediaItem) => {
      const clipId = crypto.randomUUID();
      store.getState().updateProject((p) => addMediaClip(p, item, undefined, clipId));
      timeline.getState().select(clipId);
    },
    [store, timeline],
  );
}
