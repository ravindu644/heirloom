import css from './day-box.module.css';

/**
 * One day of a habit's week as a box on its lane: done is filled, a count on its way is filled
 * as far as it has got, a rest day carries the rest ring, and a day that was not planned has no
 * lane, only the line it would stand on. It is as wide as the place it is given.
 */
export function DayBox({ done, rest, share, off }: { done?: boolean; rest?: boolean; share?: number; off?: boolean }) {
  if (done) return <i class={`${css.box} ${css.done}`} />;
  if (rest) return <i class={`${css.box} ${css.rest}`} />;
  if (share) return <i class={`${css.box} ${css.part}`} style={`--share:${Math.min(1, share)}`} />;
  return <i class={off ? `${css.box} ${css.off}` : css.box} />;
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
