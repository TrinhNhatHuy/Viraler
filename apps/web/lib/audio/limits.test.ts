import { describe, expect, it } from 'vitest';
import { audioExtension, checkAudioFile, MAX_AUDIO_BYTES } from './limits';

describe('audio limits', () => {
  it('maps MIME types (with codecs) to extensions', () => {
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExtension('audio/mp4')).toBe('m4a');
    expect(audioExtension('audio/mpeg')).toBe('mp3');
    expect(audioExtension('video/mp4')).toBeNull();
    expect(audioExtension('')).toBeNull();
  });

  it('checks type and size', () => {
    expect(checkAudioFile({ size: 1000, type: 'audio/mpeg' })).toEqual({ ok: true });
    expect(checkAudioFile({ size: 1000, type: 'image/png' }).ok).toBe(false);
    expect(checkAudioFile({ size: MAX_AUDIO_BYTES + 1, type: 'audio/wav' }).ok).toBe(false);
    expect(checkAudioFile({ size: 0, type: 'audio/wav' }).ok).toBe(false);
  });
});
