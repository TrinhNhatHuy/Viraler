import type { NextConfig } from 'next';
import path from 'node:path';

const repoRoot = path.join(import.meta.dirname, '../..');

// One .env at the repo root, shared with the worker. Variables already set in
// the environment (e.g. Docker) take precedence; a missing file is fine.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // no root .env
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo root, so standalone output includes workspace packages.
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@viraler/shared'],
};

export default nextConfig;
