import { createBrowserClient } from '@supabase/ssr';
import { AUTH_COOKIE_NAME } from './constants';
import type { Database } from './database.types';
import { publicEnv } from './env';

/** Supabase client for Client Components (e.g. Realtime job updates in later phases). */
export function createClient() {
  const { url, anonKey } = publicEnv();
  return createBrowserClient<Database>(url, anonKey, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
  });
}
