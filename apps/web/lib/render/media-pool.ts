import type { MediaItem } from '@viraler/shared';
import type { MediaUrlResolver } from '@/lib/media/urls';

/** A drawable frame for a media item, or why there isn't one. */
export type Frame =
  { image: CanvasImageSource; width: number; height: number } | 'loading' | 'missing';

/** What the renderer draws clips from (the preview's pool now, an export decoder later). */
export interface FrameSource {
  frame(mediaId: string): Frame;
}

interface Entry {
  media: MediaItem;
  el: HTMLImageElement | HTMLVideoElement;
  ready: boolean;
  failed: boolean;
  retried: boolean;
  disposed: boolean;
}

/**
 * One <img>/<video> per project media item, for the live preview. Elements are
 * CORS-enabled (`crossOrigin="anonymous"`) so the canvas stays readable for
 * export. Calls `onChange` when something new can be drawn (loaded, seeked).
 */
export class MediaPool implements FrameSource {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly urls: MediaUrlResolver,
    private readonly onChange: () => void,
  ) {}

  /** Creates elements for new media and drops removed ones. */
  sync(media: readonly MediaItem[]): void {
    const wanted = new Map(media.map((m) => [m.id, m]));
    for (const [id, entry] of this.entries) {
      const m = wanted.get(id);
      if (!m || m.src !== entry.media.src) {
        this.release(entry);
        this.entries.delete(id);
      }
    }
    for (const m of media) {
      if (!this.entries.has(m.id) && (m.kind === 'video' || m.kind === 'image')) {
        this.entries.set(m.id, this.create(m));
      }
    }
  }

  frame(mediaId: string): Frame {
    const e = this.entries.get(mediaId);
    if (!e || e.failed) return 'missing';
    if (!e.ready) return 'loading';
    const width = e.el instanceof HTMLVideoElement ? e.el.videoWidth : e.el.naturalWidth;
    const height = e.el instanceof HTMLVideoElement ? e.el.videoHeight : e.el.naturalHeight;
    return { image: e.el, width, height };
  }

  /** Video elements by media id (for playback sync). */
  video(mediaId: string): HTMLVideoElement | null {
    const el = this.entries.get(mediaId)?.el;
    return el instanceof HTMLVideoElement ? el : null;
  }

  videos(): HTMLVideoElement[] {
    return [...this.entries.values()]
      .map((e) => e.el)
      .filter((el): el is HTMLVideoElement => el instanceof HTMLVideoElement);
  }

  dispose(): void {
    for (const e of this.entries.values()) this.release(e);
    this.entries.clear();
  }

  private create(media: MediaItem): Entry {
    const el = media.kind === 'video' ? document.createElement('video') : new Image();
    el.crossOrigin = 'anonymous';
    if (el instanceof HTMLVideoElement) {
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
    }
    const entry: Entry = {
      media,
      el,
      ready: false,
      failed: false,
      retried: false,
      disposed: false,
    };

    const load = () =>
      void this.urls.resolve(media.src).then((url) => {
        if (entry.disposed) return;
        if (!url) {
          entry.failed = true;
          this.onChange();
        } else {
          el.src = url;
        }
      });

    el.addEventListener(el instanceof HTMLVideoElement ? 'loadeddata' : 'load', () => {
      entry.ready = true;
      this.onChange();
    });
    if (el instanceof HTMLVideoElement) el.addEventListener('seeked', () => this.onChange());
    el.addEventListener('error', () => {
      if (entry.disposed) return;
      // A signed URL may have expired: re-sign once, then give up.
      if (!entry.retried) {
        entry.retried = true;
        this.urls.invalidate(media.src);
        load();
      } else {
        entry.failed = true;
        this.onChange();
      }
    });
    load();
    return entry;
  }

  private release(entry: Entry): void {
    entry.disposed = true;
    if (entry.el instanceof HTMLVideoElement) {
      entry.el.pause();
      entry.el.removeAttribute('src');
      entry.el.load(); // frees the decoder
    }
  }
}
