import { isExternalSrc, MEDIA_BUCKET } from '@viraler/shared';
import { createClient } from '@/lib/supabase/client';

const TTL_S = 3600;
/** Re-sign this long before a signed URL expires. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Turns media `src` values into loadable URLs: stock URLs pass through, Storage
 * paths get signed URLs. Requests made in the same tick are signed together.
 */
export class MediaUrlResolver {
  private cache = new Map<string, { url: string; expires: number }>();
  private pending = new Map<string, Promise<string | null>>();
  private batch: { path: string; resolve: (url: string | null) => void }[] = [];

  resolve(src: string): Promise<string | null> {
    if (isExternalSrc(src)) return Promise.resolve(src);
    const hit = this.cache.get(src);
    if (hit && hit.expires - REFRESH_MARGIN_MS > Date.now()) return Promise.resolve(hit.url);
    let p = this.pending.get(src);
    if (!p) {
      p = new Promise((resolve) => {
        this.batch.push({ path: src, resolve });
        if (this.batch.length === 1) queueMicrotask(() => void this.flush());
      });
      this.pending.set(src, p);
    }
    return p;
  }

  /** Forget a URL (e.g. it failed to load) so the next resolve re-signs it. */
  invalidate(src: string): void {
    this.cache.delete(src);
  }

  private async flush() {
    const batch = this.batch;
    this.batch = [];
    const paths = [...new Set(batch.map((b) => b.path))];
    const { data, error } = await createClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrls(paths, TTL_S);
    const urls = new Map<string, string>();
    if (!error) {
      for (const d of data) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
    }
    const expires = Date.now() + TTL_S * 1000;
    for (const [path, url] of urls) this.cache.set(path, { url, expires });
    for (const b of batch) {
      this.pending.delete(b.path);
      b.resolve(urls.get(b.path) ?? null);
    }
  }
}

let shared: MediaUrlResolver | null = null;

/** One resolver per browser tab, so signed URLs are shared by preview, timeline and library. */
export function mediaUrls(): MediaUrlResolver {
  shared ??= new MediaUrlResolver();
  return shared;
}
