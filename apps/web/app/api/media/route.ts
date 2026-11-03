import { CreateMediaBody } from '@viraler/shared';
import { apiError, parseJson, requireApiUser } from '@/lib/api/http';
import { createUploadMedia, listMedia, upsertStockMedia } from '@/lib/media/repo';

/** GET /api/media: the user's media library, newest first. */
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  return Response.json({ media: await listMedia(auth.supabase) });
}

/** POST /api/media: record an uploaded file, or save a stock item (idempotent). */
export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, CreateMediaBody);
  if (!body.ok) return body.response;

  if (body.data.origin === 'stock') {
    return Response.json(await upsertStockMedia(auth.supabase, body.data), { status: 201 });
  }

  const result = await createUploadMedia(auth.supabase, auth.user.id, body.data);
  switch (result.kind) {
    case 'ok':
      return Response.json(result.media, { status: 201 });
    case 'forbidden_path':
      return apiError(400, 'invalid_storage_path', {
        message: 'Uploads must be stored in your media folder.',
      });
    case 'not_uploaded':
      return apiError(400, 'file_not_uploaded', { message: 'Upload the file first.' });
    case 'exists':
      return apiError(409, 'media_exists');
  }
}
