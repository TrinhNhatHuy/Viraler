import type { Clip, MediaItem, Project } from '@viraler/shared';
import { ALL_FORMATS, BlobSource, Input, type VideoSample, VideoSampleSink } from 'mediabunny';
import type { MediaUrlResolver } from '@/lib/media/urls';
import type { Frame, FrameSource } from '@/lib/render/media-pool';
import { clipAt } from '@/lib/timeline/model';
import { clipSourceTimes } from './plan';

export class MediaLoadError extends Error {}

interface OpenVideo {
  input: Input;
  sink: VideoSampleSink;
}

interface ActiveClip {
  clip: Clip;
  iterator: AsyncGenerator<VideoSample | null, void, unknown> | null;
  sample: VideoSample | null;
}

/**
 * Exact frames for the export. Each media file is downloaded whole (a plain
 * CORS GET; Pexels doesn't allow cross-origin range reads) and decoded with
 * WebCodecs via mediabunny. Each clip gets its own decoder iterator, fed exactly
 * the source times of its output frames, so `advance(t)` must be called once
 * per output frame, in order.
 */
export class ExportFrames implements FrameSource {
  private images = new Map<string, ImageBitmap>();
  private videos = new Map<string, OpenVideo>();
  private active: ActiveClip | null = null;

  constructor(
    private readonly project: Project,
    private readonly fps: number,
  ) {}

  /** Downloads and opens every media item used by a clip. */
  async load(
    urls: MediaUrlResolver,
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const byId = new Map(this.project.media.map((m) => [m.id, m]));
    const used = [...new Set(this.project.clips.map((c) => c.mediaId))]
      .map((id) => byId.get(id))
      .filter((m): m is MediaItem => m !== undefined);
    onProgress(0, used.length);
    for (const [i, media] of used.entries()) {
      signal.throwIfAborted();
      const name = media.name ?? `${media.kind} ${i + 1}`;
      const url = await urls.resolve(media.src);
      if (!url) throw new MediaLoadError(`“${name}” is missing (it may have been deleted).`);
      const res = await fetch(url, { signal });
      if (!res.ok) throw new MediaLoadError(`Couldn't download “${name}” (${res.status}).`);
      const blob = await res.blob();
      if (media.kind === 'image') {
        this.images.set(media.id, await createImageBitmap(blob));
      } else if (media.kind === 'video') {
        const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) {
          input.dispose();
          throw new MediaLoadError(`This browser can't decode “${name}”.`);
        }
        this.videos.set(media.id, { input, sink: new VideoSampleSink(track) });
      }
      onProgress(i + 1, used.length);
    }
  }

  /** The opened file of a video media item (reused for its audio). */
  input(mediaId: string): Input | null {
    return this.videos.get(mediaId)?.input ?? null;
  }

  /** Decodes the frame for output time `tMs` (call once per frame, in order). */
  async advance(tMs: number): Promise<void> {
    const clip = clipAt(this.project.clips, tMs)?.clip ?? null;
    if (this.active?.clip.id !== clip?.id) {
      await this.closeActive();
      if (clip) {
        const video = this.videos.get(clip.mediaId);
        this.active = {
          clip,
          iterator: video ? video.sink.samplesAtTimestamps(clipSourceTimes(clip, this.fps)) : null,
          sample: null,
        };
      }
    }
    const active = this.active;
    if (!active?.iterator) return;
    const next = await active.iterator.next();
    // Past the end of the media (null/done): keep showing the last frame.
    if (!next.done && next.value) {
      active.sample?.close();
      active.sample = next.value;
    }
  }

  frame(mediaId: string): Frame {
    const image = this.images.get(mediaId);
    if (image) {
      return {
        width: image.width,
        height: image.height,
        draw: (ctx, x, y, w, h) => ctx.drawImage(image, x, y, w, h),
      };
    }
    const sample = this.active?.clip.mediaId === mediaId ? this.active.sample : null;
    if (!sample) return 'missing';
    return {
      width: sample.displayWidth,
      height: sample.displayHeight,
      // draw() applies the video's rotation metadata (phone videos).
      draw: (ctx, x, y, w, h) => sample.draw(ctx, x, y, w, h),
    };
  }

  async dispose(): Promise<void> {
    await this.closeActive();
    for (const bitmap of this.images.values()) bitmap.close();
    for (const { input } of this.videos.values()) input.dispose();
    this.images.clear();
    this.videos.clear();
  }

  private async closeActive() {
    const active = this.active;
    this.active = null;
    if (!active) return;
    active.sample?.close();
    await active.iterator?.return();
  }
}
