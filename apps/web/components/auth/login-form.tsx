'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import type { AuthFormState } from '@/lib/auth/schemas';
import { FormField, FormMessage } from './form-field';

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <FormMessage error={state.error ?? notice} />
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
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <div className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link
          href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="text-foreground hover:underline"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
