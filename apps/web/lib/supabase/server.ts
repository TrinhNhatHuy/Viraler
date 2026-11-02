import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from './constants';
import type { Database } from './database.types';
import { publicEnv, serverSupabaseUrl } from './env';

/** Supabase client for Server Components, Server Actions and Route Handlers (user's session, RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(serverSupabaseUrl(), publicEnv().anonKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which can't set cookies.
          // Safe to ignore: proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}
