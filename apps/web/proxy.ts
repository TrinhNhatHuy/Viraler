import type { NextRequest } from 'next/server';
import { redirectWithCookies, updateSession } from '@/lib/supabase/proxy';

/** Pages only for signed-out users. (/reset-password needs the recovery session, so it's not here.) */
const SIGNED_OUT_ONLY = new Set(['/login', '/signup', '/forgot-password']);

/**
 * Optimistic auth: refresh the session and redirect based on the cookie.
 * Real checks live in lib/auth/dal.ts (pages) and lib/api/http.ts (API).
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!claims && (pathname === '/projects' || pathname.startsWith('/projects/'))) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname + search);
    return redirectWithCookies(url, response);
  }

  if (claims && SIGNED_OUT_ONLY.has(pathname)) {
    return redirectWithCookies(new URL('/projects', request.url), response);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimization.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
