'use client';

import type { JobView } from '@viraler/shared';
import { useEffect, useState } from 'react';
import { fetchJobRequest } from '@/lib/jobs/client';

const FAST_MS = 1000;
const SLOW_MS = 2000;
const FAST_PHASE_MS = 10_000;
const STALLED_AFTER_MS = 30_000;

/**
 * Polls a job until it is `done` or `failed`, then calls `onSettled` once.
 * `stalled` = still queued after 30 s (the worker is probably not running).
 */
export function useJobPolling(
  jobId: string | null,
  onSettled: (job: JobView) => void,
): { job: JobView | null; stalled: boolean } {
  const [state, setState] = useState<{ job: JobView | null; stalled: boolean }>({
    job: null,
    stalled: false,
  });

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();

    const tick = async () => {
      const res = await fetchJobRequest(jobId);
      if (cancelled) return;
      const elapsed = Date.now() - started;
      if (res.ok) {
        const job = res.value;
        setState({ job, stalled: job.status === 'queued' && elapsed > STALLED_AFTER_MS });
        if (job.status === 'done' || job.status === 'failed') {
          onSettled(job);
          return;
        }
      } else if (res.kind === 'not_found' || res.kind === 'unauthorized') {
        return; // job deleted (project deleted) or signed out: stop polling
      }
      // Network errors: keep polling.
      timer = setTimeout(tick, elapsed < FAST_PHASE_MS ? FAST_MS : SLOW_MS);
    };
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // onSettled is intentionally not a dependency: polling restarts only for a new job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return jobId && state.job?.id === jobId ? state : { job: null, stalled: false };
}
