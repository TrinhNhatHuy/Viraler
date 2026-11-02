import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function isOtpType(v: string | null): v is EmailOtpType {
  return v !== null && (OTP_TYPES as readonly string[]).includes(v);
}

/**
 * Landing point for email links (signup confirmation, password recovery).
 * Templates send `token_hash` + `type` (works on any device); `code` is a PKCE fallback.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  const code = params.get('code');
  const next = safeNext(params.get('next'));

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const target = ok ? next : '/login?error=link_invalid';
  return NextResponse.redirect(new URL(target, request.url));
}
