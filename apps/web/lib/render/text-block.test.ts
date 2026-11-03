import { describe, expect, it } from 'vitest';
import { wrapText } from './text-block';

const measure = (t: string) => t.length * 10; // 10 px per character

describe('wrapText', () => {
  it('wraps greedily within the width', () => {
    expect(wrapText('you will not believe number one', measure, 150)).toEqual([
      'you will not',
      'believe number',
      'one',
    ]);
  });

  it('puts a word wider than the line on its own line', () => {
    expect(wrapText('a supercalifragilistic b', measure, 100)).toEqual([
      'a',
      'supercalifragilistic',
      'b',
    ]);
  });

  it('ends the last allowed line with an ellipsis', () => {
    const lines = wrapText('one two three four five six seven eight', measure, 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('one two');
    expect(lines[1]!.endsWith('…')).toBe(true);
    expect(measure(lines[1]!)).toBeLessThanOrEqual(100);
  });

  it('collapses whitespace and handles empty text', () => {
    expect(wrapText('  hello   world  ', measure, 500)).toEqual(['hello world']);
    expect(wrapText('   ', measure, 500)).toEqual([]);
  });
});
