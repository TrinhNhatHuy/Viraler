/**
 * Voiceover audio limits. The browser enforces them on record/upload; the
 * worker mirrors them in services/worker/app/models.py.
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 10 * 60 * 1000;
