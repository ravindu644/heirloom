import css from './lapbar.module.css';
import { cx } from './cx.ts';

interface Props {
  /** How full each ended lap is, oldest first: 1 for one that rang, less for one that was stopped. It stays that way. */
  fills: number[];
  /** How many segments: a task's estimate on Focus, the day's target on Today. */
  of: number;
  /** How far the lap in progress has run, 0 to 1. Leave out when none is running. */
  share?: number;
  /** The bar as the main thing on the screen, for the moment a task's last estimated lap is done. */
  big?: boolean;
  /** That moment: the laps light in turn, once. */
  lighting?: boolean;
}

/** Laps against what was planned for them. The words beside it say the same thing, so a screen reader skips the picture. */
export function LapBar({ fills, of, share = 0, big, lighting }: Props) {
  // Past the plan there are more laps than segments: only those drawn light.
  const drawn = Math.min(fills.length, of);
  return (
    <div class={cx(css.laps, big && css.big)} style={`--of:${of};--lit:${Math.max(1, drawn)}`} aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} class={lighting && i < drawn ? css.lit : undefined} style={`--share:${Math.min(1, fills[i] ?? (i === fills.length ? share : 0))};--i:${i}`} />
      ))}
    </div>
  );
}
