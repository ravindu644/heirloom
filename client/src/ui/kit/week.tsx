import type { WeekRace } from '../../sync/progress.ts';
import { cx } from './cx.ts';
import * as s from '../strings.ts';
import css from './week.module.css';

const HOUR = 3600000;
// The top of the scale is four even steps: the first of these that holds the larger total.
const STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25];
// Lower than this share of the plot's height, a figure under its dot would sit on the names of the days.
const FLOOR = 0.8;

/**
 * This week against last week, as two running totals drawn by hand: yours a solid line in you
 * that ends in a dot with its figure, last week's dashed in ghost with its total. The lines are
 * drawn in the data's own units and stretched to the plot, with strokes that do not stretch; the
 * words stand outside the drawing, so type keeps its size at every width. No fill, no legend.
 * A room's week gives `target`: the top line, ink, named at its end; and its own `label`.
 */
export function WeekChart({ week, today, target = 0, label }: { week: WeekRace; today: string; target?: number; label?: string }) {
  const most = Math.max(week.ghost_total_ms, week.you_ms, target, HOUR);
  const step = STEPS.find((hours) => hours * 4 * HOUR >= most) ?? Math.ceil(most / HOUR / 4);
  const top = step * 4 * HOUR;
  const y = (ms: number) => 1 - ms / top;
  const yours = week.days.flatMap((d, i) => (d.you_ms === null ? [] : [[i, d.you_ms] as const]));
  const last = yours.at(-1);
  const line = (points: (readonly [number, number])[]) => points.map(([i, ms]) => `${i},${y(ms)}`).join(' ');
  const ghost = week.ghost_total_ms > 0;

  return (
    <div class={cx(css.chart, target > 0 && css.targeted)} role="img" aria-label={label ?? s.progress.chart(week.you_ms, week.ghost_now_ms, week.ghost_total_ms)}>
      <div class={css.plot} aria-hidden="true">
        {target > 0 && (
          <i class={css.target} style={`top:${y(target) * 100}%`}>
            <span>{s.progress.target}</span>
          </i>
        )}
        {[0, 1, 2, 3, 4].map((k) => (
          <i key={k} class={css.grid} style={`bottom:${k * 25}%`}>
            <span>{s.progress.hours(k * step)}</span>
          </i>
        ))}
        <svg viewBox="0 0 6 1" preserveAspectRatio="none">
          {ghost && <polyline class={css.ghost} points={line(week.days.map((d, i) => [i, d.ghost_ms] as const))} />}
          {yours.length > 1 && <polyline class={css.you} points={line(yours)} />}
        </svg>
        {ghost && (
          <b class={css.ghostTotal} style={`top:${y(week.ghost_total_ms) * 100}%`}>
            {s.progress.total(week.ghost_total_ms)}
          </b>
        )}
        {last && (
          <>
            <i class={css.dot} style={`left:${(last[0] / 6) * 100}%;top:${y(last[1]) * 100}%`} />
            {/* The figure stands clear of the other line: over its dot when yours is the upper line
                or runs near the floor, under and to the right when it is the lower one. Under a
                minute there is no figure at all. */}
            {last[1] >= 60000 && (
              <b
                class={cx(css.yourTotal, (last[1] >= week.days[last[0]]!.ghost_ms || y(last[1]) > FLOOR) && css.over, last[0] === 0 && css.first, last[0] === 6 && css.last)}
                style={`left:${(last[0] / 6) * 100}%;top:${y(last[1]) * 100}%`}
              >
                {s.progress.total(last[1])}
              </b>
            )}
          </>
        )}
      </div>
      <div class={css.days} aria-hidden="true">
        {week.days.map((d, i) => (
          <span key={d.day} class={d.day === today ? css.today : undefined} style={`left:${(i / 6) * 100}%`}>
            {s.progress.weekdays[i]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * How the guesses held, week by week, in the chart's manner: laps run for each lap guessed, a
 * line at one, where a task took what was guessed. A week with nothing to go by is a gap in the
 * line, never a zero; a week that stands alone is a dot.
 */
export function Guesses({ weeks }: { weeks: { monday: string; ratio: number | null }[] }) {
  const top = Math.max(2, ...weeks.map((week) => week.ratio ?? 0));
  const y = (ratio: number) => 1 - ratio / top;
  const at = (i: number) => (i / Math.max(1, weeks.length - 1)) * 100;
  // The line breaks at every week without a ratio.
  const runs: [number, number][][] = [];
  weeks.forEach((week, i) => {
    if (week.ratio === null) return;
    if (i > 0 && weeks[i - 1]!.ratio !== null) runs.at(-1)!.push([i, week.ratio]);
    else runs.push([[i, week.ratio]]);
  });
  const last = runs.at(-1)?.at(-1);
  return (
    <div class={cx(css.chart, css.small)} role="img" aria-label={s.progress.guesses(weeks)}>
      <div class={css.plot} aria-hidden="true">
        <i class={css.grid} style={`bottom:${(1 / top) * 100}%`}>
          <span>{s.progress.guessed}</span>
        </i>
        <svg viewBox={`0 0 ${Math.max(1, weeks.length - 1)} 1`} preserveAspectRatio="none">
          {runs.map((run) => run.length > 1 && <polyline key={run[0]![0]} class={css.you} points={run.map(([i, ratio]) => `${i},${y(ratio)}`).join(' ')} />)}
        </svg>
        {runs.map((run) => run.length === 1 && run[0] !== last && <i key={run[0]![0]} class={cx(css.dot, css.lone)} style={`left:${at(run[0]![0])}%;top:${y(run[0]![1]) * 100}%`} />)}
        {last && (
          <>
            <i class={css.dot} style={`left:${at(last[0])}%;top:${y(last[1]) * 100}%`} />
            <b class={cx(css.yourTotal, css.over, css.last)} style={`left:${at(last[0])}%;top:${y(last[1]) * 100}%`}>
              {s.progress.ratioFigure(last[1])}
            </b>
          </>
        )}
      </div>
      <div class={css.days} aria-hidden="true">
        <span class={css.start}>{s.progress.from(weeks[0]!.monday)}</span>
        <span class={css.end}>{s.progress.thisWeek}</span>
      </div>
    </div>
  );
}
