'use client';

import { MAX_MEDIA_BYTES, MEDIA_MIME_TYPES, type MediaView } from '@viraler/shared';
import { MoreVerticalIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteMediaRequest, listMediaRequest, toMediaItem, uploadMedia } from '@/lib/media/client';
import { useEditorStore } from '@/components/editor/editor-store-provider';
import { MediaCard } from './media-card';
import { useAddMedia } from './use-add-media';

const ACCEPT = Object.keys(MEDIA_MIME_TYPES).join(',');

interface Upload {
  key: string;
  name: string;
  progress: number;
  error: string | null;
  controller: AbortController;
}

/** The user's library: uploads (with progress) and saved stock items. */
export function LibraryGrid({ refreshKey }: { refreshKey: number }) {
  const userId = useEditorStore((s) => s.userId);
  const addMedia = useAddMedia();
  const [items, setItems] = useState<MediaView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [confirm, setConfirm] = useState<{ item: MediaView; projects: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listMediaRequest().then((res) => {
      if (cancelled) return;
      if (res.ok) setItems(res.value.media);
      else setError(res.message);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const patchUpload = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const upload = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const key = crypto.randomUUID();
        const controller = new AbortController();
        setUploads((list) => [
          ...list,
          { key, name: file.name, progress: 0, error: null, controller },
        ]);
        void uploadMedia(userId, file, {
          signal: controller.signal,
          onProgress: (progress) => patchUpload(key, { progress }),
        }).then((res) => {
          if (res.ok) {
            setUploads((list) => list.filter((u) => u.key !== key));
            setItems((list) => [res.media, ...(list ?? [])]);
          } else {
            patchUpload(key, { error: res.message });
          }
        });
      }
    },
    [userId],
  );

  const remove = async (item: MediaView, force: boolean) => {
    const res = await deleteMediaRequest(item.id, force);
    if (res.ok) {
      setItems((list) => list?.filter((m) => m.id !== item.id) ?? null);
      setConfirm(null);
    } else if ('inUse' in res) {
      setConfirm({ item, projects: res.inUse.map((p) => p.title) });
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="grid gap-3">
      <div
        className={`grid place-items-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm ${
          dragging ? 'border-primary bg-primary/5' : ''
        }`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
      >
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <UploadIcon /> Upload media
        </Button>
        <p className="text-xs text-muted-foreground">
          or drop files here · MP4, WebM, MOV, JPEG, PNG, WebP · up to{' '}
          {MAX_MEDIA_BYTES / 1024 / 1024} MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {uploads.map((u) => (
        <div key={u.key} className="grid gap-1 rounded-md border p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{u.name}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={u.error ? 'Dismiss' : 'Cancel upload'}
              onClick={() => {
                u.controller.abort();
                setUploads((list) => list.filter((x) => x.key !== u.key));
              }}
            >
              <XIcon />
            </Button>
          </div>
          {u.error ? (
            <p className="text-destructive">{u.error}</p>
          ) : (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${u.progress * 100}%` }}
              />
            </div>
          )}
        </div>
      ))}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {items === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {items?.length === 0 && uploads.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Your library is empty. Upload files or find stock footage in the Stock tab.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {items?.map((m) => (
          <MediaCard
            key={m.id}
            item={toMediaItem(m)}
            thumbnailUrl={m.thumbnailUrl}
            title={m.name}
            onAdd={() => addMedia(toMediaItem(m))}
            footer={
              m.attribution && (
                <a
                  href={m.attribution.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[10px] text-muted-foreground hover:underline"
                >
                  Pexels · {m.attribution.author}
                </a>
              )
            }
            menu={
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="secondary"
                      aria-label={`More actions for ${m.name}`}
                    />
                  }
                >
                  <MoreVerticalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onClick={() => void remove(m, false)}>
                    <Trash2Icon /> Delete from library
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete media that projects use?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirm?.item.name}” is used in {confirm?.projects.join(', ')}. Its clips will show
              as missing media.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirm && void remove(confirm.item, true)}
            >
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
