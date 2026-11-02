import { createServerClient } from '@supabase/ssr';
import type { JwtPayload } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from './constants';
import type { Database } from './database.types';
import { publicEnv, serverSupabaseUrl } from './env';

/**
 * Refreshes the auth session cookie (if needed) and returns the verified claims.
 * The returned response carries any updated cookies; callers that redirect
 * must copy them over (see `redirectWithCookies`).
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; claims: JwtPayload | null }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(serverSupabaseUrl(), publicEnv().anonKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Don't put code between createServerClient and getClaims: it can cause
  // hard-to-debug random logouts (see Supabase SSR docs).
  const { data } = await supabase.auth.getClaims();
  return { response, claims: data?.claims ?? null };
}

export function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const key of ['cache-control', 'expires', 'pragma']) {
    const value = from.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}
