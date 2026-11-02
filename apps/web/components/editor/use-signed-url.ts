'use client';

import { MEDIA_BUCKET } from '@viraler/shared';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const EXPIRES_IN_S = 3600;

/** Short-lived URL for a private Storage object. Call `refresh()` when playback fails (expired). */
export function useSignedUrl(path: string | null): {
  url: string | null;
  error: string | null;
  refresh: () => void;
} {
  const [result, setResult] = useState<{
    path: string;
    url: string | null;
    error: string | null;
  }>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    void createClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrl(path, EXPIRES_IN_S)
      .then(({ data, error }) => {
        if (!cancelled) {
          setResult({ path, url: data?.signedUrl ?? null, error: error?.message ?? null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const current = path && result?.path === path ? result : null;
  return { url: current?.url ?? null, error: current?.error ?? null, refresh };
}
