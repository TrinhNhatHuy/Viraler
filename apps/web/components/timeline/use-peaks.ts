'use client';

import { useEffect, useState } from 'react';
import { useSignedUrl } from '@/components/editor/use-signed-url';
import { loadPeaks } from '@/lib/timeline/waveform';

/** Waveform peaks of the voiceover at `src` (null while loading or if decoding fails). */
export function usePeaks(src: string | null): Float32Array | null {
  const { url } = useSignedUrl(src);
  const [result, setResult] = useState<{ src: string; peaks: Float32Array | null } | null>(null);

  useEffect(() => {
    if (!src || !url) return;
    let cancelled = false;
    void loadPeaks(src, url).then((peaks) => {
      if (!cancelled) setResult({ src, peaks });
    });
    return () => {
      cancelled = true;
    };
  }, [src, url]);

  return result && result.src === src ? result.peaks : null;
}
