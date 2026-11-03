/**
 * Runs the project repo against local Supabase as two real users, so RLS,
 * triggers (revision) and constraints are exercised. Skips when Supabase isn't
 * running or the root .env is missing.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createEmptyProject,
  MEDIA_BUCKET,
  mediaPath,
  type Project,
  voiceoverPath,
} from '@viraler/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  updateProject,
} from './repo';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseReachable(): Promise<boolean> {
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

const available = await supabaseReachable();

type Db = SupabaseClient<Database>;
interface TestUser {
  id: string;
  db: Db;
}
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!available)('project repo (local Supabase)', () => {
  const admin = createClient<Database>(url!, serviceKey!, noSession);
  const userIds: string[] = [];
  let alice: Db;
  let bob: Db;
  let aliceId: string;
  let bobId: string;

  async function signedInUser(): Promise<TestUser> {
    const email = `repo-test-${crypto.randomUUID()}@example.test`;
    const password = 'correct-horse-battery';
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userIds.push(data.user.id);

    const client = createClient<Database>(url!, anonKey!, noSession);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return { id: data.user.id, db: client };
  }

  beforeAll(async () => {
    ({ db: alice, id: aliceId } = await signedInUser());
    ({ db: bob, id: bobId } = await signedInUser());
  });

  afterAll(async () => {
    // Deleting users cascades to their projects.
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  const withFit = (p: Project, fit: 'fill' | 'fit'): Project => ({
    ...p,
    canvas: { ...p.canvas, fit },
  });

  it('creates, lists and gets a project', async () => {
    const created = await createProject(alice, { title: 'First', data: createEmptyProject() });
    expect(created).toMatchObject({ title: 'First', revision: 1 });

    const list = await listProjects(alice);
    expect(list.map((p) => p.id)).toContain(created.id);

    const got = await getProject(alice, created.id);
    expect(got.kind).toBe('ok');
    if (got.kind === 'ok') expect(got.project.data).toEqual(createEmptyProject());
  });

  it('defaults the title to Untitled', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    expect(created.title).toBe('Untitled');
  });

  it("hides one user's projects from another", async () => {
    const created = await createProject(alice, { title: 'Private', data: createEmptyProject() });

    expect((await listProjects(bob)).map((p) => p.id)).not.toContain(created.id);
    expect(await getProject(bob, created.id)).toEqual({ kind: 'not_found' });
    expect(await updateProject(bob, bobId, created.id, { title: 'pwned' })).toEqual({
      kind: 'not_found',
    });
    expect(await deleteProject(bob, bobId, created.id)).toBe(false);
    expect(await duplicateProject(bob, bobId, created.id)).toBeNull();

    const still = await getProject(alice, created.id);
    expect(still.kind === 'ok' && still.project.title).toBe('Private');
  });

  it('bumps the revision on data saves and detects stale writes', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const data = withFit(createEmptyProject(), 'fit');

    const first = await updateProject(alice, aliceId, created.id, { data, expectedRevision: 1 });
    expect(first).toMatchObject({ kind: 'ok', revision: 2 });

    // A second tab still on revision 1 must not overwrite.
    const stale = await updateProject(alice, aliceId, created.id, {
      data: withFit(data, 'fill'),
      expectedRevision: 1,
    });
    expect(stale).toEqual({ kind: 'conflict', revision: 2 });

    const got = await getProject(alice, created.id);
    expect(got.kind === 'ok' && got.project.data.canvas.fit).toBe('fit');
  });

  it("title-only updates don't bump the revision or need one", async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const renamed = await updateProject(alice, aliceId, created.id, { title: 'Renamed' });
    expect(renamed).toMatchObject({ kind: 'ok', revision: 1 });

    // An editor that loaded revision 1 can still save data afterwards.
    const saved = await updateProject(alice, aliceId, created.id, {
      data: withFit(createEmptyProject(), 'fit'),
      expectedRevision: 1,
    });
    expect(saved).toMatchObject({ kind: 'ok', revision: 2 });
  });

  it("clients can't set the revision directly", async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    await alice.from('projects').update({ revision: 99 }).eq('id', created.id);
    const { data } = await alice.from('projects').select('revision').eq('id', created.id).single();
    expect(data?.revision).toBe(1);
  });

  it('duplicates a project with a "Copy of" title', async () => {
    const created = await createProject(alice, {
      title: 'Original',
      data: withFit(createEmptyProject(), 'fit'),
    });
    const copy = await duplicateProject(alice, aliceId, created.id);
    expect(copy).toMatchObject({ title: 'Copy of Original', revision: 1 });

    const got = await getProject(alice, copy!.id);
    expect(got.kind === 'ok' && got.project.data.canvas.fit).toBe('fit');
  });

  it('deletes a project', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    expect(await deleteProject(alice, aliceId, created.id)).toBe(true);
    expect(await getProject(alice, created.id)).toEqual({ kind: 'not_found' });
    expect(await deleteProject(alice, aliceId, created.id)).toBe(false);
  });

  it('reports stored data that fails validation as invalid', async () => {
    const { data: row } = await alice
      .from('projects')
      .insert({ data: { version: 99 } })
      .select('id')
      .single();
    const got = await getProject(alice, row!.id);
    expect(got.kind).toBe('invalid');
  });

  // --- Storage-backed voiceover files ---------------------------------------

  const wav = () => new Blob([new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0])], { type: 'audio/wav' });

  async function upload(db: Db, path: string) {
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, wav(), { upsert: true });
    if (error) throw error;
  }

  async function exists(db: Db, path: string): Promise<boolean> {
    const folder = path.slice(0, path.lastIndexOf('/'));
    const { data } = await db.storage.from(MEDIA_BUCKET).list(folder);
    return Boolean(data?.some((f) => `${folder}/${f.name}` === path));
  }

  const withVoiceover = (src: string): Project => ({
    ...createEmptyProject(),
    voiceover: { src, durationMs: 1000, source: 'tts', voice: 'af_heart', volume: 1 },
  });

  async function projectWithVoiceover(file = 'tts-1.wav') {
    const created = await createProject(alice, { data: createEmptyProject() });
    const src = voiceoverPath(aliceId, created.id, file);
    await upload(alice, src);
    const saved = await updateProject(alice, aliceId, created.id, {
      data: withVoiceover(src),
      expectedRevision: 1,
    });
    expect(saved.kind).toBe('ok');
    return { id: created.id, src };
  }

  it('rejects voiceover paths outside the project folder', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const other = await createProject(alice, { data: createEmptyProject() });
    for (const src of [
      voiceoverPath(bobId, created.id, 'x.wav'), // another user
      voiceoverPath(aliceId, other.id, 'x.wav'), // another project
      `${aliceId}/${created.id}/../${other.id}/voiceover/x.wav`,
    ]) {
      const res = await updateProject(alice, aliceId, created.id, {
        data: withVoiceover(src),
        expectedRevision: 1,
      });
      expect(res).toEqual({ kind: 'forbidden_path', path: src });
    }
  });

  it('accepts library and Pexels media, rejects anything else', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const withMedia = (src: string, thumbnail?: string): Project => ({
      ...createEmptyProject(),
      media: [{ id: 'm1', kind: 'video', src, origin: 'upload', ...(thumbnail && { thumbnail }) }],
      clips: [{ id: 'c1', mediaId: 'm1', startMs: 0, durationMs: 1000, trimInMs: 0, muted: true }],
    });
    let revision = 1;
    for (const [src, thumb] of [
      [mediaPath(aliceId, 'a.mp4'), mediaPath(aliceId, 'a.thumb.jpg')],
      ['https://videos.pexels.com/video-files/1/1.mp4', 'https://images.pexels.com/videos/1/a.jpg'],
    ] as const) {
      const res = await updateProject(alice, aliceId, created.id, {
        data: withMedia(src, thumb),
        expectedRevision: revision,
      });
      expect(res.kind).toBe('ok');
      if (res.kind === 'ok') revision = res.revision;
    }
    for (const [src, thumb] of [
      [mediaPath(bobId, 'a.mp4'), undefined], // another user's library
      [`${aliceId}/media/../${bobId}/media/a.mp4`, undefined],
      ['https://evil.test/a.mp4', undefined],
      [mediaPath(aliceId, 'a.mp4'), 'https://evil.test/t.jpg'],
    ] as const) {
      const res = await updateProject(alice, aliceId, created.id, {
        data: withMedia(src, thumb),
        expectedRevision: revision,
      });
      expect(res).toEqual({ kind: 'forbidden_path', path: thumb ?? src });
    }
  });

  it('rejects clips that point at media not in the project', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const data: Project = {
      ...createEmptyProject(),
      clips: [
        { id: 'c1', mediaId: 'nope', startMs: 0, durationMs: 1000, trimInMs: 0, muted: true },
      ],
    };
    expect(await updateProject(alice, aliceId, created.id, { data, expectedRevision: 1 })).toEqual({
      kind: 'invalid_clip',
      clipId: 'c1',
    });
  });

  it('deletes the old voiceover file when it is replaced or removed', async () => {
    const { id, src } = await projectWithVoiceover('tts-old.wav');
    const next = voiceoverPath(aliceId, id, 'tts-new.wav');
    await upload(alice, next);

    const replaced = await updateProject(alice, aliceId, id, {
      data: withVoiceover(next),
      expectedRevision: 2,
    });
    expect(replaced.kind).toBe('ok');
    expect(await exists(alice, src)).toBe(false);
    expect(await exists(alice, next)).toBe(true);

    const removed = await updateProject(alice, aliceId, id, {
      data: createEmptyProject(),
      expectedRevision: 3,
    });
    expect(removed.kind).toBe('ok');
    expect(await exists(alice, next)).toBe(false);
  });

  it('keeps the voiceover file when a save conflicts', async () => {
    const { id, src } = await projectWithVoiceover();
    const stale = await updateProject(alice, aliceId, id, {
      data: createEmptyProject(),
      expectedRevision: 1,
    });
    expect(stale.kind).toBe('conflict');
    expect(await exists(alice, src)).toBe(true);
  });

  it('duplicate copies the voiceover file into the new project', async () => {
    const { id, src } = await projectWithVoiceover();
    const copy = await duplicateProject(alice, aliceId, id);
    const got = await getProject(alice, copy!.id);
    if (got.kind !== 'ok') throw new Error('copy not found');

    const copiedSrc = got.project.data.voiceover?.src;
    expect(copiedSrc).toBe(voiceoverPath(aliceId, copy!.id, 'tts-1.wav'));
    expect(await exists(alice, copiedSrc!)).toBe(true);

    // Deleting the original removes its files but not the copy's.
    expect(await deleteProject(alice, aliceId, id)).toBe(true);
    expect(await exists(alice, src)).toBe(false);
    expect(await exists(alice, copiedSrc!)).toBe(true);
  });

  it('duplicate points captions at the copied voiceover', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const src = voiceoverPath(aliceId, created.id, 'tts-1.wav');
    await upload(alice, src);
    const data = withVoiceover(src);
    data.captions = {
      ...data.captions,
      words: [{ text: 'Hi', startMs: 0, endMs: 300 }],
      voiceoverSrc: src,
    };
    expect(
      (await updateProject(alice, aliceId, created.id, { data, expectedRevision: 1 })).kind,
    ).toBe('ok');

    const copy = await duplicateProject(alice, aliceId, created.id);
    const got = await getProject(alice, copy!.id);
    if (got.kind !== 'ok') throw new Error('copy not found');
    expect(got.project.data.captions.voiceoverSrc).toBe(got.project.data.voiceover?.src);
    expect(got.project.data.captions.voiceoverSrc).toBe(
      voiceoverPath(aliceId, copy!.id, 'tts-1.wav'),
    );
    expect(got.project.data.captions.words).toEqual(data.captions.words);
  });

  it("can't read another user's voiceover file", async () => {
    const { src } = await projectWithVoiceover();
    const { data } = await bob.storage.from(MEDIA_BUCKET).download(src);
    expect(data).toBeNull();
  });
});
