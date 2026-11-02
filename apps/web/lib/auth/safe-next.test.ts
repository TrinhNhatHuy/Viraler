import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, safeNext } from './safe-next';

describe('safeNext', () => {
  it.each(['/projects', '/projects/abc', '/projects/abc?tab=1#x', '/reset-password'])(
    'keeps same-origin path %s',
    (path) => {
      expect(safeNext(path)).toBe(path);
    },
  );

  it.each([
    '//evil.com',
    '//evil.com/projects',
    '/\\evil.com',
    '/\\/evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'projects',
    '',
    '/\tevil',
    null,
    undefined,
    42,
  ])('rejects %j', (value) => {
    expect(safeNext(value)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('uses the provided fallback', () => {
    expect(safeNext('//evil.com', '/login')).toBe('/login');
  });
});
