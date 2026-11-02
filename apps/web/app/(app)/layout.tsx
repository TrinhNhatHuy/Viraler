import { AppHeader } from '@/components/app-header';
import { requireUser } from '@/lib/auth/dal';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />
      {children}
    </div>
  );
}
