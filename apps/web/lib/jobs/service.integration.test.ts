/** Jobs service against local Supabase (skips if it isn't running). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createEmptyProject,
  MAX_ACTIVE_JOBS_PER_USER,
  MAX_ACTIVE_SEARCHES_PER_USER,
  voiceoverPath,
} from '@viraler/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject } from '@/lib/projects/repo';
import type { Database } from '@/lib/supabase/database.types';
import { createJob, getJob, listJobs } from './service';

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

describe.skipIf(!available)('jobs service (local Supabase)', () => {
  const admin = createClient<Database>(url!, serviceKey!, noSession);
  const created: string[] = [];
  const users: { id: string; db: Db }[] = [];

  async function user() {
    const email = `jobs-test-${crypto.randomUUID()}@example.test`;
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

  const tts = (projectId: string) => ({
    type: 'tts' as const,
    projectId,
    input: { text: 'Hello', voice: 'af_heart', speed: 1 },
  });

  beforeAll(async () => {
    users.push(await user(), await user());
  });

  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  it('queues a job for your own project and lets you read it', async () => {
    const [alice] = users;
    const project = await createProject(alice!.db, { data: createEmptyProject() });

    const res = await createJob(alice!.db, admin, alice!.id, tts(project.id));
    if (res.kind !== 'ok') throw new Error(res.kind);
    expect(res.job).toMatchObject({ type: 'tts', status: 'queued', projectId: project.id });

    expect(await getJob(alice!.db, res.job.id)).toMatchObject({ id: res.job.id });
    const active = await listJobs(alice!.db, { projectId: project.id, activeOnly: true });
    expect(active.map((j) => j.id)).toEqual([res.job.id]);
  });

  it("refuses jobs on another user's project and hides other users' jobs", async () => {
    const [alice, bob] = users;
    const project = await createProject(alice!.db, { data: createEmptyProject() });
    expect(await createJob(bob!.db, admin, bob!.id, tts(project.id))).toEqual({
      kind: 'project_not_found',
    });

    const res = await createJob(alice!.db, admin, alice!.id, tts(project.id));
    if (res.kind !== 'ok') throw new Error(res.kind);
    expect(await getJob(bob!.db, res.job.id)).toBeNull();
    expect(await listJobs(bob!.db, { projectId: project.id, activeOnly: false })).toEqual([]);
  });

  it('queues a transcribe job only for audio in the same project', async () => {
    const [alice, bob] = users;
    const project = await createProject(alice!.db, { data: createEmptyProject() });
    const other = await createProject(alice!.db, { data: createEmptyProject() });
    const transcribe = (audioPath: string) => ({
      type: 'transcribe' as const,
      projectId: project.id,
      input: { audioPath, script: 'Hello' },
    });

    const own = voiceoverPath(alice!.id, project.id, 'tts-1.wav');
    const res = await createJob(alice!.db, admin, alice!.id, transcribe(own));
    if (res.kind !== 'ok') throw new Error(res.kind);
    expect(res.job).toMatchObject({ type: 'transcribe', status: 'queued' });
    expect(res.job.input).toEqual({ audioPath: own, script: 'Hello' });

    for (const path of [
      voiceoverPath(bob!.id, project.id, 'x.wav'),
      voiceoverPath(alice!.id, other.id, 'x.wav'),
      `${alice!.id}/${project.id}/../${other.id}/voiceover/x.wav`,
    ]) {
      expect(await createJob(alice!.db, admin, alice!.id, transcribe(path))).toEqual({
        kind: 'forbidden_path',
        path,
      });
    }
  });

  it(`caps active jobs at ${MAX_ACTIVE_JOBS_PER_USER} per user`, async () => {
    const carol = await user();
    const project = await createProject(carol.db, { data: createEmptyProject() });
    for (let i = 0; i < MAX_ACTIVE_JOBS_PER_USER; i++) {
      expect((await createJob(carol.db, admin, carol.id, tts(project.id))).kind).toBe('ok');
    }
    expect(await createJob(carol.db, admin, carol.id, tts(project.id))).toEqual({
      kind: 'too_many_active',
      limit: MAX_ACTIVE_JOBS_PER_USER,
      search: false,
    });

    // Searches have their own cap and still go through while heavy jobs are capped.
    const search = {
      type: 'stock_search' as const,
      projectId: project.id,
      input: { query: 'ocean', kind: 'video' as const, page: 1 },
    };
    for (let i = 0; i < MAX_ACTIVE_SEARCHES_PER_USER; i++) {
      expect((await createJob(carol.db, admin, carol.id, search)).kind).toBe('ok');
    }
    expect(await createJob(carol.db, admin, carol.id, search)).toEqual({
      kind: 'too_many_active',
      limit: MAX_ACTIVE_SEARCHES_PER_USER,
      search: true,
    });

    // Finished jobs don't count.
    await admin.from('jobs').update({ status: 'done' }).eq('user_id', carol.id);
    expect((await createJob(carol.db, admin, carol.id, tts(project.id))).kind).toBe('ok');
  });
});
