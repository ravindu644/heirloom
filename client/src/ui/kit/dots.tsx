import css from './dots.module.css';

/** A day in a row of days: kept, a rest day, empty, or today still open. */
export type DayState = 'kept' | 'rest' | 'empty' | 'open';

/**
 * A run of days as dots, oldest first. Kept is filled in you, a rest day is the hollow rest mark,
 * an empty day is a dot of the track, and today is an open ring until it has a lap. Shape tells
 * them apart, not colour alone. `label` says the same in words for a screen reader.
 */
export function Dots({ days, label }: { days: DayState[]; label: string }) {
  return (
    <div class={css.dots} role="img" aria-label={label}>
      {days.map((state, i) => (
        <i key={i} class={css[state]} />
      ))}
    </div>
  );
}
