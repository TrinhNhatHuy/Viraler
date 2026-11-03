import type { CaptionStyle, Project, TranscribeOutput } from '@viraler/shared';

/** Project updates for captions. Each returns the same object when nothing changes. */

/** Applies a transcribe result, unless the voiceover was replaced while the job ran. */
export function applyTranscript(p: Project, out: TranscribeOutput): Project {
  if (p.voiceover?.src !== out.audioPath) return p;
  return { ...p, captions: { ...p.captions, words: out.words, voiceoverSrc: out.audioPath } };
}

/** Captions exist but were timed against a different voiceover file. */
export function captionsStale(p: Project): boolean {
  return (
    p.voiceover !== undefined &&
    p.captions.words.length > 0 &&
    p.captions.voiceoverSrc !== p.voiceover.src
  );
}

export function editCaptionWord(p: Project, index: number, text: string): Project {
  const word = p.captions.words[index];
  if (!word) return p;
  const trimmed = text.trim();
  if (!trimmed) return deleteCaptionWord(p, index);
  if (trimmed === word.text) return p;
  const words = p.captions.words.with(index, { ...word, text: trimmed });
  return { ...p, captions: { ...p.captions, words } };
}

export function deleteCaptionWord(p: Project, index: number): Project {
  if (!p.captions.words[index]) return p;
  const words = p.captions.words.filter((_, i) => i !== index);
  return { ...p, captions: { ...p.captions, words } };
}

export function setCaptionsEnabled(p: Project, enabled: boolean): Project {
  return p.captions.enabled === enabled ? p : { ...p, captions: { ...p.captions, enabled } };
}

export function setCaptionStyle(p: Project, patch: Partial<CaptionStyle>): Project {
  const style = { ...p.captions.style, ...patch };
  if (patch.backgroundColor === undefined && 'backgroundColor' in patch) {
    delete style.backgroundColor; // optional in the schema: remove rather than store undefined
  }
  return { ...p, captions: { ...p.captions, style } };
}
