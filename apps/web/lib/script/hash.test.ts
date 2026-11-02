import { describe, expect, it } from 'vitest';
import { scriptHash } from './hash';

describe('scriptHash', () => {
  it('matches known FNV-1a values', () => {
    expect(scriptHash('')).toBe('811c9dc5');
    expect(scriptHash('a')).toBe('e40c292c');
    expect(scriptHash('foobar')).toBe('bf9cf968');
  });

  it('ignores surrounding whitespace but not inner changes', () => {
    expect(scriptHash('  hello world \n')).toBe(scriptHash('hello world'));
    expect(scriptHash('hello world')).not.toBe(scriptHash('hello  world'));
    expect(scriptHash('hello world')).not.toBe(scriptHash('Hello world'));
  });

  it('handles emoji', () => {
    expect(scriptHash('🔥')).toMatch(/^[0-9a-f]{8}$/);
    expect(scriptHash('🔥')).not.toBe(scriptHash('🔦'));
  });
});
