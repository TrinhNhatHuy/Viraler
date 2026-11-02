import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiError } from '@viraler/shared';
import { z } from 'zod';
import type { CurrentUser } from '@/lib/auth/dal';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

/** Max JSON request body (the DB also caps `projects.data` at 1 MB). */
export const MAX_BODY_BYTES = 1024 * 1024;

export function apiError(status: number, error: string, extra?: Omit<ApiError, 'error'>): Response {
  return Response.json({ error, ...extra } satisfies ApiError, { status });
}

export const notFound = () => apiError(404, 'not_found');

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Reads, size-limits and Zod-validates a JSON body. An empty body is treated as `{}`. */
export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<ParseResult<T>> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, response: apiError(413, 'payload_too_large') };

  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, 'payload_too_large') };
  }

  let json: unknown = {};
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, response: apiError(400, 'invalid_json') };
    }
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(400, 'validation_error', { details: z.flattenError(parsed.error) }),
    };
  }
  return { ok: true, data: parsed.data };
}

type AuthResult =
  | { ok: true; supabase: SupabaseClient<Database>; user: CurrentUser }
  | { ok: false; response: Response };

/** For route handlers: the user's Supabase client, or a 401 response. */
export async function requireApiUser(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return { ok: false, response: apiError(401, 'unauthorized') };
  return { ok: true, supabase, user: { id: data.claims.sub, email: data.claims.email ?? '' } };
}

export const isUuid = (value: string) => z.uuid().safeParse(value).success;
