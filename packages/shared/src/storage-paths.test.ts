import { describe, expect, it } from 'vitest';
import { isInProjectFolder, projectFolder, voiceoverPath } from './storage-paths';

describe('storage paths', () => {
  it('builds project-scoped keys', () => {
    expect(projectFolder('u1', 'p1')).toBe('u1/p1');
    expect(voiceoverPath('u1', 'p1', 'tts-j.wav')).toBe('u1/p1/voiceover/tts-j.wav');
  });

  it('checks paths belong to the project', () => {
    expect(isInProjectFolder('u1/p1/voiceover/a.wav', 'u1', 'p1')).toBe(true);
    expect(isInProjectFolder('u2/p1/voiceover/a.wav', 'u1', 'p1')).toBe(false);
    expect(isInProjectFolder('u1/p2/voiceover/a.wav', 'u1', 'p1')).toBe(false);
    expect(isInProjectFolder('u1/p1', 'u1', 'p1')).toBe(false);
    expect(isInProjectFolder('u1/p1/../p2/voiceover/a.wav', 'u1', 'p1')).toBe(false);
    expect(isInProjectFolder('u1/p10/voiceover/a.wav', 'u1', 'p1')).toBe(false);
  });
});
