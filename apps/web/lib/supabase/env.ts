import { z } from 'zod';

const PublicEnv = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});
export type PublicEnv = z.infer<typeof PublicEnv>;

/** Browser-safe Supabase settings. Literal `process.env.NEXT_PUBLIC_*` refs so Next inlines them. */
export function publicEnv(): PublicEnv {
  const parsed = PublicEnv.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy .env.example to .env and fill it from `pnpm supabase status -o env`.',
    );
  }
  return parsed.data;
}

/**
 * URL the *server* uses to reach Supabase. Differs from the public URL inside
 * Docker (host.docker.internal vs 127.0.0.1).
 */
export function serverSupabaseUrl(): string {
  return process.env.SUPABASE_URL || publicEnv().url;
}
