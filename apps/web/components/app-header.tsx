import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';

export function AppHeader({ email }: { email: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/projects" className="text-lg font-semibold tracking-tight">
          Viraler
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
