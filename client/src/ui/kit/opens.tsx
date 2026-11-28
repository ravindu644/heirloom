import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { Check } from './check.tsx';
import { cx } from './cx.ts';
import { Fold } from './fold.tsx';
import css from './opens.module.css';

// Which rows are open, by id: this device's own, never synced, kept while the app is open as the
// screens come and go. Opening one never closes another: closing a row above would move the one just tapped.
// ponytail: in memory, so a reload opens every row closed; localStorage if people want it kept.
const opened = signal(new Set<string>());
export const isOpen = (id: string) => opened.value.has(id);
/** Closes a row's opened part, if it is open: a row that is carried is carried closed. */
export function shut(id: string) {
  if (!opened.value.has(id)) return;
  const next = new Set(opened.value);
  next.delete(id);
  opened.value = next;
}
export function toggle(id: string) {
  const next = new Set(opened.value);
  if (!next.delete(id)) next.add(id);
  opened.value = next;
}

/**
 * DESIGN.md, The fold arrow: the one sign for "there is more of this row", opening it in place.
 * It always stands in a box column: alone, a 48px target named by `label` (a habit's times);
 * with words, a band as wide as its row, the words on the words' edge after it. `id` is the
 * row's: what it opens is drawn while `isOpen(id)`.
 */
export function Opens({ id, label, children }: { id: string; label?: string; children?: ComponentChildren }) {
  return (
    <button type="button" class={cx(css.opens, children ? css.band : css.alone)} aria-expanded={isOpen(id)} aria-label={label} onClick={() => toggle(id)}>
      <i aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * DESIGN.md, A task with subtasks: the band at a card's foot, under a hair rule, that opens its
 * subtasks under it. `words` say how many are done ("1 of 3 subtasks"); `children` are its short rows.
 * The same on a task's row and under Today's strip, and opened by one state, the task's.
 */
export function Band({ id, words, children }: { id: string; words: string; children: ComponentChildren }) {
  return (
    <div class={css.banded}>
      <div class={css.bandRow}>
        <Opens id={id}>{words}</Opens>
      </div>
      <Fold>{isOpen(id) && <Shorts key="list">{children}</Shorts>}</Fold>
    </div>
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
