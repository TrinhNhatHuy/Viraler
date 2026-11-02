'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUp } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { PASSWORD_MIN, type AuthFormState } from '@/lib/auth/schemas';
import { FormField, FormMessage } from './form-field';

export function SignupForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, {});
  if (state.message) return <FormMessage message={state.message} />;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <FormMessage error={state.error} />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        errors={state.fieldErrors?.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        errors={state.fieldErrors?.password}
      />
      <FormField
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
