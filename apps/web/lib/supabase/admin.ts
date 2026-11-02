import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { serverSupabaseUrl } from './env';

/**
 * Service-role client: bypasses RLS. Server-only, and only for writes users
 * may not do directly (inserting jobs). Always check ownership first.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (server-only env var).');
  return createClient<Database>(serverSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
