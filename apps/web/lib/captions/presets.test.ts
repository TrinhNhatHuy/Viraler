import { CaptionStyle, createEmptyProject } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { applyCaptionPreset, CAPTION_PRESETS } from './presets';

describe('caption presets', () => {
  it('each preset is a valid caption style', () => {
    const base = createEmptyProject().captions.style;
    for (const preset of CAPTION_PRESETS) {
      expect(CaptionStyle.safeParse({ ...base, ...preset.style }).success, preset.id).toBe(true);
    }
  });

  it('keeps the size and position and sets the preset fields', () => {
    const p = createEmptyProject();
    p.captions.style = { ...p.captions.style, fontSizePx: 90, positionY: 0.55 };
    const next = applyCaptionPreset(p, 'karaoke');
    expect(next.captions.style).toMatchObject({
      fontSizePx: 90,
      positionY: 0.55,
      highlightMode: 'karaoke',
      maxLines: 2,
    });
  });

  it('adds or removes the background box', () => {
    const minimal = applyCaptionPreset(createEmptyProject(), 'minimal');
    expect(minimal.captions.style.backgroundColor).toBe('#000000b3');
    const classic = applyCaptionPreset(minimal, 'classic');
    expect('backgroundColor' in classic.captions.style).toBe(false);
  });
});
