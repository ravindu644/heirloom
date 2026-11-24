import { cx } from './cx.ts';
import css from './figures.module.css';

/** One figure of the strip: what it counts, the figure, and a line under it. `yours` puts the figure in you. */
export interface Figure {
  label: string;
  figure: string;
  note: string;
  yours?: boolean;
}

/** The figures a screen opens with, side by side on one surface. Two or three; none is a tile of its own. */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <dl class={css.strip}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd class={cx(css.figure, item.yours && css.yours)}>{item.figure}</dd>
          <dd>{item.note}</dd>
        </div>
      ))}
    </dl>
  );
}
