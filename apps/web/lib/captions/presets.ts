import type { CaptionStyle, Project } from '@viraler/shared';
import { patchTextStyle } from '@/lib/text-style';

/** What a preset sets: everything about the look, but not your size or position. */
export type CaptionPresetStyle = Omit<CaptionStyle, 'fontSizePx' | 'positionY'>;

export interface CaptionPreset {
  id: 'classic' | 'boxed' | 'karaoke' | 'minimal';
  label: string;
  style: CaptionPresetStyle;
}

export const CAPTION_PRESETS: readonly CaptionPreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    style: {
      fontFamily: 'Montserrat',
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidthPx: 8,
      align: 'center',
      uppercase: true,
      highlightColor: '#ffd400',
      highlightMode: 'color',
      animation: 'pop',
      maxWordsPerLine: 3,
      maxLines: 1,
    },
  },
  {
    id: 'boxed',
    label: 'Boxed',
    style: {
      fontFamily: 'Poppins',
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidthPx: 0,
      align: 'center',
      uppercase: true,
      highlightColor: '#7c3aed',
      highlightMode: 'box',
      animation: 'pop',
      maxWordsPerLine: 3,
      maxLines: 1,
    },
  },
  {
    id: 'karaoke',
    label: 'Karaoke',
    style: {
      fontFamily: 'Inter',
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidthPx: 6,
      align: 'center',
      uppercase: false,
      highlightColor: '#22d3ee',
      highlightMode: 'karaoke',
      animation: 'none',
      maxWordsPerLine: 4,
      maxLines: 2,
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    style: {
      fontFamily: 'Inter',
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidthPx: 0,
      backgroundColor: '#000000b3',
      align: 'center',
      uppercase: false,
      highlightColor: '#ffffff',
      highlightMode: 'none',
      animation: 'none',
      maxWordsPerLine: 5,
      maxLines: 2,
    },
  },
];

/** Applies a preset, keeping the caption size and position. */
export function applyCaptionPreset(p: Project, id: CaptionPreset['id']): Project {
  const preset = CAPTION_PRESETS.find((x) => x.id === id);
  if (!preset) return p;
  // A preset without a background box removes the current one.
  const style = patchTextStyle(p.captions.style, {
    backgroundColor: undefined,
    ...preset.style,
  });
  return { ...p, captions: { ...p.captions, style } };
}
