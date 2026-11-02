import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <Link href="/" className="text-2xl font-semibold tracking-tight">
        Viraler
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
