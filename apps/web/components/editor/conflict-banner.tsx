'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchProjectRequest } from '@/lib/projects/client';
import { useEditorStore, useEditorStoreApi } from './editor-store-provider';

export function ConflictBanner({ saveNow }: { saveNow: () => Promise<void> }) {
  const store = useEditorStoreApi();
  const status = useEditorStore((s) => s.saveStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'conflict') return null;

  const loadServer = async () => {
    const res = await fetchProjectRequest(store.getState().id);
    if (!res.ok) setError(res.message);
    return res.ok ? res.value : null;
  };

  const reload = async () => {
    setBusy(true);
    const server = await loadServer();
    if (server) {
      store.getState().replaceFromServer({
        id: server.id,
        userId: store.getState().userId,
        title: server.title,
        project: server.data,
        revision: server.revision,
      });
    }
    setBusy(false);
  };

  const overwrite = async () => {
    setBusy(true);
    const server = await loadServer();
    if (server) {
      store.getState().overwriteConflict(server.revision);
      await saveNow();
    }
    setBusy(false);
  };

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
    >
      <span className="font-medium">This project was changed in another tab or window.</span>
      <span className="text-muted-foreground">Your latest changes aren&apos;t saved.</span>
      {error && <span className="text-destructive">{error}</span>}
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={reload}>
          Reload (discard mine)
        </Button>
        <Button size="sm" disabled={busy} onClick={overwrite}>
          Overwrite with mine
        </Button>
      </div>
    </div>
  );
}
