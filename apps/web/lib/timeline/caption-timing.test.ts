import type { CaptionWord } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { MIN_WORD_MS, setWordEdge } from './caption-timing';

const words: CaptionWord[] = [
  { text: 'a', startMs: 0, endMs: 300 },
  { text: 'b', startMs: 400, endMs: 700 },
  { text: 'c', startMs: 700, endMs: 1000 },
];

describe('setWordEdge', () => {
  it('moves an edge', () => {
    expect(setWordEdge(words, 1, 'start', 350)[1]).toEqual({ text: 'b', startMs: 350, endMs: 700 });
    expect(setWordEdge(words, 0, 'end', 380)[0]!.endMs).toBe(380);
  });

  it('stays between the neighbors', () => {
    expect(setWordEdge(words, 1, 'start', 100)[1]!.startMs).toBe(300);
    expect(setWordEdge(words, 1, 'end', 900)[1]!.endMs).toBe(700);
    expect(setWordEdge(words, 2, 'end', 5000, 1200)[2]!.endMs).toBe(1200);
  });

  it(`keeps a word at least ${MIN_WORD_MS} ms long`, () => {
    expect(setWordEdge(words, 1, 'start', 699)[1]!.startMs).toBe(700 - MIN_WORD_MS);
    expect(setWordEdge(words, 1, 'end', 0)[1]!.endMs).toBe(400 + MIN_WORD_MS);
  });

  it('returns the same array when nothing changes', () => {
    expect(setWordEdge(words, 1, 'start', 400)).toBe(words);
    expect(setWordEdge(words, 9, 'start', 1)).toBe(words);
  });
});
