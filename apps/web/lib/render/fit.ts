/** Where to draw a `srcW×srcH` image inside a `dstW×dstH` frame. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `fill` covers the frame (crops the overflow, like CSS object-fit: cover);
 * `fit` shows the whole image (letterboxed, like contain). Centered either way.
 */
export function fitRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  mode: 'fill' | 'fit',
): Rect {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: dstW, h: dstH };
  const scale =
    mode === 'fill' ? Math.max(dstW / srcW, dstH / srcH) : Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}
