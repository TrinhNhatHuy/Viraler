/**
 * Fonts for on-video text (free Google fonts, self-hosted by the web app).
 * Shared so every renderer (the browser now, a server renderer later) draws
 * the same names at the same weights. Bebas Neue and Anton only exist at 400.
 */
export const TEXT_FONTS = [
  { id: 'Inter', weight: 800 },
  { id: 'Montserrat', weight: 800 },
  { id: 'Poppins', weight: 800 },
  { id: 'Oswald', weight: 700 },
  { id: 'Bebas Neue', weight: 400 },
  { id: 'Anton', weight: 400 },
] as const;

export type TextFontId = (typeof TEXT_FONTS)[number]['id'];

/** Weight for fonts not in the list (they fall back to the browser's sans-serif). */
export const DEFAULT_FONT_WEIGHT = 800;

export function fontWeight(fontFamily: string): number {
  return TEXT_FONTS.find((f) => f.id === fontFamily)?.weight ?? DEFAULT_FONT_WEIGHT;
}
