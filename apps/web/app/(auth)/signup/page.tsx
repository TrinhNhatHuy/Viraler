import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';
import { SignupForm } from '@/components/auth/signup-form';
import { safeNext } from '@/lib/auth/safe-next';

export const metadata: Metadata = { title: 'Sign up · Viraler' };

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Create an account" description="Start making short-form videos.">
      <SignupForm next={typeof next === 'string' ? safeNext(next) : undefined} />
    </AuthCard>
  );
}
