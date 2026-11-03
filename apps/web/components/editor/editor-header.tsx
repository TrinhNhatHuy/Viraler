'use client';

import { ArrowLeftIcon, FilmIcon, Redo2Icon, Undo2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ExportDialog } from '@/components/export/export-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { projectDurationMs } from '@/lib/timeline/model';
import { isDirty } from '@/stores/editor-store';
import { useEditorStore, useEditorStoreApi } from './editor-store-provider';

export function EditorHeader({ saveNow }: { saveNow: () => Promise<void> }) {
  const router = useRouter();
  const store = useEditorStoreApi();
  const title = useEditorStore((s) => s.title);
  const setTitle = useEditorStore((s) => s.setTitle);

  const onBack = async (e: React.MouseEvent) => {
    if (!isDirty(store.getState())) return; // let the Link navigate
    e.preventDefault();
    await saveNow();
    if (!isDirty(store.getState())) router.push('/projects');
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to projects"
        nativeButton={false}
        render={<Link href="/projects" onClick={onBack} />}
      >
        <ArrowLeftIcon />
      </Button>
      <Input
        aria-label="Project title"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (!store.getState().title.trim()) setTitle(store.getState().savedTitle);
        }}
        className="h-9 max-w-sm border-transparent text-base font-medium shadow-none hover:border-input"
      />
      <UndoRedo />
      <div className="ml-auto flex items-center gap-3">
        <SaveStatus onRetry={() => void saveNow()} />
        <ExportButton />
      </div>
    </header>
  );
}

function UndoRedo() {
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={undo}
      >
        <Undo2Icon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={redo}
      >
        <Redo2Icon />
      </Button>
    </div>
  );
}

function SaveStatus({ onRetry }: { onRetry: () => void }) {
  const status = useEditorStore((s) => s.saveStatus);
  const dirty = useEditorStore(isDirty);
  const error = useEditorStore((s) => s.saveError);

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive" role="status">
        <span title={error ?? undefined}>Save failed</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'conflict'
        ? 'Not saved'
        : dirty
          ? 'Unsaved changes'
          : status === 'saved'
            ? 'Saved'
            : '';
  return (
    <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
      {label}
    </span>
  );
}

function ExportButton() {
  const [open, setOpen] = useState(false);
  const hasContent = useEditorStore((s) => projectDurationMs(s.project) > 0);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!hasContent}>
        <FilmIcon /> Export
      </Button>
      <ExportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
