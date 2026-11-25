import type { ButtonHTMLAttributes } from 'preact';
import css from './button.module.css';
import { cx } from './cx.ts';

/**
 * Everything that is pressed, besides rows, boxes and the navigation, is one of these four.
 * primary: the one you-filled action a screen may have.
 * secondary: a step that is not the main one, on `key` inside a hair line of `key-edge`.
 * quiet: the lesser choice beside another button, on `key-quiet`, with no line.
 * In dark the secondary's weight is its lighter fill; in light it is the line, of ink.
 * link: a small action in a sentence or beside a figure ("Undo", "Change"): underlined words,
 * small to the eye and still a full target for a thumb.
 * A button always has a fill and a link always has its line: a bare word is never pressable.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'quiet' | 'link' };

export function Button({ kind = 'secondary', class: extra, ...rest }: Props) {
  return <button type="button" {...rest} class={cx(css.button, css[kind], extra)} />;
}
