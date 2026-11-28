import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import button from './button.module.css';
import { Check } from './check.tsx';
import { cx } from './cx.ts';
import css from './opens.module.css';

// Which rows are open, by id: this device's own, never synced, kept while the app is open as the
// screens come and go. Opening one never closes another: closing a row above would move the one just tapped.
// ponytail: in memory, so a reload opens every row closed; localStorage if people want it kept.
const opened = signal(new Set<string>());
export const isOpen = (id: string) => opened.value.has(id);
export function toggle(id: string) {
  const next = new Set(opened.value);
  if (!next.delete(id)) next.add(id);
  opened.value = next;
}

/**
 * DESIGN.md, The fold arrow: the one sign for "there is more of this row", opening it in place.
 * With words it is a link in a line ("2 of 4 subtasks"), the arrow after them; without, it is a
 * 48px target of its own in a row's control column, named by `label`. `id` is the row's: what
 * it opens is drawn while `isOpen(id)`.
 */
export function Opens({ id, label, children }: { id: string; label?: string; children?: ComponentChildren }) {
  return (
    // With words it is the kit's link in a line, the arrow after the words.
    <button type="button" class={cx(css.opens, children ? cx(button.button, button.link, css.line) : css.alone)} aria-expanded={isOpen(id)} aria-label={label} onClick={() => toggle(id)}>
      {children}
      <i aria-hidden="true" />
    </button>
  );
}

/** What a row opens into: its short rows under a line, the box of each in the row's own box column. */
export function Shorts({ children }: { children: ComponentChildren }) {
  return <div class={css.shorts}>{children}</div>;
}

/** One short row: a box and its words, one target; the box in the row's box column, the words on its words' edge. `struck` draws the words done. */
export function Short({ checked, label, onChange, struck, children }: { checked: boolean; label: string; onChange: (checked: boolean) => void; struck?: boolean; children: ComponentChildren }) {
  return (
    <div class={cx(css.short, struck && checked && css.struck)}>
      <Check checked={checked} label={label} onChange={onChange}>
        {children}
      </Check>
    </div>
  );
}
