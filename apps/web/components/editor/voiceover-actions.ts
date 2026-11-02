import type { Project, Voiceover } from '@viraler/shared';

/** Sets the voiceover, keeping the user's volume from the previous one. */
export function withVoiceover(
  p: Project,
  next: Omit<Voiceover, 'volume'> & { volume?: number },
): Project {
  return { ...p, voiceover: { ...next, volume: next.volume ?? p.voiceover?.volume ?? 1 } };
}

export function withoutVoiceover(p: Project): Project {
  const next = { ...p };
  delete next.voiceover;
  return next;
}
