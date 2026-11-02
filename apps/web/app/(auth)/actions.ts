'use server';

import type { AuthError } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { safeNext } from '@/lib/auth/safe-next';
import {
  type AuthFormState,
  ForgotPasswordInput,
  ResetPasswordInput,
  SignInInput,
  SignUpInput,
} from '@/lib/auth/schemas';
import { createClient } from '@/lib/supabase/server';

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v : '';
}

function invalid(error: z.ZodError, email?: string): AuthFormState {
  return { fieldErrors: z.flattenError(error).fieldErrors, email };
}

function friendlyAuthError(error: AuthError): string {
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'weak_password':
      return 'That password is too weak. Try a longer one.';
    case 'same_password':
      return 'Choose a password different from your current one.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, 'email');
  const parsed = SignInInput.safeParse({ email, password: field(formData, 'password') });
  if (!parsed.success) return invalid(parsed.error, email);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { error: 'Please confirm your email first. Check your inbox for the link.', email };
    }
    // Generic on purpose: don't reveal whether the email exists.
    return { error: 'Invalid email or password.', email };
  }
  redirect(safeNext(field(formData, 'next')));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, 'email');
  const parsed = SignUpInput.safeParse({
    email,
    password: field(formData, 'password'),
    confirmPassword: field(formData, 'confirmPassword'),
  });
  if (!parsed.success) return invalid(parsed.error, email);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === 'user_already_exists') {
      return { error: 'An account with this email already exists. Try logging in.', email };
    }
    return { error: friendlyAuthError(error), email };
  }
  // No session = email confirmation is required (production). Locally it's off.
  if (!data.session) {
    return { message: 'Check your email for a link to confirm your account.', email };
  }
  redirect(safeNext(field(formData, 'next')));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, 'email');
  const parsed = ForgotPasswordInput.safeParse({ email });
  if (!parsed.success) return invalid(parsed.error, email);

  const supabase = await createClient();
  // The email template links to {{ .SiteURL }}/auth/confirm?...&next=/reset-password.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
    return { error: friendlyAuthError(error), email };
  }
  // Same message whether or not the account exists.
  return { message: "If an account exists for that email, we've sent a reset link.", email };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = ResetPasswordInput.safeParse({
    password: field(formData, 'password'),
    confirmPassword: field(formData, 'confirmPassword'),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return { error: 'Your reset link has expired. Request a new one.' };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: friendlyAuthError(error) };
  redirect('/projects');
}
