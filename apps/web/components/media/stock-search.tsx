'use client';

import { type JobView, type StockItem, StockSearchOutput } from '@viraler/shared';
import { cn } from 'cn';
import { SearchIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createJobRequest } from '@/lib/jobs/client';
import { createMediaRequest, toMediaItem } from '@/lib/media/client';
import { useEditorStore } from '@/components/editor/editor-store-provider';
import { useJobPolling } from '@/components/editor/use-job';
import { MediaCard } from './media-card';
import { useAddMedia } from './use-add-media';

type Kind = StockItem['kind'];

interface Results {
  key: string;
  items: StockItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

const keyOf = (kind: unknown, query: unknown) => `${String(kind)}:${String(query).toLowerCase()}`;

/** Pexels search (runs as a worker job, which holds the API key). */
export function StockSearch({ onSaved }: { onSaved: () => void }) {
  const projectId = useEditorStore((s) => s.id);
  const addMedia = useAddMedia();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('video');
  const [results, setResults] = useState<Results | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const onSettled = useCallback((job: JobView) => {
    setJobId(null);
    if (job.status !== 'done') return setError(job.error ?? 'Search failed.');
    const out = StockSearchOutput.safeParse(job.output);
    if (!out.success) return setError('Unexpected search result.');
    const key = keyOf(job.input.kind, job.input.query);
    setResults((prev) =>
      out.data.page > 1 && prev?.key === key
        ? {
            ...prev,
            items: [...prev.items, ...out.data.items],
            page: out.data.page,
            hasMore: out.data.hasMore,
          }
        : {
            key,
            items: out.data.items,
            page: out.data.page,
            hasMore: out.data.hasMore,
            total: out.data.totalResults,
          },
    );
  }, []);
  const { stalled } = useJobPolling(jobId, onSettled, { fastMs: 250 });

  const search = async (page: number) => {
    const q = query.trim();
    if (!q || jobId) return;
    setError(null);
    if (page === 1) setResults(null);
    const res = await createJobRequest({
      type: 'stock_search',
      projectId,
      input: { query: q, kind, page },
    });
    if (res.ok) setJobId(res.value.id);
    else setError(res.message);
  };

  const add = async (item: StockItem) => {
    setAdding(item.providerId);
    setError(null);
    const res = await createMediaRequest({ origin: 'stock', item });
    setAdding(null);
    if (!res.ok) return setError(res.message);
    addMedia(toMediaItem(res.value));
    onSaved();
  };

  const searching = jobId !== null;

  return (
    <div className="grid gap-3">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(1);
        }}
      >
        <div className="flex gap-1">
          {(['video', 'image'] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={kind === k ? 'secondary' : 'ghost'}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setResults(null);
              }}
            >
              {k === 'video' ? 'Videos' : 'Photos'}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Search stock media"
            placeholder={kind === 'video' ? 'Search videos, e.g. ocean' : 'Search photos, e.g. cat'}
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!query.trim() || searching}
            aria-label="Search"
          >
            <SearchIcon />
          </Button>
        </div>
      </form>

      {searching && (
        <p className="text-sm text-muted-foreground" role="status">
          {stalled ? 'Still waiting for the worker. Is it running?' : 'Searching…'}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {results && results.items.length === 0 && (
        <p className="text-sm text-muted-foreground">No results. Try another search.</p>
      )}

      {results && results.items.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            {results.total.toLocaleString()} results · portrait first
          </p>
          <div className="grid grid-cols-2 gap-2">
            {results.items.map((item) => (
              <MediaCard
                key={`${item.kind}-${item.providerId}`}
                draggable={false}
                item={{
                  id: item.providerId,
                  kind: item.kind,
                  src: item.url,
                  origin: 'stock',
                  ...(item.durationMs !== undefined && { durationMs: item.durationMs }),
                }}
                thumbnailUrl={item.thumbnailUrl}
                previewUrl={item.kind === 'video' ? item.url : undefined}
                title={item.author ? `by ${item.author}` : 'Pexels'}
                adding={adding === item.providerId}
                onAdd={() => void add(item)}
                footer={
                  <a
                    href={item.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[10px] text-muted-foreground hover:underline"
                  >
                    View on Pexels
                  </a>
                }
              />
            ))}
          </div>
          {results.hasMore && (
            <Button
              variant="outline"
              size="sm"
              disabled={searching}
              onClick={() => void search(results.page + 1)}
            >
              Load more
            </Button>
          )}
        </>
      )}

      <p className={cn('text-[11px] text-muted-foreground')}>
        Photos and videos provided by{' '}
        <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">
          Pexels
        </a>
        .
      </p>
    </div>
  );
}
