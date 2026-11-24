import css from './lapbar.module.css';
import { cx } from './cx.ts';

interface Props {
  /** Laps that are finished. */
  done: number;
  /** How many segments: the four of a set, or the laps of a day target. */
  of?: number;
  /** How far the lap in progress has run, 0 to 1. Leave out when none is running. */
  share?: number;
  /** The set of four as the main thing on the screen. */
  big?: boolean;
  /** The set-done moment: the four segments light in turn, once. */
  lighting?: boolean;
}

/** The set of four. The words beside it say the same thing, so a screen reader skips the picture. */
export function LapBar({ done, of = 4, share = 0, big, lighting }: Props) {
  return (
    <div class={cx(css.laps, big && css.big, lighting && css.lighting)} style={`--of:${of}`} aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} style={`--share:${i < done ? 1 : i === done ? share : 0};--i:${i}`} />
      ))}
    </div>
  );
}
