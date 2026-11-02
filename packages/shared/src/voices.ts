import { z } from 'zod';
import voices from './voices.json' with { type: 'json' };

/**
 * Curated Kokoro v1.0 English voices. The JSON file is the single source of
 * truth; the worker's Pydantic Literal is checked against it in tests.
 */
export const Voice = z.object({
  id: z.string(),
  label: z.string(),
  accent: z.enum(['US', 'UK']),
  gender: z.enum(['female', 'male']),
});
export type Voice = z.infer<typeof Voice>;

export const VOICES: readonly Voice[] = z.array(Voice).parse(voices);

const ids = VOICES.map((v) => v.id);
export const VoiceId = z.enum(ids as [string, ...string[]]);
export type VoiceId = z.infer<typeof VoiceId>;

export const DEFAULT_VOICE: VoiceId = 'af_heart';

export function voiceLabel(id: string): string {
  const v = VOICES.find((x) => x.id === id);
  return v ? `${v.label} (${v.accent})` : id;
}
