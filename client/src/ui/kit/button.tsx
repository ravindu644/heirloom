import type { ButtonHTMLAttributes } from 'preact';
import css from './button.module.css';
import { cx } from './cx.ts';

/**
 * primary: the one you-filled action a screen may have. secondary: on surface. text: the rest.
 * small: a quiet aside (extend, set aside), small to the eye and still a full target for a thumb.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'text' | 'small' };

export function Button({ kind = 'secondary', class: extra, ...rest }: Props) {
  return <button type="button" {...rest} class={cx(css.button, css[kind], extra)} />;
}
