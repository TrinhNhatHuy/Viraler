import type { TextStyle } from '@viraler/shared';

/**
 * Fonts for canvas text. Fonts are self-hosted by next/font (app/layout.tsx),
 * which exposes the generated family name through a CSS variable.
 */

/** Captions and titles are drawn heavy, like most short-form video text. */
export const TEXT_FONT_WEIGHT = 800;

const FONT_VARIABLES: Record<string, string> = {
  Inter: '--font-inter',
};

/** CSS font-family list for a project font name. */
export function resolveFontFamily(name: string): string {
  const variable = FONT_VARIABLES[name];
  if (variable && typeof document !== 'undefined') {
    const family = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    if (family) return family;
  }
  return `${JSON.stringify(name)}, sans-serif`;
}

export function fontFor(style: Pick<TextStyle, 'fontFamily' | 'fontSizePx'>): string {
  return `${TEXT_FONT_WEIGHT} ${style.fontSizePx}px ${resolveFontFamily(style.fontFamily)}`;
}

/** Loads the font faces a style needs so the first draw doesn't use a fallback. */
export async function ensureFont(style: Pick<TextStyle, 'fontFamily' | 'fontSizePx'>) {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.load(fontFor(style), 'AaBb0123');
  } catch {
    // Unknown family: the canvas falls back to sans-serif.
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Measures text in a style's font with a shared off-screen canvas (browser only). */
export function textMeasurer(
  style: Pick<TextStyle, 'fontFamily' | 'fontSizePx'>,
): (text: string) => number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx;
  if (!ctx) return (text) => text.length * style.fontSizePx * 0.6;
  const font = fontFor(style);
  return (text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}
