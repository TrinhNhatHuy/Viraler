import type { CaptionWord } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import {
  buildCaptionPages,
  CAPTION_SAFE_WIDTH,
  captionFrameAt,
  LINGER_MS,
  lineLeft,
} from './captions';

// 10 px per character, so widths are easy to reason about. A space is 10 px.
const measure = (text: string) => text.length * 10;
const style = { uppercase: false, maxWordsPerLine: 3 };

/** Words back to back, 300 ms each, starting at `startMs`. */
function seq(texts: string[], startMs = 0, gapMs = 0): CaptionWord[] {
  return texts.map((text, i) => ({
    text,
    startMs: startMs + i * (300 + gapMs),
    endMs: startMs + i * (300 + gapMs) + 300,
  }));
}

const texts = (pages: ReturnType<typeof buildCaptionPages>) =>
  pages.map((p) => p.words.map((w) => w.text).join(' '));

describe('buildCaptionPages', () => {
  it('groups up to maxWordsPerLine words', () => {
    const pages = buildCaptionPages(seq(['a', 'b', 'c', 'd', 'e']), style, measure);
    expect(texts(pages)).toEqual(['a b c', 'd e']);
  });

  it('breaks after the end of a sentence', () => {
    const pages = buildCaptionPages(seq(['Hi.', 'How', 'are', 'you?', 'Good']), style, measure);
    expect(texts(pages)).toEqual(['Hi.', 'How are you?', 'Good']);
  });

  it('treats quotes/brackets after the punctuation as a sentence end too', () => {
    const pages = buildCaptionPages(seq(['"Stop!"', 'he', 'said']), style, measure);
    expect(texts(pages)).toEqual(['"Stop!"', 'he said']);
  });

  it('breaks on a long pause', () => {
    const words = [...seq(['one', 'two']), ...seq(['three'], 600 + 600)];
    expect(texts(buildCaptionPages(words, style, measure))).toEqual(['one two', 'three']);
    const short = [...seq(['one', 'two']), ...seq(['three'], 600 + 599)];
    expect(texts(buildCaptionPages(short, style, measure))).toEqual(['one two three']);
  });

  it('breaks when the next word would not fit the line', () => {
    const wide = 'x'.repeat(50); // 500 px; two of them + a space = 1010 px > safe width
    const pages = buildCaptionPages(seq([wide, wide, 'y']), style, measure);
    expect(pages.map((p) => p.words.length)).toEqual([1, 2]);
  });

  it('gives a word wider than the line its own page', () => {
    const huge = 'x'.repeat(120);
    const pages = buildCaptionPages(seq(['a', huge, 'b']), style, measure);
    expect(texts(pages)).toEqual(['a', huge, 'b']);
    expect(pages[1]!.width).toBeGreaterThan(CAPTION_SAFE_WIDTH);
  });

  it('applies uppercase and skips empty words, keeping source indexes', () => {
    const words = seq(['hey', ' ', 'you']);
    const pages = buildCaptionPages(words, { ...style, uppercase: true }, measure);
    expect(pages[0]!.words.map((w) => [w.text, w.index])).toEqual([
      ['HEY', 0],
      ['YOU', 2],
    ]);
  });

  it('lays words out left to right with spaces', () => {
    const [page] = buildCaptionPages(seq(['ab', 'cde', 'f']), style, measure);
    expect(page!.words.map((w) => [w.x, w.width])).toEqual([
      [0, 20],
      [30, 30],
      [70, 10],
    ]);
    expect(page!.width).toBe(80);
  });

  it('keeps a page up until the next one when they are close', () => {
    const words = seq(['a', 'b', 'c', 'd'], 0, 100); // 100 ms gaps
    const pages = buildCaptionPages(words, { ...style, maxWordsPerLine: 2 }, measure);
    expect(pages[0]!.endMs).toBe(pages[1]!.startMs);
  });

  it('lingers briefly after the last word before a longer gap', () => {
    const words = [...seq(['a']), ...seq(['b'], 300 + 1000)];
    const pages = buildCaptionPages(words, style, measure);
    expect(pages[0]!.endMs).toBe(300 + LINGER_MS);
    expect(pages[1]!.endMs).toBe(1300 + 300 + LINGER_MS);
  });

  it('returns nothing for no words', () => {
    expect(buildCaptionPages([], style, measure)).toEqual([]);
  });
});

describe('captionFrameAt', () => {
  const words = [...seq(['a', 'b', 'c', 'd']), ...seq(['e'], 1200 + 1000)];
  const pages = buildCaptionPages(words, style, measure);
  // pages: "a b c" 0..900, "d" 900..1600 (linger), "e" 2200..2900

  it('is empty before the first word', () => {
    expect(captionFrameAt(buildCaptionPages(seq(['a'], 500), style, measure), 499)).toBeNull();
  });

  it('highlights the word being spoken', () => {
    expect(captionFrameAt(pages, 0)).toMatchObject({ activeIndex: 0 });
    expect(captionFrameAt(pages, 299)).toMatchObject({ activeIndex: 0 });
    expect(captionFrameAt(pages, 300)).toMatchObject({ activeIndex: 1 });
    expect(captionFrameAt(pages, 899)?.page.words[2]?.text).toBe('c');
  });

  it('switches pages exactly at the next page start', () => {
    expect(captionFrameAt(pages, 900)?.page.words[0]?.text).toBe('d');
  });

  it('hides captions during a long pause and after the end', () => {
    expect(captionFrameAt(pages, 1200 + LINGER_MS - 1)?.page.words[0]?.text).toBe('d');
    expect(captionFrameAt(pages, 1200 + LINGER_MS)).toBeNull();
    expect(captionFrameAt(pages, 2200)?.page.words[0]?.text).toBe('e');
    expect(captionFrameAt(pages, 2500 + LINGER_MS)).toBeNull();
  });

  it('keeps the last spoken word lit through a short gap inside a page', () => {
    const gappy = buildCaptionPages(seq(['a', 'b'], 0, 200), style, measure);
    expect(captionFrameAt(gappy, 400)).toMatchObject({ activeIndex: 0 });
    expect(captionFrameAt(gappy, 500)).toMatchObject({ activeIndex: 1 });
  });
});

describe('lineLeft', () => {
  it('positions a line in the safe area by alignment', () => {
    const safeLeft = (1080 - CAPTION_SAFE_WIDTH) / 2;
    expect(lineLeft(200, 'left')).toBe(safeLeft);
    expect(lineLeft(200, 'center')).toBe(440);
    expect(lineLeft(200, 'right')).toBe(safeLeft + CAPTION_SAFE_WIDTH - 200);
  });
});
