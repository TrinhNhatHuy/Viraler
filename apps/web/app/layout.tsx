import type { Metadata } from 'next';
import './globals.css';
import { Anton, Bebas_Neue, Geist, Inter, Montserrat, Oswald, Poppins } from 'next/font/google';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

// On-video text fonts (packages/shared/src/fonts.ts). lib/render/fonts.ts reads the
// variables; preload is off so each downloads only when a style uses it.
// next/font needs literal options here (it analyses them at build time).
const inter = Inter({ subsets: ['latin', 'latin-ext'], preload: false, variable: '--font-inter' });
const montserrat = Montserrat({
  subsets: ['latin', 'latin-ext'],
  preload: false,
  variable: '--font-montserrat',
});
const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  preload: false,
  weight: ['700', '800'],
  variable: '--font-poppins',
});
const oswald = Oswald({
  subsets: ['latin', 'latin-ext'],
  preload: false,
  variable: '--font-oswald',
});
const bebasNeue = Bebas_Neue({
  subsets: ['latin', 'latin-ext'],
  preload: false,
  weight: '400',
  variable: '--font-bebas-neue',
});
const anton = Anton({
  subsets: ['latin', 'latin-ext'],
  preload: false,
  weight: '400',
  variable: '--font-anton',
});
const videoFonts = [inter, montserrat, poppins, oswald, bebasNeue, anton].map((f) => f.variable);

export const metadata: Metadata = {
  title: 'Viraler',
  description: 'Make vertical short-form videos.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable, ...videoFonts)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
