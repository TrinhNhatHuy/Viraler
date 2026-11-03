import type { Metadata } from 'next';
import './globals.css';
import { Geist, Inter } from 'next/font/google';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
// Caption/title font drawn on the preview canvas (lib/render/fonts.ts reads the variable).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Viraler',
  description: 'Make vertical short-form videos.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable, inter.variable)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
