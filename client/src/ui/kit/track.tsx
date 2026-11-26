import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx } from './cx.ts';
import css from './track.module.css';

const HOUR = 3600000;
// An hour's name closer to "now" than this, in px, steps aside for it.
const CLEAR = 44;
// Hour names stand at least this far apart, in px: every hour, or every second, third... as the width allows.
const APART = 56;
const STEPS = [1, 2, 3, 4, 6, 12];

/** A stretch of a day, server ms: what one row of hours and the lanes under it show. */
export interface Window {
  from: number;
  to: number;
}

const at = (w: Window, ms: number) => Math.min(100, Math.max(0, ((ms - w.from) / (w.to - w.from)) * 100));

/**
 * The hours over a set of lanes, carrying now: the names of the hours, in ink with a heavy line
 * under them as far as now and muted over a hair after it, and "now" where the heavy line ends.
 * The names stand every hour, or every few, at least 56px apart; `hour(ms)` writes one. Drawn
 * for eyes only.
 */
export function Hours({ window: w, now, hour, nowWord }: { window: Window; now: number; hour: (ms: number) => string; nowWord: string }) {
  const box = useRef<HTMLDivElement>(null);
  // The row's width, and an hour name's: "now" is about as wide, and is always there to measure.
  const [size, setSize] = useState({ width: 0, label: 0 });
  useLayoutEffect(() => {
    const seen = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, label: box.current!.querySelector('b')!.offsetWidth }));
    seen.observe(box.current!);
    return () => seen.disconnect();
  }, []);
  const { width, label } = size;
  const x = at(w, now);
  const px = (ms: number) => (at(w, ms) / 100) * width;
  // Where a name is read: half a name in at either end of the row, where it stands inside it.
  const where = (h: number) => (at(w, h) === 0 ? label / 2 : at(w, h) === 100 ? width - label / 2 : px(h));
  const day = new Date(w.from);
  day.setMinutes(0, 0, 0);
  // The hours of the local day, every `step`th: the fewest steps at which every name stands 56px
  // from the next. A name that would cross the row's end, or stands within 44px of "now", goes.
  const named = (step: number) => {
    const hours: number[] = [];
    for (let h = day.getTime(); h <= w.to; h += HOUR) {
      const x = where(h);
      if (h < w.from || new Date(h).getHours() % step !== 0 || x < label / 2 || x > width - label / 2 || Math.abs(x - px(now)) < CLEAR) continue;
      hours.push(h);
    }
    return hours;
  };
  const apart = (hours: number[]) => hours.every((h, i) => i === 0 || where(h) - where(hours[i - 1]!) >= APART);
  // Drawn once the row has been measured.
  const hours = width > 0 ? (STEPS.map(named).find(apart) ?? []) : [];
  return (
    <div ref={box} class={css.hours} aria-hidden="true">
      {hours.map((h) => (
        <span key={h} class={cx(h <= now && css.gone, at(w, h) === 0 && css.first, at(w, h) === 100 && css.last)} style={`left:${at(w, h)}%`}>
          {hour(h)}
        </span>
      ))}
      <b class={cx(x > 95 && css.last)} style={`left:${x}%`}>
        {nowWord}
      </b>
      <i class={css.past} style={`width:${x}%`} />
      <i class={css.after} style={`left:${x}%`} />
    </div>
  );
}

/**
 * One person's lane over the same stretch: a grey track across it all, and on it each lap that
 * ran as a filled block, `mine` in you and anyone else's muted; the lap running is filled as far
 * as now. A break is a gap. `children` stand in the lane at a moment (`Mark`): a circle at a call.
 */
export function Lane({ window: w, laps, mine, children }: { window: Window; laps: { start: number; end: number }[]; mine?: boolean; children?: ComponentChildren }) {
  return (
    <div class={css.lane} aria-hidden="true">
      {laps
        .filter((lap) => lap.end > w.from && lap.start < w.to)
        .map((lap) => (
          <i key={lap.start} class={cx(css.lap, mine && css.mine)} style={`left:${at(w, lap.start)}%;width:${at(w, lap.end) - at(w, lap.start)}%`} />
        ))}
      {children}
    </div>
  );
}

/** Something standing in a lane at a moment: centred on it. */
export function Mark({ window: w, at: ms, children }: { window: Window; at: number; children: ComponentChildren }) {
  return (
    <span class={css.mark} style={`left:${at(w, ms)}%`}>
      {children}
    </span>
  );
}
