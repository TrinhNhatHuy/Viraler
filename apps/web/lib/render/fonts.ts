import { fontWeight, type Project, type TextFontId, type TextStyle } from '@viraler/shared';

/**
 * Fonts for canvas text (the list is in packages/shared/src/fonts.ts). They're
 * self-hosted by next/font (app/layout.tsx), which exposes each generated
 * family name through a CSS variable.
 */

const FONT_VARIABLES: Record<TextFontId, string> = {
  Inter: '--font-inter',
  Montserrat: '--font-montserrat',
  Poppins: '--font-poppins',
  Oswald: '--font-oswald',
  'Bebas Neue': '--font-bebas-neue',
  Anton: '--font-anton',
};

/** Every text style the renderer may draw for a project (for font loading). */
export function projectTextStyles(project: Project): TextStyle[] {
  return [
    project.captions.style,
    project.hookTitle.style,
    project.ranking.titleStyle,
    project.ranking.labelStyle,
  ];
}

/** CSS font-family list for a project font name. */
export function resolveFontFamily(name: string): string {
  const variable = (FONT_VARIABLES as Record<string, string>)[name];
  if (variable && typeof document !== 'undefined') {
    const family = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    if (family) return family;
  }
  return `${JSON.stringify(name)}, sans-serif`;
}

export function fontFor(style: Pick<TextStyle, 'fontFamily' | 'fontSizePx'>): string {
  return `${fontWeight(style.fontFamily)} ${style.fontSizePx}px ${resolveFontFamily(style.fontFamily)}`;
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
