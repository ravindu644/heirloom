import type { ComponentChildren, HTMLAttributes } from 'preact';
import { cx } from './cx.ts';
import css from './note.module.css';

// `data-job` names what the words do, so tools/design-audit.mjs can hold every name and every
// note to the one size DESIGN.md gives the job, on every screen.

/** The name of a group in a panel or a sheet: "Who is in", "The code to share". A fieldset's legend is drawn the same. */
export function Name({ children }: { children: ComponentChildren }) {
  return (
    <h3 class={css.name} data-job="name">
      {children}
    </h3>
  );
}

/** A note under something: what it means, or what happens next ("Whoever has it can join."). */
export function Note({ class: more, children, ...p }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p class={cx(css.note, more as string | undefined)} data-job="note" {...p}>
      {children}
    </p>
  );
}
