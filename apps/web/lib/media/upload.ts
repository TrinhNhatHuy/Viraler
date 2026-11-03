import { MEDIA_BUCKET } from '@viraler/shared';
import { createClient } from '@/lib/supabase/client';
import { publicEnv } from '@/lib/supabase/env';

export type UploadFileResult = { ok: true } | { ok: false; message: string; aborted?: boolean };

/**
 * Uploads to Storage as the signed-in user (Storage RLS applies). Uses XHR,
 * not supabase-js, to report upload progress.
 */
export async function uploadFile(
  path: string,
  body: Blob,
  contentType: string,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<UploadFileResult> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, message: 'Your session expired. Log in again.' };
  const { url, anonKey } = publicEnv();
  const target = `${url}/storage/v1/object/${MEDIA_BUCKET}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', target);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true });
      let message = `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string };
        if (body.message) message = `Upload failed: ${body.message}`;
      } catch {
        // keep the generic message
      }
      resolve({ ok: false, message });
    };
    xhr.onerror = () => resolve({ ok: false, message: 'Upload failed. Check your connection.' });
    xhr.onabort = () => resolve({ ok: false, message: 'Upload cancelled.', aborted: true });
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Best-effort removal of files from a failed upload. */
export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length > 0) await createClient().storage.from(MEDIA_BUCKET).remove(paths);
}
