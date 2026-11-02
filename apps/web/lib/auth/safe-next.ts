export const DEFAULT_AFTER_LOGIN = '/projects';

/**
 * Sanitizes a post-login redirect target to prevent open redirects.
 * Only same-origin relative paths are allowed; anything else → fallback.
 */
export function safeNext(next: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return fallback;
  // Backslashes and control chars can be normalized by browsers into `//host`.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = 'http://local.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
