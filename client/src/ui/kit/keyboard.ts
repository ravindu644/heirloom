import { useEffect, useState } from 'preact/hooks';

// A keyboard takes a third of a phone or more. A browser's own bar coming and going takes about
// 56px, and must not be mistaken for one.
const KEYBOARD_MIN = 150;
// What is typed into. A box, a file or a button of an input raises no keyboard.
const TYPED = 'textarea, [contenteditable=""], [contenteditable="true"], input:not([type=checkbox], [type=radio], [type=file], [type=button], [type=submit], [type=range], [type=color])';

/** The tallest the window has been at the width it has now. */
export interface Seen {
  width: number;
  tallest: number;
}

/** Takes in the window's size as it is now. Another width (a turn of the phone, a dragged window) starts again. */
export const see = (seen: Seen | null, width: number, height: number): Seen => (seen?.width === width ? { width, tallest: Math.max(seen.tallest, height) } : { width, tallest: height });

/**
 * Whether a keyboard is on the screen: something typed into has the focus, and the window is
 * clearly shorter than it has been at this width. Neither alone can tell. A height cannot: a
 * phone with its keyboard up is as tall as a small phone without one. The focus cannot: the back
 * key puts the keyboard away and the field keeps the focus. A window that is merely short has
 * never been taller, so it is not taken for one.
 */
export const keyboardUp = (seen: Seen, height: number, typing: boolean) => typing && seen.tallest - height >= KEYBOARD_MIN;

/** True while a keyboard is up, by the rule above, looked at again on every resize and every move of the focus. */
export function useKeyboard() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    let seen = see(null, innerWidth, innerHeight);
    const look = () => {
      seen = see(seen, innerWidth, innerHeight);
      setUp(keyboardUp(seen, innerHeight, !!document.activeElement?.matches(TYPED)));
    };
    addEventListener('resize', look);
    addEventListener('focusin', look);
    addEventListener('focusout', look);
    return () => {
      removeEventListener('resize', look);
      removeEventListener('focusin', look);
      removeEventListener('focusout', look);
    };
  }, []);
  return up;
}
