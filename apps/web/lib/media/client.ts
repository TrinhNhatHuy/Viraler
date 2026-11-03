import {
  ApiError,
  type CreateMediaBody,
  type MediaItem,
  MediaView,
  MEDIA_MIME_TYPES,
  type MediaMimeType,
  mediaPath,
} from '@viraler/shared';
import { z } from 'zod';
import { request } from '@/lib/projects/client';
import { probeMediaFile, ProbeError } from './probe';
import { removeFiles, uploadFile } from './upload';

/** Browser-side wrappers around /api/media. */

export function listMediaRequest() {
  return request(
    '/api/media',
    { method: 'GET', cache: 'no-store' },
    z.object({ media: z.array(MediaView) }),
  );
}

export function createMediaRequest(body: CreateMediaBody) {
  return request('/api/media', { method: 'POST', body: JSON.stringify(body) }, MediaView);
}

const InUse = z.object({ projects: z.array(z.object({ id: z.string(), title: z.string() })) });

export type DeleteMediaResult =
  | { ok: true }
  | { ok: false; inUse: { id: string; title: string }[] }
  | { ok: false; message: string };

export async function deleteMediaRequest(id: string, force = false): Promise<DeleteMediaResult> {
  try {
    const res = await fetch(`/api/media/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' });
    if (res.ok) return { ok: true };
    const body = ApiError.safeParse(await res.json().catch(() => null));
    if (res.status === 409 && body.success) {
      const details = InUse.safeParse(body.data.details);
      if (details.success) return { ok: false, inUse: details.data.projects };
    }
    return {
      ok: false,
      message: (body.success && body.data.message) || `Delete failed (${res.status}).`,
    };
  } catch {
    return { ok: false, message: "Can't reach the server. Check your connection." };
  }
}

/** The project copy of a library item (what clips refer to). */
export function toMediaItem(view: MediaView): MediaItem {
  return {
    id: view.id,
    kind: view.kind,
    src: view.src,
    origin: view.origin,
    ...(view.durationMs !== null && { durationMs: view.durationMs }),
    ...(view.width !== null && { width: view.width }),
    ...(view.height !== null && { height: view.height }),
    ...(view.thumbnail !== null && { thumbnail: view.thumbnail }),
    name: view.name.slice(0, 200),
  };
}

export type UploadMediaResult = { ok: true; media: MediaView } | { ok: false; message: string };

/**
 * Probe → upload the file and its thumbnail to {uid}/media/{id}.* → record it.
 * Cleans up the uploaded files if a later step fails.
 */
export async function uploadMedia(
  userId: string,
  file: File,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<UploadMediaResult> {
  let probed;
  try {
    probed = await probeMediaFile(file);
  } catch (e) {
    return { ok: false, message: e instanceof ProbeError ? e.message : "Couldn't read this file." };
  }

  const id = crypto.randomUUID();
  const mimeType = file.type as MediaMimeType;
  const storagePath = mediaPath(userId, `${id}.${MEDIA_MIME_TYPES[mimeType]}`);
  const thumbnailPath = mediaPath(userId, `${id}.thumb.jpg`);

  const thumb = await uploadFile(thumbnailPath, probed.thumbnail, 'image/jpeg', {
    signal: opts.signal,
  });
  if (!thumb.ok) return thumb;
  const main = await uploadFile(storagePath, file, mimeType, opts);
  if (!main.ok) {
    await removeFiles([thumbnailPath]);
    return main;
  }

  const res = await createMediaRequest({
    origin: 'upload',
    id,
    kind: probed.kind,
    storagePath,
    thumbnailPath,
    mimeType,
    sizeBytes: file.size,
    durationMs: probed.durationMs,
    width: probed.width,
    height: probed.height,
    name: file.name.slice(0, 200) || 'Untitled',
  });
  if (!res.ok) {
    await removeFiles([storagePath, thumbnailPath]);
    return { ok: false, message: res.message };
  }
  return { ok: true, media: res.value };
}
