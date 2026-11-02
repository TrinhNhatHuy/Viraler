/**
 * Runs the project repo against local Supabase as two real users, so RLS,
 * triggers (revision) and constraints are exercised. Skips when Supabase isn't
 * running or the root .env is missing.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createEmptyProject, type Project } from '@viraler/shared';
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
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!available)('project repo (local Supabase)', () => {
  const admin = createClient<Database>(url!, serviceKey!, noSession);
  const userIds: string[] = [];
  let alice: Db;
  let bob: Db;

  async function signedInUser(): Promise<Db> {
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
    return client;
  }

  beforeAll(async () => {
    alice = await signedInUser();
    bob = await signedInUser();
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
    expect(await updateProject(bob, created.id, { title: 'pwned' })).toEqual({
      kind: 'not_found',
    });
    expect(await deleteProject(bob, created.id)).toBe(false);
    expect(await duplicateProject(bob, created.id)).toBeNull();

    const still = await getProject(alice, created.id);
    expect(still.kind === 'ok' && still.project.title).toBe('Private');
  });

  it('bumps the revision on data saves and detects stale writes', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const data = withFit(createEmptyProject(), 'fit');

    const first = await updateProject(alice, created.id, { data, expectedRevision: 1 });
    expect(first).toMatchObject({ kind: 'ok', revision: 2 });

    // A second tab still on revision 1 must not overwrite.
    const stale = await updateProject(alice, created.id, {
      data: withFit(data, 'fill'),
      expectedRevision: 1,
    });
    expect(stale).toEqual({ kind: 'conflict', revision: 2 });

    const got = await getProject(alice, created.id);
    expect(got.kind === 'ok' && got.project.data.canvas.fit).toBe('fit');
  });

  it("title-only updates don't bump the revision or need one", async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    const renamed = await updateProject(alice, created.id, { title: 'Renamed' });
    expect(renamed).toMatchObject({ kind: 'ok', revision: 1 });

    // An editor that loaded revision 1 can still save data afterwards.
    const saved = await updateProject(alice, created.id, {
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
    const copy = await duplicateProject(alice, created.id);
    expect(copy).toMatchObject({ title: 'Copy of Original', revision: 1 });

    const got = await getProject(alice, copy!.id);
    expect(got.kind === 'ok' && got.project.data.canvas.fit).toBe('fit');
  });

  it('deletes a project', async () => {
    const created = await createProject(alice, { data: createEmptyProject() });
    expect(await deleteProject(alice, created.id)).toBe(true);
    expect(await getProject(alice, created.id)).toEqual({ kind: 'not_found' });
    expect(await deleteProject(alice, created.id)).toBe(false);
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
});
