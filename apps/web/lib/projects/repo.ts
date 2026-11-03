import 'server-only';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PROJECT_TITLE,
  isInProjectFolder,
  MEDIA_BUCKET,
  PROJECT_TITLE_MAX,
  Project,
  type ProjectDetail,
  type ProjectSummary,
  type UpdateProjectBody,
  voiceoverFolder,
  voiceoverPath,
} from '@viraler/shared';
import type { Database, Json, Tables, TablesUpdate } from '@/lib/supabase/database.types';

/**
 * Project data access. Every function takes the *user's* Supabase client, so
 * RLS limits all reads/writes to their own rows. Used by route handlers and
 * Server Components alike.
 */

type Db = SupabaseClient<Database>;
type Row = Tables<'projects'>;

const SUMMARY_COLUMNS = 'id, title, revision, created_at, updated_at';

export class RepoError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = 'RepoError';
  }
}

/** Postgres check_violation, e.g. the 1 MB `projects_data_size` constraint. */
export const CHECK_VIOLATION = '23514';

function fail(error: PostgrestError): never {
  throw new RepoError(error.message, error.code);
}

function toSummary(row: Pick<Row, 'id' | 'title' | 'revision' | 'created_at' | 'updated_at'>) {
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies ProjectSummary;
}

// Zod's inferred Project is plain JSON data; the generated Json type can't express that.
const toJson = (data: Project): NonNullable<Json> => data as unknown as NonNullable<Json>;

export async function listProjects(db: Db): Promise<ProjectSummary[]> {
  const { data, error } = await db
    .from('projects')
    .select(SUMMARY_COLUMNS)
    .order('updated_at', { ascending: false });
  if (error) fail(error);
  return data.map(toSummary);
}

export type GetProjectResult =
  | { kind: 'ok'; project: ProjectDetail }
  | { kind: 'not_found' }
  | { kind: 'invalid'; summary: ProjectSummary; issues: string };

export async function getProject(db: Db, id: string): Promise<GetProjectResult> {
  const { data: row, error } = await db
    .from('projects')
    .select(`${SUMMARY_COLUMNS}, data`)
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error);
  if (!row) return { kind: 'not_found' };

  const parsed = Project.safeParse(row.data);
  if (!parsed.success) {
    // Never hand invalid data to the editor (it would be saved back over the original).
    return { kind: 'invalid', summary: toSummary(row), issues: parsed.error.message };
  }
  return { kind: 'ok', project: { ...toSummary(row), data: parsed.data } };
}

export async function createProject(
  db: Db,
  input: { title?: string; data: Project },
): Promise<ProjectSummary> {
  const { data: row, error } = await db
    .from('projects')
    .insert({ title: input.title ?? DEFAULT_PROJECT_TITLE, data: toJson(input.data) })
    .select(SUMMARY_COLUMNS)
    .single();
  if (error) fail(error);
  return toSummary(row);
}

export type UpdateProjectResult =
  | { kind: 'ok'; revision: number; updatedAt: string }
  | { kind: 'not_found' }
  | { kind: 'conflict'; revision: number }
  | { kind: 'forbidden_path'; path: string };

/** Storage paths referenced by a project document that must belong to the project. */
function ownedPaths(data: Project): string[] {
  return data.voiceover ? [data.voiceover.src] : [];
}

/** Best-effort Storage cleanup: a leftover file wastes space but must not fail the request. */
async function removeFiles(db: Db, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await db.storage.from(MEDIA_BUCKET).remove(paths);
  if (error) console.warn('storage cleanup failed', paths, error.message);
}

/**
 * Updates title and/or data. A `data` update only applies if the stored
 * revision still equals `expectedRevision` (optimistic concurrency). When the
 * voiceover file is replaced or removed, the old file is deleted afterwards.
 */
export async function updateProject(
  db: Db,
  userId: string,
  id: string,
  body: UpdateProjectBody,
): Promise<UpdateProjectResult> {
  const patch: TablesUpdate<'projects'> = {};
  if (body.title !== undefined) patch.title = body.title;

  let previousSrc: string | null = null;
  if (body.data !== undefined) {
    if (body.expectedRevision === undefined) throw new Error('expectedRevision is required');
    const foreign = ownedPaths(body.data).find((path) => !isInProjectFolder(path, userId, id));
    if (foreign) return { kind: 'forbidden_path', path: foreign };
    patch.data = toJson(body.data);

    // Remember the current voiceover file so it can be deleted if this save replaces it.
    const { data: prev, error: prevError } = await db
      .from('projects')
      .select('revision, src:data->voiceover->>src')
      .eq('id', id)
      .maybeSingle();
    if (prevError) fail(prevError);
    if (prev && prev.revision === body.expectedRevision && typeof prev.src === 'string') {
      previousSrc = prev.src;
    }
  }

  let query = db.from('projects').update(patch).eq('id', id);
  if (body.data !== undefined) query = query.eq('revision', body.expectedRevision!);
  const { data: row, error } = await query.select('revision, updated_at').maybeSingle();
  if (error) fail(error);

  if (row) {
    const nextSrc = body.data?.voiceover?.src ?? null;
    if (previousSrc && previousSrc !== nextSrc && isInProjectFolder(previousSrc, userId, id)) {
      await removeFiles(db, [previousSrc]);
    }
    return { kind: 'ok', revision: row.revision, updatedAt: row.updated_at };
  }

  // Nothing updated: either the project doesn't exist (for this user) or the revision moved on.
  const { data: current, error: readError } = await db
    .from('projects')
    .select('revision')
    .eq('id', id)
    .maybeSingle();
  if (readError) fail(readError);
  return current ? { kind: 'conflict', revision: current.revision } : { kind: 'not_found' };
}

/** All objects in the project's Storage folders. */
async function listProjectFiles(db: Db, userId: string, id: string): Promise<string[]> {
  const folder = voiceoverFolder(userId, id);
  const { data, error } = await db.storage.from(MEDIA_BUCKET).list(folder, { limit: 1000 });
  if (error) {
    console.warn('storage list failed', folder, error.message);
    return [];
  }
  return data.filter((f) => f.id !== null).map((f) => `${folder}/${f.name}`);
}

export async function deleteProject(db: Db, userId: string, id: string): Promise<boolean> {
  const { data, error } = await db.from('projects').delete().eq('id', id).select('id');
  if (error) fail(error);
  if (data.length === 0) return false;
  await removeFiles(db, await listProjectFiles(db, userId, id));
  return true;
}

export function copyTitle(title: string): string {
  return `Copy of ${title}`.slice(0, PROJECT_TITLE_MAX);
}

/**
 * Copies a project. Its voiceover file is copied into the new project's folder
 * too, so deleting the original doesn't break the copy.
 */
export async function duplicateProject(
  db: Db,
  userId: string,
  id: string,
): Promise<ProjectSummary | null> {
  const { data: source, error } = await db
    .from('projects')
    .select('title, data')
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error);
  if (!source) return null;

  const newId = crypto.randomUUID();
  let data: Json = source.data;
  let copiedPath: string | null = null;

  const parsed = Project.safeParse(source.data);
  const src = parsed.success ? parsed.data.voiceover?.src : undefined;
  if (parsed.success && parsed.data.voiceover && src && isInProjectFolder(src, userId, id)) {
    copiedPath = voiceoverPath(userId, newId, src.split('/').pop()!);
    const { error: copyError } = await db.storage.from(MEDIA_BUCKET).copy(src, copiedPath);
    if (copyError) throw new RepoError(`copy voiceover: ${copyError.message}`, undefined);
    const { captions } = parsed.data;
    data = toJson({
      ...parsed.data,
      voiceover: { ...parsed.data.voiceover, src: copiedPath },
      // Captions timed against the original file are just as valid for the copy.
      captions:
        captions.voiceoverSrc === src ? { ...captions, voiceoverSrc: copiedPath } : captions,
    });
  }

  const { data: row, error: insertError } = await db
    .from('projects')
    .insert({ id: newId, title: copyTitle(source.title), data: data ?? {} })
    .select(SUMMARY_COLUMNS)
    .single();
  if (insertError) {
    if (copiedPath) await removeFiles(db, [copiedPath]);
    fail(insertError);
  }
  return toSummary(row);
}
