import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';
import { safeNext } from '@/lib/auth/safe-next';

export const metadata: Metadata = { title: 'Log in · Viraler' };

const NOTICES: Record<string, string> = {
  link_invalid: 'That link is invalid or has expired. Please try again.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, error } = await searchParams;
  return (
    <AuthCard title="Log in" description="Welcome back.">
      <LoginForm
        next={typeof next === 'string' ? safeNext(next) : undefined}
        notice={typeof error === 'string' ? NOTICES[error] : undefined}
      />
    </AuthCard>
  );
}
