import { MEDIA_BUCKET, voiceoverPath } from '@viraler/shared';
import { createClient } from '@/lib/supabase/client';
import { audioExtension, baseMimeType } from './limits';

export type UploadResult = { ok: true; path: string } | { ok: false; message: string };

/** Uploads a recorded/uploaded voiceover into the project's Storage folder (user's session, RLS). */
export async function uploadVoiceover(opts: {
  userId: string;
  projectId: string;
  blob: Blob;
  kind: 'recorded' | 'uploaded';
}): Promise<UploadResult> {
  const ext = audioExtension(opts.blob.type);
  if (!ext) return { ok: false, message: 'Unsupported audio format.' };
  const path = voiceoverPath(
    opts.userId,
    opts.projectId,
    `${opts.kind}-${crypto.randomUUID()}.${ext}`,
  );
  const { error } = await createClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, opts.blob, { contentType: baseMimeType(opts.blob.type), upsert: false });
  return error ? { ok: false, message: `Upload failed: ${error.message}` } : { ok: true, path };
}
