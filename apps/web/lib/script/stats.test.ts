import { describe, expect, it } from 'vitest';
import { countWords, estimateDurationMs, formatDuration } from './stats';

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   \n\t ', 0],
    ['Hello world', 2],
    ['Top 3 fastest animals!', 4],
    ["Don't stop — it's e-mail time.", 5],
    ['Price: 3.5 dollars, 1,000 people', 5],
    ['Café crème brûlée', 3],
    ['Xin chào các bạn', 4],
    ['line one\nline two', 4],
    ['... --- !!!', 0],
  ])('%j → %i', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});

describe('estimateDurationMs', () => {
  it('uses 160 wpm by default', () => {
    expect(estimateDurationMs(160)).toBe(60_000);
    expect(estimateDurationMs(80)).toBe(30_000);
  });

  it('scales with speed', () => {
    expect(estimateDurationMs(160, 160, 2)).toBe(30_000);
  });

  it('is 0 for no words', () => {
    expect(estimateDurationMs(0)).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [999, '0:01'],
    [83_000, '1:23'],
    [600_000, '10:00'],
    [3_723_000, '1:02:03'],
    [-5, '0:00'],
  ])('%i → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
