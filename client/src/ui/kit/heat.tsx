import type { TargetedKeyboardEvent, TargetedMouseEvent } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { cx } from './cx.ts';
import css from './heat.module.css';

/** One day of the grid: its date as `2026-11-24`, a step from 0 to 4, and whether it was a rest day. */
export interface HeatDay {
  day: string;
  level: number;
  rest: boolean;
}

interface Props {
  /** One per day, oldest first, with no gaps. */
  days: HeatDay[];
  /** The day chosen, outlined, and what choosing one does. Left out, the grid is a picture and nothing in it is pressed. */
  chosen?: string;
  onChoose?: (day: string) => void;
  /** What the grid is, for a screen reader. */
  label: string;
  /** A day in words: "Tuesday 17 November: 3h 20m, 8 laps". Read as the chosen day changes. */
  say?: (day: HeatDay) => string;
  /** Names for the rows shown (Monday, Wednesday, Friday, Sunday) and for a month, by its number from 0. */
  weekdays: string[];
  month: (month: number) => string;
  /** Called when the weeks do not fit their place even at the small size. */
  onOver?: () => void;
}

const weekdayOf = (day: string) => (new Date(day).getUTCDay() + 6) % 7;

/**
 * Days as squares: weeks are columns, Monday on top, one hue getting darker over four steps, a
 * rest day carrying the rest mark. The squares are too small to press one by one, so the grid
 * is one control: a tap chooses the day under the finger, the arrow keys move a day or a week,
 * and a screen reader hears it as a slider over the days. The squares come in two sizes, chosen
 * by fit and by the style sheet alone: large while every week fits the place the grid stands in,
 * small once they do not. For that the grid must stand inside a box that is a size container
 * (`container-type: inline-size`); whatever shares its row says how wide it is in `--beside`.
 * Wider than its place even when small, it opens on the newest weeks and scrolls sideways.
 */
export function Heat({ days, chosen, onChoose, label, say, weekdays, month, onOver }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Looked at after every layout and before the paint, so whoever can give the grid more room does so unseen.
  useLayoutEffect(() => {
    if (onOver && scroller.current && scroller.current.scrollWidth > scroller.current.clientWidth + 1) onOver();
  });
  if (!days.length) return null;
  const lead = weekdayOf(days[0]!.day);
  const at = onChoose ? Math.max(0, days.findIndex((d) => d.day === chosen)) : -1;
  const choose = (i: number) => {
    i = Math.min(days.length - 1, Math.max(0, i));
    onChoose!(days[i]!.day);
    // A day chosen by the keys may be one scrolled out of sight. Only the grid moves, never the page.
    const cell = grid.current!.children[i]!.getBoundingClientRect();
    const seen = scroller.current!.getBoundingClientRect();
    scroller.current!.scrollLeft += Math.min(0, cell.left - seen.left) + Math.max(0, cell.right - seen.right);
  };

  const key = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (step) choose(at + step);
    else if (event.key === 'Home') choose(0);
    else if (event.key === 'End') choose(days.length - 1);
    else return;
    event.preventDefault();
  };
  // A click, not a press: a finger that lands here to scroll the page chooses nothing.
  const point = (event: TargetedMouseEvent<HTMLDivElement>) => {
    const box = grid.current!.getBoundingClientRect();
    const weeks = Math.ceil((lead + days.length) / 7);
    const col = Math.floor(((event.clientX - box.left) / box.width) * weeks);
    const row = Math.floor(((event.clientY - box.top) / box.height) * 7);
    if (col >= 0 && col < weeks && row >= 0 && row < 7) choose(col * 7 + row - lead);
  };

  return (
    <div
      class={cx(css.heat, onChoose && css.pressed)}
      style={`--weeks:${Math.ceil((lead + days.length) / 7)}`}
      aria-label={label}
      {...(onChoose
        ? { role: 'slider', tabIndex: 0, 'aria-valuemin': 0, 'aria-valuemax': days.length - 1, 'aria-valuenow': at, 'aria-valuetext': say?.(days[at]!), onKeyDown: key, onClick: point }
        : { role: 'img' })}
    >
      <div class={css.rows} aria-hidden="true">
        {[0, 2, 4, 6].map((row) => (
          <span key={row} style={`grid-row:${row + 1} / ${Math.min(row + 3, 8)}`}>
            {weekdays[row]}
          </span>
        ))}
      </div>
      <div class={css.window} ref={scroller}>
        <div class={css.weeks}>
          <div class={css.months} aria-hidden="true">
            {days.map((d, i) =>
              // A month is named over the column its first day falls in. The month the record
              // starts in is named too, unless the next one begins so close that the two would touch.
              d.day.endsWith('-01') || (i === 0 && !days.slice(1, 21 - lead).some((next) => next.day.endsWith('-01'))) ? (
                <span key={d.day} style={`grid-column:${Math.floor((lead + i) / 7) + 1}`}>
                  {month(Number(d.day.slice(5, 7)) - 1)}
                </span>
              ) : null,
            )}
          </div>
          <div class={css.cells} ref={grid} aria-hidden="true">
            {days.map((d, i) => (
              <i
                key={d.day}
                class={cx(css[`level${d.level}`], d.rest && css.rest, i === days.length - 1 && css.today, i === at && css.chosen)}
                style={i === 0 ? `grid-row:${lead + 1}` : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The key under a grid: the five steps and the rest mark, each with its words. */
export function HeatKey({ steps, rest }: { steps: string[]; rest: string }) {
  return (
    <p class={css.key}>
      {steps.map((words, level) => (
        <span key={words}>
          <i class={css[`level${level}`]} />
          {words}
        </span>
      ))}
      <span>
        <i class={cx(css.level0, css.rest)} />
        {rest}
      </span>
    </p>
  );
}
