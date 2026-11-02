'use client';

import { useActionState } from 'react';
import { updatePassword } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { PASSWORD_MIN, type AuthFormState } from '@/lib/auth/schemas';
import { FormField, FormMessage } from './form-field';

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="grid gap-4">
      <FormMessage error={state.error} />
      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
        errors={state.fieldErrors?.password}
      />
      <FormField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}
