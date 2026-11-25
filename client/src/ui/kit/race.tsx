import css from './race.module.css';
import { cx } from './cx.ts';

/** One runner: the name, the total as words ("2h 11m") and how far along the shared scale, 0 to 1. */
export interface Lane {
  label: string;
  value: string;
  share: number;
}

interface Props {
  you: Lane;
  /** Past you. Left out, there is no ghost lane at all. */
  ghost?: Lane | null;
  /** The result of a lap: tall lanes, each ending on a finish line. */
  big?: boolean;
  /** The lap-done moment: where your bar stood when the lap began, 0 to 1. Your bar runs from there, once. */
  from?: number;
}

const pct = (share: number) => `${Math.min(1, Math.max(0, share)) * 100}%`;

/** You over the ghost on one scale. Read aloud it is "You 2h 11m, Ghost 2h 30m": the bars add nothing a number has not said. */
export function Race({ you, ghost, big, from }: Props) {
  const running = from !== undefined && you.share > 0;
  return (
    <div class={cx(css.race, big && css.big)}>
      <span class={css.who}>{you.label}</span>
      <div class={cx(css.lane, running && css.running)}>
        <div class={css.bar} style={`width:${pct(you.share)};--from:${running ? from / you.share : 1}`} />
        {big && <i class={css.line} style={`left:${pct(you.share)}`} />}
      </div>
      <span class={cx(css.value, css.yours)}>{you.value}</span>
      {ghost && (
        <>
          <span class={css.who}>{ghost.label}</span>
          <div class={cx(css.lane, css.ghost)}>
            <div class={css.bar} style={`width:${pct(ghost.share)}`} />
            {big && <i class={css.line} style={`left:${pct(ghost.share)}`} />}
          </div>
          <span class={css.value}>{ghost.value}</span>
        </>
      )}
    </div>
  );
}

// How wide a place stands beside the others, in the minutes it is: a lap, a break, the long break.
const LAP = 25;
const SHORT = 5;
const LONG = 15;

/**
 * A lane made of a day's laps: each a block filled in you, the breaks between them as slivers
 * in rest, a wider one after every fourth, and the last lap `part` full. `slots` is how many laps
 * the scale holds, so a lane of fewer stands on the scale of a longer one, its end left empty.
 * `ghost` is past you: the same blocks hollow and dashed, its breaks left as the gaps they are.
 * `small` is the size of a mark in a key, each place as wide as its minutes and no wider;
 * without it the lane fills its place. With no lap at all it is the mark of one break.
 */
export function LapLane({ laps = 0, part = 1, slots = laps, ghost, small }: { laps?: number; part?: number; slots?: number; ghost?: boolean; small?: boolean }) {
  const places: { wide: number; share?: number; shown: boolean; i: number }[] = [];
  for (let i = 0; i < Math.max(slots, 1); i++) {
    if (laps > 0) places.push({ wide: LAP, share: i === laps - 1 ? part : 1, shown: i < laps, i });
    if (laps === 0 || i < slots - 1) places.push({ wide: (i + 1) % 4 === 0 ? LONG : SHORT, shown: laps === 0 || i < laps - 1, i });
  }
  return (
    <span class={cx(css.blocks, ghost && css.past, small && css.small)}>
      {places.map((place, at) => (
        <i key={at} class={cx(place.share === undefined ? css.pause : css.lap, !place.shown && css.none)} style={`--w:${place.wide};--i:${place.i};--share:${place.share ?? 0}`} />
      ))}
    </span>
  );
}

/**
 * A day as a race: you over past you, each a lane of blocks on one scale, and the split as its
 * chip over your leading end. The Race strip's lane is one bar with its total in words beside
 * it; a day in laps has pieces and no totals, so this is its own drawing, with the strip's
 * labels, ghost and chip. To a screen reader it is one picture, said by `label`. `playing`
 * moves it, once: your laps fill in turn, the chip last.
 */
export function DayRace({ you, ghost, split, label, playing }: { you: { label: string; laps: number; part: number }; ghost: { label: string; laps: number }; split: string; label: string; playing?: boolean }) {
  return (
    <div class={cx(css.day, playing && css.playing)} role="img" aria-label={label} style={`--laps:${you.laps}`}>
      <span class={css.who}>{you.label}</span>
      <SplitChip text={split} tone="ahead" />
      <LapLane laps={you.laps} part={you.part} />
      <span class={css.who}>{ghost.label}</span>
      <LapLane laps={ghost.laps} slots={you.laps} ghost />
    </div>
  );
}

/** The split between you and the ghost. The sign and the word carry it; the colour only agrees. */
export function SplitChip({ text, tone, turning }: { text: string; tone: 'behind' | 'ahead' | 'level'; turning?: boolean }) {
  return <span class={cx(css.chip, css[tone], turning && css.turning)}>{text}</span>;
}
