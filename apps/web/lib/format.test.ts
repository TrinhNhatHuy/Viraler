import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format';

const now = new Date('2026-11-02T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

describe('formatRelativeTime', () => {
  it.each([
    [10, 'just now'],
    [120, '2 minutes ago'],
    [3 * 3600, '3 hours ago'],
    [24 * 3600, 'yesterday'],
    [14 * 24 * 3600, '2 weeks ago'],
  ])('%is ago → %s', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(expected);
  });
});
