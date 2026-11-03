/** Media library repo against local Supabase (skips if it isn't running). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createEmptyProject,
  type CreateUploadMediaBody,
  MEDIA_BUCKET,
  mediaPath,
  type StockItem,
} from '@viraler/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, updateProject } from '@/lib/projects/repo';
import type { Database } from '@/lib/supabase/database.types';
import { createUploadMedia, deleteMedia, listMedia, upsertStockMedia } from './repo';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function reachable() {
  if (!url || !anonKey || !serviceKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await reachable();
type Db = SupabaseClient<Database>;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const stock: StockItem = {
  provider: 'pexels',
  providerId: '3571264',
  kind: 'video',
  url: 'https://videos.pexels.com/video-files/3571264/3571264-hd_1080_1920_30fps.mp4',
  thumbnailUrl: 'https://images.pexels.com/videos/3571264/free-video-3571264.jpg',
  width: 1080,
  height: 1920,
  durationMs: 12000,
  pageUrl: 'https://www.pexels.com/video/3571264/',
  author: 'Jane Doe',
  authorUrl: 'https://www.pexels.com/@jane',
};

describe.skipIf(!available)('media repo (local Supabase)', () => {
  const admin = createClient<Database>(url!, serviceKey!, noSession);
  const created: string[] = [];
  let alice: { id: string; db: Db };
  let bob: { id: string; db: Db };

  async function user() {
    const email = `media-test-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'correct-horse-battery',
      email_confirm: true,
    });
    if (error) throw error;
    created.push(data.user.id);
    const db = createClient<Database>(url!, anonKey!, noSession);
    await db.auth.signInWithPassword({ email, password: 'correct-horse-battery' });
    return { id: data.user.id, db };
  }

  beforeAll(async () => {
    alice = await user();
    bob = await user();
  });

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  async function uploaded(owner = alice, ext = 'mp4') {
    const id = crypto.randomUUID();
    const path = mediaPath(owner.id, `${id}.${ext}`);
    const thumb = mediaPath(owner.id, `${id}.thumb.jpg`);
    for (const [p, type] of [
      [path, ext === 'mp4' ? 'video/mp4' : 'image/png'],
      [thumb, 'image/jpeg'],
    ] as const) {
      const { error } = await owner.db.storage
        .from(MEDIA_BUCKET)
        .upload(p, new Blob([new Uint8Array([1, 2, 3])], { type }));
      if (error) throw error;
    }
    const body: CreateUploadMediaBody = {
      origin: 'upload',
      id,
      kind: ext === 'mp4' ? 'video' : 'image',
      storagePath: path,
      thumbnailPath: thumb,
      mimeType: ext === 'mp4' ? 'video/mp4' : 'image/png',
      sizeBytes: 3,
      durationMs: ext === 'mp4' ? 4200 : undefined,
      width: 1080,
      height: 1920,
      name: 'clip.mp4',
    };
    return { id, path, thumb, body };
  }

  async function exists(db: Db, path: string) {
    const folder = path.slice(0, path.lastIndexOf('/'));
    const { data } = await db.storage.from(MEDIA_BUCKET).list(folder);
    return Boolean(data?.some((f) => `${folder}/${f.name}` === path));
  }

  it('records an upload and lists it with a signed thumbnail', async () => {
    const { id, body } = await uploaded();
    const res = await createUploadMedia(alice.db, alice.id, body);
    if (res.kind !== 'ok') throw new Error(res.kind);
    expect(res.media).toMatchObject({ id, kind: 'video', origin: 'upload', name: 'clip.mp4' });
    expect(res.media.thumbnailUrl).toContain('/storage/v1/object/sign/');

    const list = await listMedia(alice.db);
    expect(list.map((m) => m.id)).toContain(id);
    expect((await listMedia(bob.db)).map((m) => m.id)).not.toContain(id);
  });

  it('rejects uploads at the wrong path or that were never uploaded', async () => {
    const { body } = await uploaded();
    const elsewhere = { ...body, storagePath: mediaPath(bob.id, `${body.id}.mp4`) };
    expect(await createUploadMedia(alice.db, alice.id, elsewhere)).toEqual({
      kind: 'forbidden_path',
      path: elsewhere.storagePath,
    });
    const wrongExt = { ...body, mimeType: 'video/webm' as const };
    expect((await createUploadMedia(alice.db, alice.id, wrongExt)).kind).toBe('forbidden_path');

    const ghostId = crypto.randomUUID();
    const ghost = {
      ...body,
      id: ghostId,
      storagePath: mediaPath(alice.id, `${ghostId}.mp4`),
      thumbnailPath: undefined,
    };
    expect(await createUploadMedia(alice.db, alice.id, ghost)).toEqual({ kind: 'not_uploaded' });
  });

  it('saves a stock item once per user', async () => {
    const first = await upsertStockMedia(alice.db, { origin: 'stock', item: stock });
    const again = await upsertStockMedia(alice.db, { origin: 'stock', item: stock });
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({
      origin: 'stock',
      src: stock.url,
      thumbnailUrl: stock.thumbnailUrl,
      attribution: { author: 'Jane Doe', provider: 'pexels' },
    });
    const bobs = await upsertStockMedia(bob.db, { origin: 'stock', item: stock });
    expect(bobs.id).not.toBe(first.id);
  });

  it('refuses to delete media a project uses unless forced, then removes its files', async () => {
    const { id, path, thumb, body } = await uploaded();
    const res = await createUploadMedia(alice.db, alice.id, body);
    if (res.kind !== 'ok') throw new Error(res.kind);

    const project = await createProject(alice.db, { title: 'Uses it', data: createEmptyProject() });
    const saved = await updateProject(alice.db, alice.id, project.id, {
      data: {
        ...createEmptyProject(),
        media: [{ id, kind: 'video', src: path, origin: 'upload', thumbnail: thumb }],
      },
      expectedRevision: 1,
    });
    expect(saved.kind).toBe('ok');

    expect(await deleteMedia(alice.db, id, { force: false })).toEqual({
      kind: 'in_use',
      projects: [{ id: project.id, title: 'Uses it' }],
    });
    expect(await deleteMedia(bob.db, id, { force: true })).toEqual({ kind: 'not_found' });
    expect(await deleteMedia(alice.db, id, { force: true })).toEqual({ kind: 'ok' });
    expect(await exists(alice.db, path)).toBe(false);
    expect(await exists(alice.db, thumb)).toBe(false);
  });

  it('deletes unused media without forcing', async () => {
    const { body } = await uploaded(alice, 'png');
    const res = await createUploadMedia(alice.db, alice.id, body);
    if (res.kind !== 'ok') throw new Error(res.kind);
    expect(await deleteMedia(alice.db, body.id, { force: false })).toEqual({ kind: 'ok' });
  });
});
