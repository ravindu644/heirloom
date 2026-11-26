import { cx } from './cx.ts';
import css from './day-box.module.css';

/**
 * One day of a habit's week as a box on its lane: done is filled, a count on its way is filled
 * as far as it has got, a rest day carries the rest ring, and a day that was not planned has no
 * lane, only the line it would stand on. It is as wide as the place it is given.
 */
export function DayBox({ done, rest, share, off }: { done?: boolean; rest?: boolean; share?: number; off?: boolean }) {
  if (done) return <i class={`${css.box} ${css.done}`} />;
  // A count on its way is filled as far as it went on any day, past days as today: 1 of 2 is half
  // a box, never an empty one, also on a day the streak counts as rest, which keeps its ring over it.
  return <i class={cx(css.box, !!share && css.part, rest && css.rest, !share && !rest && off && css.off)} style={share ? `--share:${Math.min(1, share)}` : undefined} />;
}

/** A day of a week: its one-letter name, what its box shows, and whether it is today. */
export interface WeekDay {
  letter: string;
  done?: boolean;
  rest?: boolean;
  share?: number;
  off?: boolean;
  today?: boolean;
}

/** A habit's week: seven days, Monday first, each its letter over its box. One picture to a screen reader, said by `label`. */
export function Week({ days, label }: { days: WeekDay[]; label: string }) {
  return (
    <span class={css.week} role="img" aria-label={label}>
      {days.map(({ letter, today, ...box }, i) => (
        <span key={i} class={today ? css.today : undefined}>
          {letter}
          <DayBox {...box} />
        </span>
      ))}
    </span>
  );
}
