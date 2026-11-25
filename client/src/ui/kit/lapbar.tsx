import css from './lapbar.module.css';
import { cx } from './cx.ts';

interface Props {
  /** How full each ended lap is, oldest first: 1 for one that rang, less for one that was stopped. It stays that way. */
  fills: number[];
  /** How many segments: the laps of the day's target. */
  of: number;
  /** How far the lap in progress has run, 0 to 1. Leave out when none is running. */
  share?: number;
  /** The bar as the main thing on the screen, for the moment after four laps in a row. */
  big?: boolean;
  /** That moment: the last four laps light in turn, once. */
  lighting?: boolean;
}

/** A day's laps against its target. The words beside it say the same thing, so a screen reader skips the picture. */
export function LapBar({ fills, of, share = 0, big, lighting }: Props) {
  // The four that light are the last four drawn full: past the target the day has more laps than the bar has segments.
  const drawn = Math.min(fills.length, of);
  const first = Math.max(0, drawn - 4);
  return (
    <div class={cx(css.laps, big && css.big)} style={`--of:${of}`} aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} class={lighting && i >= first && i < drawn ? css.lit : undefined} style={`--share:${Math.min(1, fills[i] ?? (i === fills.length ? share : 0))};--i:${i - first}`} />
      ))}
    </div>
  );
}
