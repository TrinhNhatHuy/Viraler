import { z } from 'zod';

/** Integer milliseconds, >= 0. All times in the project document use this. */
export const Ms = z.number().int().nonnegative();

export const SCRIPT_MAX_CHARS = 5000;
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

const HexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
  message: 'Expected a hex color like #fff or #ffffff',
});

export const TextStyle = z.object({
  fontFamily: z.string().min(1),
  fontSizePx: z.number().int().positive(),
  color: HexColor,
  strokeColor: HexColor,
  strokeWidthPx: z.number().nonnegative(),
  backgroundColor: HexColor.optional(),
  /** Vertical anchor of the text block, 0 = top, 1 = bottom of the canvas. */
  positionY: z.number().min(0).max(1),
  align: z.enum(['left', 'center', 'right']),
  uppercase: z.boolean(),
});
export type TextStyle = z.infer<typeof TextStyle>;

export const CaptionStyle = TextStyle.extend({
  /** Color of the word currently being spoken. */
  highlightColor: HexColor,
  maxWordsPerLine: z.number().int().positive(),
});
export type CaptionStyle = z.infer<typeof CaptionStyle>;

export const Canvas = z.object({
  width: z.literal(CANVAS_WIDTH),
  height: z.literal(CANVAS_HEIGHT),
  fit: z.enum(['fill', 'fit']),
  background: HexColor,
});
export type Canvas = z.infer<typeof Canvas>;

export const Voiceover = z.object({
  src: z.string().min(1),
  durationMs: Ms,
  source: z.enum(['tts', 'recorded', 'uploaded']),
  voice: z.string().optional(),
  volume: z.number().min(0).max(1),
  /** Hash of the script a TTS voiceover was generated from (detects a stale voiceover). */
  scriptHash: z.string().optional(),
});
export type Voiceover = z.infer<typeof Voiceover>;

export const CaptionWord = z
  .object({
    text: z.string(),
    startMs: Ms,
    endMs: Ms,
  })
  .refine((w) => w.endMs >= w.startMs, { message: 'endMs must be >= startMs', path: ['endMs'] });
export type CaptionWord = z.infer<typeof CaptionWord>;

export const Captions = z.object({
  enabled: z.boolean(),
  words: z.array(CaptionWord),
  style: CaptionStyle,
  /** Voiceover file the words were timed against (detects stale captions). */
  voiceoverSrc: z.string().optional(),
});
export type Captions = z.infer<typeof Captions>;

export const HookTitle = z.object({
  enabled: z.boolean(),
  text: z.string(),
  durationMs: Ms,
  style: TextStyle,
});
export type HookTitle = z.infer<typeof HookTitle>;

export const Ranking = z.object({
  enabled: z.boolean(),
  title: z.string(),
  order: z.enum(['descending', 'ascending']),
});
export type Ranking = z.infer<typeof Ranking>;

export const Clip = z.object({
  id: z.string().min(1),
  mediaId: z.string().min(1),
  startMs: Ms,
  durationMs: Ms,
  trimInMs: Ms,
  muted: z.boolean(),
  rank: z.number().int().positive().optional(),
  label: z.string().optional(),
});
export type Clip = z.infer<typeof Clip>;

export const MediaItem = z.object({
  id: z.string().min(1),
  kind: z.enum(['video', 'image', 'audio']),
  src: z.string().min(1),
  durationMs: Ms.optional(),
  origin: z.enum(['upload', 'stock', 'ai']),
});
export type MediaItem = z.infer<typeof MediaItem>;

export const Project = z.object({
  version: z.literal(1),
  canvas: Canvas,
  script: z.string().max(SCRIPT_MAX_CHARS),
  voiceover: Voiceover.optional(),
  captions: Captions,
  hookTitle: HookTitle,
  ranking: Ranking,
  clips: z.array(Clip),
  media: z.array(MediaItem),
});
export type Project = z.infer<typeof Project>;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSizePx: 72,
  color: '#ffffff',
  strokeColor: '#000000',
  strokeWidthPx: 6,
  positionY: 0.2,
  align: 'center',
  uppercase: true,
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontSizePx: 64,
  positionY: 0.7,
  highlightColor: '#ffd400',
  maxWordsPerLine: 3,
};

export function createEmptyProject(): Project {
  return {
    version: 1,
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, fit: 'fill', background: '#000000' },
    script: '',
    captions: { enabled: true, words: [], style: { ...DEFAULT_CAPTION_STYLE } },
    hookTitle: { enabled: false, text: '', durationMs: 3000, style: { ...DEFAULT_TEXT_STYLE } },
    ranking: { enabled: false, title: '', order: 'descending' },
    clips: [],
    media: [],
  };
}
