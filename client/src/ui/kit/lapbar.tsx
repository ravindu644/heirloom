import css from './lapbar.module.css';
import { cx } from './cx.ts';

interface Props {
  /** How full each ended lap is, oldest first: 1 for one that rang, less for one that was stopped. It stays that way. */
  fills: number[];
  /** How many segments: the four of a set, or the laps of a day target. */
  of?: number;
  /** How far the lap in progress has run, 0 to 1. Leave out when none is running. */
  share?: number;
  /** The set of four as the main thing on the screen. */
  big?: boolean;
  /** The set-done moment: the four segments light in turn, once. */
  lighting?: boolean;
}

/** The set of four, or a day's laps. The words beside it say the same thing, so a screen reader skips the picture. */
export function LapBar({ fills, of = 4, share = 0, big, lighting }: Props) {
  return (
    <div class={cx(css.laps, big && css.big, lighting && css.lighting)} style={`--of:${of}`} aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} style={`--share:${Math.min(1, fills[i] ?? (i === fills.length ? share : 0))};--i:${i}`} />
      ))}
    </div>
  );
}
