import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo root, so standalone output includes workspace packages.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  transpilePackages: ['@viraler/shared'],
};

export default nextConfig;
