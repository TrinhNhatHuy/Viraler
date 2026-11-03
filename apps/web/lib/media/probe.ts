import { isMediaMimeType, MAX_MEDIA_BYTES } from '@viraler/shared';

/** What the browser learns about a file before uploading it. */
export interface ProbedMedia {
  kind: 'video' | 'image';
  width: number;
  height: number;
  durationMs?: number;
  /** JPEG, ~320 px on the long side. */
  thumbnail: Blob;
}

export class ProbeError extends Error {}

const THUMB_PX = 320;
const LOAD_TIMEOUT_MS = 20_000;

/**
 * Reads size/duration and makes a thumbnail. Rejects files this browser can't
 * decode (e.g. HEVC .mov in Chrome): the editor and MP4 export decode media in
 * the browser, so such a file would be useless.
 */
export async function probeMediaFile(file: File): Promise<ProbedMedia> {
  if (!isMediaMimeType(file.type)) {
    throw new ProbeError('Unsupported file type. Use MP4, WebM, MOV, JPEG, PNG or WebP.');
  }
  if (file.size > MAX_MEDIA_BYTES) throw new ProbeError('File is larger than 50 MB.');
  if (file.size === 0) throw new ProbeError('File is empty.');
  return file.type.startsWith('image/') ? probeImage(file) : probeVideo(file);
}

async function probeImage(file: File): Promise<ProbedMedia> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ProbeError("Couldn't read this image.");
  }
  try {
    return {
      kind: 'image',
      width: bitmap.width,
      height: bitmap.height,
      thumbnail: await thumbnailOf(bitmap, bitmap.width, bitmap.height),
    };
  } finally {
    bitmap.close();
  }
}

async function probeVideo(file: File): Promise<ProbedMedia> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const unsupported = new ProbeError("This browser can't play this video. Use MP4 (H.264).");
  try {
    await event(video, 'loadeddata', () => (video.src = url));
    // HEVC in Chrome can load as audio-only: no picture means we can't use it.
    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      throw unsupported;
    }
    await event(video, 'seeked', () => (video.currentTime = Math.min(0.1, video.duration / 2)));
    return {
      kind: 'video',
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs: Math.round(video.duration * 1000),
      thumbnail: await thumbnailOf(video, video.videoWidth, video.videoHeight),
    };
  } catch (e) {
    throw e instanceof ProbeError ? e : unsupported;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Resolves on `type`, rejects on error or timeout. `start` kicks off the action. */
function event(el: HTMLMediaElement, type: string, start: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('timeout')), LOAD_TIMEOUT_MS);
    const ok = () => done();
    const fail = () => done(new Error('media error'));
    function done(err?: Error) {
      clearTimeout(timer);
      el.removeEventListener(type, ok);
      el.removeEventListener('error', fail);
      if (err) reject(err);
      else resolve();
    }
    el.addEventListener(type, ok, { once: true });
    el.addEventListener('error', fail, { once: true });
    start();
  });
}

async function thumbnailOf(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, THUMB_PX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
  if (!blob) throw new ProbeError("Couldn't make a thumbnail.");
  return blob;
}
