import type { ComponentChildren } from 'preact';
import css from './panel.module.css';

/** A surface on the ground: a lane of its own, stepped by tone, with a heading. */
export function Panel({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class={css.panel}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
