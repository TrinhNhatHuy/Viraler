import type { TextStyle } from '@viraler/shared';

/** Applies a style patch; `backgroundColor: undefined` removes the (optional) box. */
export function patchTextStyle<T extends TextStyle>(style: T, patch: Partial<T>): T {
  const next = { ...style, ...patch };
  if ('backgroundColor' in patch && patch.backgroundColor === undefined)
    delete next.backgroundColor;
  return next;
}
