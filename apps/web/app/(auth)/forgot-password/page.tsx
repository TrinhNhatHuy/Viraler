import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password · Viraler' };

const NOTICES: Record<string, string> = {
  expired: 'Your reset link has expired. Request a new one.',
};

export default async function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  const { error } = await searchParams;
  return (
    <AuthCard title="Reset your password" description="We'll email you a link to set a new one.">
      <ForgotPasswordForm notice={typeof error === 'string' ? NOTICES[error] : undefined} />
    </AuthCard>
  );
}
