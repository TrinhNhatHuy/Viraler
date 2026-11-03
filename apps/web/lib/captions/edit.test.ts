import { createEmptyProject, type Project, type TranscribeOutput } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import {
  applyTranscript,
  captionsStale,
  deleteCaptionWord,
  editCaptionWord,
  setCaptionsEnabled,
  setCaptionStyle,
} from './edit';

const SRC = 'u/p/voiceover/tts-1.wav';

function project(): Project {
  return {
    ...createEmptyProject(),
    voiceover: { src: SRC, durationMs: 1000, source: 'tts', volume: 1 },
  };
}

const output: TranscribeOutput = {
  audioPath: SRC,
  words: [
    { text: 'Hello', startMs: 0, endMs: 400 },
    { text: 'world!', startMs: 400, endMs: 900 },
  ],
  language: 'en',
  aligned: true,
  durationMs: 1000,
};

describe('applyTranscript', () => {
  it('sets the words and remembers which voiceover they belong to', () => {
    const next = applyTranscript(project(), output);
    expect(next.captions.words).toEqual(output.words);
    expect(next.captions.voiceoverSrc).toBe(SRC);
    expect(captionsStale(next)).toBe(false);
  });

  it('ignores a result for a voiceover that was replaced meanwhile', () => {
    const p = project();
    expect(applyTranscript(p, { ...output, audioPath: 'u/p/voiceover/old.wav' })).toBe(p);
  });
});

describe('captionsStale', () => {
  it('is true once the voiceover changes', () => {
    const p = applyTranscript(project(), output);
    expect(
      captionsStale({ ...p, voiceover: { ...p.voiceover!, src: 'u/p/voiceover/new.wav' } }),
    ).toBe(true);
  });

  it('is false without words or without a voiceover', () => {
    expect(captionsStale(project())).toBe(false);
    const p = applyTranscript(project(), output);
    const withoutVoiceover = { ...p };
    delete withoutVoiceover.voiceover;
    expect(captionsStale(withoutVoiceover)).toBe(false);
  });
});

describe('word edits', () => {
  const p = applyTranscript(project(), output);

  it('edits a word, trimming it', () => {
    const next = editCaptionWord(p, 1, '  World? ');
    expect(next.captions.words[1]).toEqual({ text: 'World?', startMs: 400, endMs: 900 });
    expect(next.captions.words[0]).toBe(p.captions.words[0]);
  });

  it('deletes a word when its text is cleared', () => {
    expect(editCaptionWord(p, 0, '  ').captions.words.map((w) => w.text)).toEqual(['world!']);
  });

  it('returns the same project for no-ops', () => {
    expect(editCaptionWord(p, 0, 'Hello')).toBe(p);
    expect(editCaptionWord(p, 9, 'x')).toBe(p);
    expect(deleteCaptionWord(p, 9)).toBe(p);
    expect(setCaptionsEnabled(p, true)).toBe(p);
  });

  it('deletes a word', () => {
    expect(deleteCaptionWord(p, 1).captions.words).toEqual([output.words[0]]);
  });
});

describe('style', () => {
  it('patches the style', () => {
    const next = setCaptionStyle(project(), { fontSizePx: 90, highlightColor: '#00ff00' });
    expect(next.captions.style).toMatchObject({ fontSizePx: 90, highlightColor: '#00ff00' });
  });

  it('removes the background color instead of storing undefined', () => {
    const withBg = setCaptionStyle(project(), { backgroundColor: '#000000' });
    const without = setCaptionStyle(withBg, { backgroundColor: undefined });
    expect('backgroundColor' in without.captions.style).toBe(false);
  });

  it('toggles captions', () => {
    expect(setCaptionsEnabled(project(), false).captions.enabled).toBe(false);
  });
});
