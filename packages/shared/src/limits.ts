/**
 * Voiceover audio limits. The browser enforces them on record/upload; the
 * worker mirrors them in services/worker/app/models.py.
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 10 * 60 * 1000;

/** Library uploads: the Supabase free tier caps a single file at 50 MB. */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/** Accepted library upload types → stored file extension. */
export const MEDIA_MIME_TYPES = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type MediaMimeType = keyof typeof MEDIA_MIME_TYPES;

export const isMediaMimeType = (type: string): type is MediaMimeType =>
  Object.hasOwn(MEDIA_MIME_TYPES, type);

/** Timeline clip lengths (ms). */
export const MIN_CLIP_MS = 200;
export const DEFAULT_IMAGE_CLIP_MS = 3000;
export const DEFAULT_VIDEO_CLIP_MS = 5000;
