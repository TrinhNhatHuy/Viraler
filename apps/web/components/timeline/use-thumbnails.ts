'use client';

import type { MediaItem } from '@viraler/shared';
import { useCallback, useEffect, useRef } from 'react';
import { mediaUrls } from '@/lib/media/urls';

/**
 * Loads a thumbnail image per media item (its `thumbnail`, or the image itself)
 * and calls `onLoad` when one arrives. Returns a lookup for the drawing code.
 */
export function useThumbnails(media: readonly MediaItem[], onLoad: () => void) {
  const images = useRef(new Map<string, { src: string; img: HTMLImageElement }>());
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  useEffect(() => {
    const map = images.current;
    for (const m of media) {
      const src = m.thumbnail ?? (m.kind === 'image' ? m.src : undefined);
      if (!src || map.get(m.id)?.src === src) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => onLoadRef.current();
      map.set(m.id, { src, img });
      void mediaUrls()
        .resolve(src)
        .then((url) => {
          if (url && map.get(m.id)?.img === img) img.src = url;
        });
    }
  }, [media]);

  return useCallback((mediaId: string) => images.current.get(mediaId)?.img ?? null, []);
}
