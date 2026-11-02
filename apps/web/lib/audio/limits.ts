export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 10 * 60 * 1000;

/** MIME type (without parameters) → file extension for stored voiceovers. */
const EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

export const ACCEPTED_AUDIO = Object.keys(EXTENSIONS).join(',');

export function baseMimeType(type: string): string {
  return type.split(';')[0]!.trim().toLowerCase();
}

export function audioExtension(type: string): string | null {
  return EXTENSIONS[baseMimeType(type)] ?? null;
}

export type AudioCheck = { ok: true } | { ok: false; message: string };

export function checkAudioFile(file: { size: number; type: string }): AudioCheck {
  if (!audioExtension(file.type)) {
    return { ok: false, message: 'Unsupported file type. Use MP3, M4A, WAV, WebM, OGG or FLAC.' };
  }
  if (file.size > MAX_AUDIO_BYTES) return { ok: false, message: 'File is larger than 25 MB.' };
  if (file.size === 0) return { ok: false, message: 'File is empty.' };
  return { ok: true };
}
