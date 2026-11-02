import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const envFile = path.join(repoRoot, '.env');

// Root .env (Supabase URL/keys) for integration tests; they skip if Supabase is down.
const rootEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
      // The real package throws outside React Server Components.
      'server-only': path.resolve(import.meta.dirname, 'test/stubs/server-only.ts'),
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
    env: { ...rootEnv, ...process.env } as Record<string, string>,
  },
});
