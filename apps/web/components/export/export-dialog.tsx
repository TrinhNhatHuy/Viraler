'use client';

import { AlertTriangleIcon, CheckCircle2Icon, DownloadIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDuration } from '@/lib/script/stats';
import { projectDurationMs } from '@/lib/timeline/model';
import type { ExportProgress } from '@/lib/export/exporter';
import {
  EXPORT_FPS_OPTIONS,
  type ExportFps,
  exportChecks,
  exportFileName,
} from '@/lib/export/plan';
import { useEditorStore, useEditorStoreApi } from '@/components/editor/editor-store-provider';

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

type State =
  | { kind: 'idle'; notice?: string }
  | { kind: 'running'; progress: ExportProgress; renderStartedAt: number | null; at: number }
  | { kind: 'done'; name: string; url: string | null; bytes: number; elapsedMs: number }
  | { kind: 'error'; message: string };

const FPS_LABELS = Object.fromEntries(EXPORT_FPS_OPTIONS.map((f) => [String(f), `${f} fps`]));

const loadExporter = () => import('@/lib/export/exporter');

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Export to MP4 in the browser. Renders a snapshot of the project taken when it starts. */
export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const store = useEditorStoreApi();
  const project = useEditorStore((s) => s.project);
  const checks = useMemo(() => exportChecks(project), [project]);
  const durationMs = projectDurationMs(project);
  const [fps, setFps] = useState<ExportFps>(30);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const running = state.kind === 'running';

  // Fetch the export code (mediabunny) as soon as the dialog opens.
  useEffect(() => {
    if (open) void loadExporter();
  }, [open]);

  // Leaving the page would kill the export.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  // Free the in-memory file when the dialog closes or a new export starts.
  const url = state.kind === 'done' ? state.url : null;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const start = async () => {
    const { project: snapshot, title } = store.getState();
    const name = exportFileName(title);

    // Chrome/Edge: pick the file first (needs this click), then stream into it.
    let file: FileSystemFileHandle | undefined;
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker })
      .showSaveFilePicker;
    if (picker) {
      try {
        file = await picker({
          suggestedName: name,
          types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // dialog dismissed
        file = undefined; // e.g. blocked: build in memory instead
      }
    }

    const ctrl = new AbortController();
    controller.current = ctrl;
    setState({
      kind: 'running',
      progress: { phase: 'preparing', done: 0, total: 1 },
      renderStartedAt: null,
      at: performance.now(),
    });
    try {
      const { exportVideo } = await loadExporter();
      const result = await exportVideo(snapshot, {
        fps,
        file,
        signal: ctrl.signal,
        // Timestamps are taken here, not while rendering, for the time-left estimate.
        onProgress: (progress) => {
          const at = performance.now();
          setState((s) => ({
            kind: 'running',
            progress,
            at,
            renderStartedAt:
              s.kind === 'running' && s.renderStartedAt !== null
                ? s.renderStartedAt
                : progress.phase === 'rendering'
                  ? at
                  : null,
          }));
        },
      });
      setState({
        kind: 'done',
        name: file?.name ?? name,
        url: result.blob ? URL.createObjectURL(result.blob) : null,
        bytes: result.bytes,
        elapsedMs: result.elapsedMs,
      });
    } catch (e) {
      if (ctrl.signal.aborted) setState({ kind: 'idle', notice: 'Export cancelled.' });
      else setState({ kind: 'error', message: e instanceof Error ? e.message : 'Export failed.' });
    } finally {
      controller.current = null;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && running) return; // cancel first
        if (!next && state.kind !== 'running') setState({ kind: 'idle' });
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!running} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export video</DialogTitle>
          <DialogDescription>
            MP4 · 1080×1920 · {formatDuration(durationMs)} · rendered in your browser
          </DialogDescription>
        </DialogHeader>

        {state.kind === 'idle' || state.kind === 'error' ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="export-fps">Frame rate</Label>
              <Select
                items={FPS_LABELS}
                value={String(fps)}
                onValueChange={(v) => {
                  const n = Number(v);
                  if (n === 30 || n === 60) setFps(n);
                }}
              >
                <SelectTrigger id="export-fps" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FPS_OPTIONS.map((f) => (
                    <SelectItem key={f} value={String(f)}>
                      {f} fps{f === 60 ? ' (smoother, takes twice as long)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {[...checks.errors, ...checks.warnings].map((msg, i) => (
              <p
                key={msg}
                className={
                  i < checks.errors.length
                    ? 'text-sm text-destructive'
                    : 'flex gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100'
                }
                role={i < checks.errors.length ? 'alert' : undefined}
              >
                {i >= checks.errors.length && <AlertTriangleIcon className="size-3.5 shrink-0" />}
                {msg}
              </p>
            ))}
            {state.kind === 'error' && (
              <p className="text-sm text-destructive" role="alert">
                Export failed: {state.message}
              </p>
            )}
            {state.kind === 'idle' && state.notice && (
              <p className="text-sm text-muted-foreground">{state.notice}</p>
            )}
          </div>
        ) : state.kind === 'running' ? (
          <ProgressView state={state} />
        ) : (
          <div className="grid gap-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2Icon className="size-4 text-emerald-600" />
              {state.url ? 'Your video is ready.' : `Saved ${state.name}.`}
            </p>
            <p className="text-muted-foreground">
              {formatBytes(state.bytes)} · took {formatDuration(state.elapsedMs)}
            </p>
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={() => controller.current?.abort()}>
              Cancel
            </Button>
          ) : state.kind === 'done' ? (
            <>
              <Button variant="outline" onClick={() => setState({ kind: 'idle' })}>
                Export again
              </Button>
              {state.url && (
                <Button nativeButton={false} render={<a href={state.url} download={state.name} />}>
                  <DownloadIcon /> Download
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => void start()} disabled={checks.errors.length > 0}>
              Export MP4
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressView({ state }: { state: Extract<State, { kind: 'running' }> }) {
  const { phase, done, total } = state.progress;
  const fraction =
    phase === 'rendering' ? done / Math.max(1, total) : phase === 'finishing' ? 1 : 0;
  let label: string;
  switch (phase) {
    case 'preparing':
      label = 'Preparing…';
      break;
    case 'downloading':
      label = `Downloading media ${Math.min(done + 1, total)} of ${total}…`;
      break;
    case 'audio':
      label = 'Mixing audio…';
      break;
    case 'rendering': {
      const elapsed = state.renderStartedAt !== null ? state.at - state.renderStartedAt : 0;
      const left = done > 0 ? (elapsed / done) * (total - done) : 0;
      label = `Rendering frame ${done} of ${total}${done > 30 ? ` · about ${formatDuration(left)} left` : ''}`;
      break;
    }
    case 'finishing':
      label = 'Finishing the file…';
      break;
  }
  return (
    <div className="grid gap-2" role="status" aria-live="polite">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">{label}</p>
      <p className="text-xs text-muted-foreground">Keep this tab open until it finishes.</p>
    </div>
  );
}
