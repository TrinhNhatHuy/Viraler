import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { getCurrentUser } from '@/lib/auth/dal';

export const metadata: Metadata = { title: 'Set a new password · Viraler' };

export default async function ResetPasswordPage() {
  // The recovery link (via /auth/confirm) signs the user in before landing here.
  const user = await getCurrentUser();
  if (!user) redirect('/forgot-password?error=expired');
  return (
    <AuthCard title="Set a new password" description={`For ${user.email}`}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
