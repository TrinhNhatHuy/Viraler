'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import type { AuthFormState } from '@/lib/auth/schemas';
import { FormField, FormMessage } from './form-field';

export function ForgotPasswordForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    {},
  );
  return (
    <form action={action} className="grid gap-4">
      <FormMessage
        error={state.error ?? (state.message ? undefined : notice)}
        message={state.message}
      />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        errors={state.fieldErrors?.email}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-foreground hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
