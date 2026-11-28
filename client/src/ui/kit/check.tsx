import type { ComponentChildren } from 'preact';
import css from './check.module.css';

/**
 * A box to tick: 20px to the eye, 48px to a thumb. `label` says what it marks, for a screen reader; `described` is the id of a note that says more. `off`: it can do nothing now and takes no press.
 * With `children` the box and its words are one target, a row as wide as it is given: a tap on the words ticks it too.
 */
export function Check({ checked, label, described, off, onChange, children }: { checked: boolean; label: string; described?: string; off?: boolean; onChange: (checked: boolean) => void; children?: ComponentChildren }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} aria-describedby={described} disabled={off} class={children ? `${css.check} ${css.worded}` : css.check} onClick={() => onChange(!checked)}>
      <i />
      {children && <span>{children}</span>}
    </button>
  );
}
