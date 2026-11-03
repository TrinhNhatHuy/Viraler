/** Editor keyboard shortcuts must not fire while the user types or operates a control. */

const TYPING = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
/** Plus controls where Space/letters have their own meaning. */
const INTERACTIVE = `${TYPING}, button, a, [role="slider"], [role="tab"], [role="switch"], [role="option"], [role="menuitem"]`;

/** Focus is in a text field: leave keys (incl. Ctrl+Z) to it. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING) !== null;
}

/** Focus is in a text field or on a control (where Space would activate it). */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}

/** Ctrl on Windows/Linux, Cmd on macOS. */
export const isModKey = (e: KeyboardEvent): boolean => e.ctrlKey || e.metaKey;
