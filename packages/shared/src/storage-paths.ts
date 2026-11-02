/**
 * Storage object keys in the private `media` bucket. The first path segment is
 * always the owner's user id (enforced by Storage RLS). Project files live under
 * the project's folder so they can be copied/removed with the project.
 *
 * Mirrored in services/worker/app/storage.py.
 */
export const MEDIA_BUCKET = 'media';

export function projectFolder(userId: string, projectId: string): string {
  return `${userId}/${projectId}`;
}

export function voiceoverFolder(userId: string, projectId: string): string {
  return `${projectFolder(userId, projectId)}/voiceover`;
}

export function voiceoverPath(userId: string, projectId: string, fileName: string): string {
  return `${voiceoverFolder(userId, projectId)}/${fileName}`;
}

/** True if `path` is a file directly inside the project's folder tree. */
export function isInProjectFolder(path: string, userId: string, projectId: string): boolean {
  const prefix = `${projectFolder(userId, projectId)}/`;
  return path.startsWith(prefix) && !path.slice(prefix.length).split('/').includes('..');
}
