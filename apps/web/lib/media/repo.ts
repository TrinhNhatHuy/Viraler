import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CreateStockMediaBody,
  type CreateUploadMediaBody,
  isExternalSrc,
  MEDIA_BUCKET,
  MEDIA_MIME_TYPES,
  type MediaAttribution,
  mediaFolder,
  mediaPath,
  type MediaView,
} from '@viraler/shared';
import { z } from 'zod';
import { RepoError } from '@/lib/projects/repo';
import type { Database, Json, Tables } from '@/lib/supabase/database.types';

/**
 * The user's media library (`media` table). Uses the user's client, so RLS
 * limits everything to their own rows and Storage objects.
 */

type Db = SupabaseClient<Database>;
type Row = Tables<'media'>;

const UNIQUE_VIOLATION = '23505';
const THUMB_URL_TTL_S = 3600;
const LIST_LIMIT = 200;

/** What we keep in `media.metadata`. */
const Metadata = z.object({
  name: z.string().optional(),
  thumbnailPath: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  provider: z.literal('pexels').optional(),
  providerId: z.string().optional(),
  author: z.string().optional(),
  authorUrl: z.string().optional(),
  pageUrl: z.string().optional(),
});
type Metadata = z.infer<typeof Metadata>;

const metadataOf = (row: Row): Metadata => Metadata.catch({}).parse(row.metadata);

function thumbnailOf(meta: Metadata): string | null {
  return meta.thumbnailPath ?? meta.thumbnailUrl ?? null;
}

function toView(row: Row, signed: Map<string, string>): MediaView {
  const meta = metadataOf(row);
  const thumbnail = thumbnailOf(meta);
  const attribution: MediaAttribution | null =
    meta.provider === 'pexels'
      ? {
          provider: 'pexels',
          author: meta.author ?? '',
          authorUrl: meta.authorUrl ?? '',
          pageUrl: meta.pageUrl ?? '',
        }
      : null;
  return {
    id: row.id,
    kind: row.kind as MediaView['kind'],
    origin: row.origin as MediaView['origin'],
    src: row.storage_path ?? row.external_url ?? '',
    thumbnail,
    thumbnailUrl: thumbnail
      ? isExternalSrc(thumbnail)
        ? thumbnail
        : (signed.get(thumbnail) ?? null)
      : null,
    name:
      meta.name ??
      (attribution
        ? `Pexels ${row.kind === 'video' ? 'video' : 'photo'} by ${attribution.author}`
        : 'Untitled'),
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationMs: row.duration_ms,
    width: row.width,
    height: row.height,
    attribution,
    createdAt: row.created_at,
  };
}

/** Signs Storage thumbnails in one request. */
async function signThumbnails(db: Db, rows: Row[]): Promise<Map<string, string>> {
  const paths = rows
    .map((r) => thumbnailOf(metadataOf(r)))
    .filter((p): p is string => p !== null && !isExternalSrc(p));
  if (paths.length === 0) return new Map();
  const { data, error } = await db.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, THUMB_URL_TTL_S);
  if (error) {
    console.warn('sign thumbnails failed', error.message);
    return new Map();
  }
  return new Map(
    data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])),
  );
}

async function views(db: Db, rows: Row[]): Promise<MediaView[]> {
  const signed = await signThumbnails(db, rows);
  return rows.map((r) => toView(r, signed));
}

export async function listMedia(db: Db): Promise<MediaView[]> {
  const { data, error } = await db
    .from('media')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new RepoError(error.message, error.code);
  return views(db, data);
}

export type CreateMediaResult =
  | { kind: 'ok'; media: MediaView }
  | { kind: 'forbidden_path'; path: string }
  | { kind: 'not_uploaded' }
  | { kind: 'exists' };

/** Records a file the browser uploaded to `{uid}/media/{id}.{ext}`. */
export async function createUploadMedia(
  db: Db,
  userId: string,
  body: CreateUploadMediaBody,
): Promise<CreateMediaResult> {
  const ext = MEDIA_MIME_TYPES[body.mimeType as keyof typeof MEDIA_MIME_TYPES];
  const expected = mediaPath(userId, `${body.id}.${ext}`);
  if (body.storagePath !== expected) return { kind: 'forbidden_path', path: body.storagePath };
  const thumbExpected = mediaPath(userId, `${body.id}.thumb.jpg`);
  if (body.thumbnailPath !== undefined && body.thumbnailPath !== thumbExpected) {
    return { kind: 'forbidden_path', path: body.thumbnailPath };
  }

  const { data: files, error: listError } = await db.storage
    .from(MEDIA_BUCKET)
    .list(mediaFolder(userId), { search: body.id, limit: 10 });
  if (listError) throw new RepoError(listError.message, undefined);
  if (!files.some((f) => f.name === `${body.id}.${ext}`)) return { kind: 'not_uploaded' };

  const metadata: Metadata = { name: body.name, thumbnailPath: body.thumbnailPath };
  const { data: row, error } = await db
    .from('media')
    .insert({
      id: body.id,
      kind: body.kind,
      origin: 'upload',
      storage_path: body.storagePath,
      mime_type: body.mimeType,
      size_bytes: body.sizeBytes,
      duration_ms: body.durationMs ?? null,
      width: body.width,
      height: body.height,
      metadata: metadata as NonNullable<Json>,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { kind: 'exists' };
    throw new RepoError(error.message, error.code);
  }
  return { kind: 'ok', media: (await views(db, [row]))[0]! };
}

async function findStock(db: Db, providerId: string): Promise<Row | null> {
  const { data, error } = await db
    .from('media')
    .select('*')
    .eq('origin', 'stock')
    .eq('metadata->>provider', 'pexels')
    .eq('metadata->>providerId', providerId)
    .maybeSingle();
  if (error) throw new RepoError(error.message, error.code);
  return data;
}

/** Saves a stock item to the library, or returns the row saved earlier. */
export async function upsertStockMedia(db: Db, { item }: CreateStockMediaBody): Promise<MediaView> {
  const existing = await findStock(db, item.providerId);
  if (existing) return (await views(db, [existing]))[0]!;

  const metadata: Metadata = {
    provider: item.provider,
    providerId: item.providerId,
    thumbnailUrl: item.thumbnailUrl,
    author: item.author,
    authorUrl: item.authorUrl,
    pageUrl: item.pageUrl,
  };
  const { data: row, error } = await db
    .from('media')
    .insert({
      kind: item.kind,
      origin: 'stock',
      external_url: item.url,
      mime_type: item.kind === 'video' ? 'video/mp4' : 'image/jpeg',
      duration_ms: item.durationMs ?? null,
      width: item.width,
      height: item.height,
      metadata: metadata as NonNullable<Json>,
    })
    .select('*')
    .single();
  if (error) {
    // Saved concurrently (unique index on provider + id): return that row.
    if (error.code === UNIQUE_VIOLATION) {
      const raced = await findStock(db, item.providerId);
      if (raced) return (await views(db, [raced]))[0]!;
    }
    throw new RepoError(error.message, error.code);
  }
  return (await views(db, [row]))[0]!;
}

export type DeleteMediaResult =
  | { kind: 'ok' }
  | { kind: 'not_found' }
  | { kind: 'in_use'; projects: { id: string; title: string }[] };

/** Deletes a library item (and its files). Unless forced, refuses if projects use it. */
export async function deleteMedia(
  db: Db,
  id: string,
  { force }: { force: boolean },
): Promise<DeleteMediaResult> {
  const { data: row, error } = await db.from('media').select('*').eq('id', id).maybeSingle();
  if (error) throw new RepoError(error.message, error.code);
  if (!row) return { kind: 'not_found' };

  if (!force) {
    const { data: projects, error: usageError } = await db
      .from('projects')
      .select('id, title')
      .contains('data', { media: [{ id }] });
    if (usageError) throw new RepoError(usageError.message, usageError.code);
    if (projects.length > 0) return { kind: 'in_use', projects };
  }

  const { error: deleteError } = await db.from('media').delete().eq('id', id);
  if (deleteError) throw new RepoError(deleteError.message, deleteError.code);

  const thumb = metadataOf(row).thumbnailPath;
  const files = [row.storage_path, thumb].filter((p): p is string => Boolean(p));
  if (files.length > 0) {
    const { error: removeError } = await db.storage.from(MEDIA_BUCKET).remove(files);
    if (removeError) console.warn('storage cleanup failed', files, removeError.message);
  }
  return { kind: 'ok' };
}
