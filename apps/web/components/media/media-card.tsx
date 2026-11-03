'use client';

import type { MediaItem } from '@viraler/shared';
import { cn } from 'cn';
import { ImageIcon, PlusIcon, VideoIcon } from 'lucide-react';
import { useState } from 'react';
import { formatDuration } from '@/lib/script/stats';
import { MEDIA_DRAG_TYPE } from '@/components/timeline/timeline';

/**
 * A media tile: thumbnail, kind, duration and an Add button. Draggable onto
 * the timeline (carries the project MediaItem). Videos with a `previewUrl`
 * play muted on hover.
 */
export function MediaCard(props: {
  item: MediaItem;
  thumbnailUrl: string | null;
  previewUrl?: string;
  title: string;
  footer?: React.ReactNode;
  menu?: React.ReactNode;
  onAdd: () => void;
  adding?: boolean;
  /** Library items can be dragged onto the timeline; search results are saved first. */
  draggable?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const { item } = props;
  return (
    <div
      className="group relative overflow-hidden rounded-lg border bg-muted"
      draggable={props.draggable ?? true}
      onDragStart={(e) => {
        if (props.draggable === false) return;
        e.dataTransfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="relative aspect-[9/16] w-full">
        {hover && props.previewUrl ? (
          <video
            src={props.previewUrl}
            muted
            autoPlay
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : props.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed/CDN URLs, no optimization needed
          <img
            src={props.thumbnailUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            {item.kind === 'video' ? <VideoIcon /> : <ImageIcon />}
          </div>
        )}
        <span className="absolute top-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
          {item.kind === 'video' ? (
            <VideoIcon className="size-3" />
          ) : (
            <ImageIcon className="size-3" />
          )}
          {item.durationMs !== undefined && formatDuration(item.durationMs)}
        </span>
        {props.menu && <div className="absolute top-1 right-1">{props.menu}</div>}
        <button
          type="button"
          onClick={props.onAdd}
          disabled={props.adding}
          aria-label={`Add ${props.title} to the timeline`}
          className={cn(
            'absolute right-1 bottom-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow',
            'opacity-90 transition hover:opacity-100 disabled:opacity-50',
          )}
        >
          <PlusIcon className="size-4" />
        </button>
      </div>
      <div className="grid gap-0.5 px-1.5 py-1">
        <p className="truncate text-xs" title={props.title}>
          {props.title}
        </p>
        {props.footer}
      </div>
    </div>
  );
}
