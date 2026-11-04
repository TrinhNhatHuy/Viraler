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

/** A pop-in when a text appears. */
export const Entrance = z.enum(['none', 'pop']);
export type Entrance = z.infer<typeof Entrance>;

// Fields added after a format was in use get defaults that keep the old look,
// so projects saved before them still parse (and gain the field on next save).

export const CaptionStyle = TextStyle.extend({
  /** Color of the word currently being spoken. */
  highlightColor: HexColor,
  maxWordsPerLine: z.number().int().positive(),
  /**
   * How the spoken word stands out: its color, a box behind it, karaoke (every
   * word spoken so far is colored), or not at all.
   */
  highlightMode: z.enum(['color', 'box', 'karaoke', 'none']).default('color'),
  /** `pop`: the spoken word briefly scales up as it starts. */
  animation: z.enum(['none', 'pop']).default('none'),
  maxLines: z.union([z.literal(1), z.literal(2)]).default(1),
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
  entrance: Entrance.default('none'),
});
export type HookTitle = z.infer<typeof HookTitle>;

export const DEFAULT_RANKING_TITLE_STYLE: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontSizePx: 64,
  positionY: 0.09,
  strokeWidthPx: 6,
};
export const DEFAULT_RANK_LABEL_STYLE: TextStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontSizePx: 88,
  positionY: 0.17,
  strokeWidthPx: 8,
};
export const DEFAULT_RANK_COLOR = '#ffd400';

export const Ranking = z.object({
  enabled: z.boolean(),
  title: z.string(),
  order: z.enum(['descending', 'ascending']),
  /** `badge`: the current clip's "#3 Label"; `list`: every rank, revealed as its clip plays. */
  layout: z.enum(['badge', 'list']).default('badge'),
  titleStyle: TextStyle.default(() => ({ ...DEFAULT_RANKING_TITLE_STYLE })),
  /** Style of rank labels (the badge, or the list items). */
  labelStyle: TextStyle.default(() => ({ ...DEFAULT_RANK_LABEL_STYLE })),
  /** Color of the "#3" (and of the current list item). */
  rankColor: HexColor.default(DEFAULT_RANK_COLOR),
  entrance: Entrance.default('none'),
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

export const MEDIA_NAME_MAX = 200;

export const MediaItem = z.object({
  id: z.string().min(1),
  kind: z.enum(['video', 'image', 'audio']),
  /** Storage path ({uid}/media/…) or an allowed stock URL. */
  src: z.string().min(1),
  durationMs: Ms.optional(),
  origin: z.enum(['upload', 'stock', 'ai']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Small preview image: Storage path or stock URL. */
  thumbnail: z.string().min(1).optional(),
  name: z.string().max(MEDIA_NAME_MAX).optional(),
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

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  ...DEFAULT_TEXT_STYLE,
  fontSizePx: 64,
  positionY: 0.7,
  highlightColor: '#ffd400',
  maxWordsPerLine: 3,
  highlightMode: 'color',
  animation: 'pop',
  maxLines: 1,
};

export function createEmptyProject(): Project {
  return {
    version: 1,
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, fit: 'fill', background: '#000000' },
    script: '',
    captions: { enabled: true, words: [], style: { ...DEFAULT_CAPTION_STYLE } },
    hookTitle: {
      enabled: false,
      text: '',
      durationMs: 3000,
      style: { ...DEFAULT_TEXT_STYLE },
      entrance: 'pop',
    },
    ranking: {
      enabled: false,
      title: '',
      order: 'descending',
      layout: 'badge',
      titleStyle: { ...DEFAULT_RANKING_TITLE_STYLE },
      labelStyle: { ...DEFAULT_RANK_LABEL_STYLE },
      rankColor: DEFAULT_RANK_COLOR,
      entrance: 'pop',
    },
    clips: [],
    media: [],
  };
}
