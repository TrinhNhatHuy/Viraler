'use client';

import type { CreateJobBody, JobType, JobView } from '@viraler/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createJobRequest, fetchRecentJobsRequest } from '@/lib/jobs/client';
import { useEditorStore, useEditorStoreApi } from './editor-store-provider';
import { useJobPolling } from './use-job';

export interface DoneInfo {
  /** True if the job finished while the editor was closed (found on open). */
  resumed: boolean;
}

interface Options {
  type: JobType;
  /** Called once when a job of this type finishes successfully. */
  onDone: (job: JobView, info: DoneInfo) => void;
  /** Called after any job of this hook finishes (done or failed), once `isBusy()` is false. */
  onSettled?: (job: JobView) => void;
  /** Shown when the job fails without an error message. */
  failedMessage: string;
}

/**
 * One job of `type` at a time for the open project: start it, poll it, and on
 * open resume a running one or apply one that finished after the editor loaded.
 */
export function useProjectJob({ type, onDone, onSettled: onAnySettled, failedMessage }: Options) {
  const store = useEditorStoreApi();
  const projectId = useEditorStore((s) => s.id);
  const [jobId, setJobId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronous mirror of `busy` for callbacks that run before React re-renders.
  const busyRef = useRef(false);

  // Latest callbacks without restarting polling/resume when they change.
  const onDoneRef = useRef(onDone);
  const onAnySettledRef = useRef(onAnySettled);
  const failedRef = useRef(failedMessage);
  useEffect(() => {
    onDoneRef.current = onDone;
    onAnySettledRef.current = onAnySettled;
    failedRef.current = failedMessage;
  });

  const onSettled = useCallback((job: JobView) => {
    setJobId(null);
    busyRef.current = false;
    if (job.status === 'done') onDoneRef.current(job, { resumed: false });
    else setError(job.error ?? failedRef.current);
    onAnySettledRef.current?.(job);
  }, []);
  const { job, stalled } = useJobPolling(jobId, onSettled);

  useEffect(() => {
    let cancelled = false;
    void fetchRecentJobsRequest(projectId).then((res) => {
      if (cancelled || !res.ok) return;
      const latest = res.value.jobs.find((j) => j.type === type);
      if (!latest) return;
      if (latest.status === 'queued' || latest.status === 'running') {
        busyRef.current = true;
        setJobId(latest.id);
      } else if (latest.status === 'done') {
        const { loadedUpdatedAt } = store.getState();
        if (loadedUpdatedAt && latest.updatedAt > loadedUpdatedAt) {
          onDoneRef.current(latest, { resumed: true });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, store, type]);

  /** Queues a job. Resolves to false (and sets `error`) if it couldn't be created. */
  const start = useCallback(async (body: CreateJobBody): Promise<boolean> => {
    busyRef.current = true;
    setError(null);
    setCreating(true);
    const res = await createJobRequest(body);
    setCreating(false);
    if (res.ok) {
      setJobId(res.value.id);
    } else {
      busyRef.current = false;
      setError(res.message);
    }
    return res.ok;
  }, []);

  const isBusy = useCallback(() => busyRef.current, []);

  return {
    start,
    isBusy,
    job,
    /** Creating or waiting for a job. */
    busy: creating || jobId !== null,
    stalled,
    error,
  };
}
