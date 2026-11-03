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

/** The user's media library (uploads, thumbnails), shared by all their projects. */
export function mediaFolder(userId: string): string {
  return `${userId}/media`;
}

export function mediaPath(userId: string, fileName: string): string {
  return `${mediaFolder(userId)}/${fileName}`;
}

/** True if `path` is a file directly in the user's media folder. */
export function isInMediaFolder(path: string, userId: string): boolean {
  const prefix = `${mediaFolder(userId)}/`;
  const name = path.slice(prefix.length);
  return path.startsWith(prefix) && name.length > 0 && !name.includes('/') && name !== '..';
}

/** Stock media is linked, not copied: only these hosts (Pexels CDNs, CORS-enabled). */
export const STOCK_MEDIA_HOSTS = ['images.pexels.com', 'videos.pexels.com'] as const;

/** A media `src` that is a URL rather than a Storage path. */
export const isExternalSrc = (src: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(src);

// "/" must follow the host directly: rules out userinfo (host@evil), ports and lookalikes.
const ALLOWED_URL = /^https:\/\/(?:images|videos)\.pexels\.com\/[^\s\\]*$/;

/** True for https URLs on an allowed stock host. */
export function isAllowedExternalUrl(src: string): boolean {
  return src.length <= 2048 && ALLOWED_URL.test(src);
}
