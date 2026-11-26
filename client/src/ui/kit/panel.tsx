import type { ComponentChildren } from 'preact';
import { Fold } from './fold.tsx';
import css from './panel.module.css';

/**
 * A surface on the ground: a lane of its own, stepped by tone, with a heading. What stands in it
 * is a column of parts: a line, a block or a whole picture that comes or goes does so in time,
 * so no screen writes that for its panels.
 */
export function Panel({ title, children }: { title: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class={css.panel}>
      <h2>{title}</h2>
      <Fold gap="md">{children}</Fold>
    </section>
  );
}
