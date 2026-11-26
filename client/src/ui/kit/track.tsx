import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx } from './cx.ts';
import css from './track.module.css';

const HOUR = 3600000;
// An hour's name closer to "now" than this, in px, steps aside for it.
const CLEAR = 44;

/** A stretch of a day, server ms: what one row of hours and the lanes under it show. */
export interface Window {
  from: number;
  to: number;
}

const at = (w: Window, ms: number) => Math.min(100, Math.max(0, ((ms - w.from) / (w.to - w.from)) * 100));

/**
 * The hours over a set of lanes, carrying now: the names of the hours, in ink with a heavy line
 * under them as far as now and muted over a hair after it, and "now" where the heavy line ends.
 * `step` is how many hours apart the names stand; `hour(ms)` writes one. Drawn for eyes only.
 */
export function Hours({ window: w, now, step = 1, hour, nowWord }: { window: Window; now: number; step?: number; hour: (ms: number) => string; nowWord: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const seen = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    seen.observe(box.current!);
    return () => seen.disconnect();
  }, []);
  const x = at(w, now);
  // The hours of the local day, every `step`th of them.
  const hours: number[] = [];
  const day = new Date(w.from);
  day.setMinutes(0, 0, 0);
  for (let h = day.getTime(); h <= w.to; h += HOUR) if (h >= w.from && new Date(h).getHours() % step === 0) hours.push(h);
  return (
    <div ref={box} class={css.hours} aria-hidden="true">
      {hours
        .filter((h) => Math.abs(((at(w, h) - x) / 100) * width) >= CLEAR)
        .map((h) => (
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
