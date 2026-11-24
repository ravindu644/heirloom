import type { WeekRace } from '../../sync/progress.ts';
import { cx } from '../kit/cx.ts';
import * as s from '../strings.ts';
import css from './week.module.css';

const HOUR = 3600000;
// The top of the scale is four even steps: the first of these that holds the larger total.
const STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25];

/**
 * This week against last week, as two running totals drawn by hand: yours a solid line in you
 * that ends in a dot with its figure, last week's dashed in ghost with its total. The lines are
 * drawn in the data's own units and stretched to the plot, with strokes that do not stretch; the
 * words stand outside the drawing, so type keeps its size at every width. No fill, no legend.
 */
export function WeekChart({ week, today }: { week: WeekRace; today: string }) {
  const most = Math.max(week.ghost_total_ms, week.you_ms, HOUR);
  const step = STEPS.find((hours) => hours * 4 * HOUR >= most) ?? Math.ceil(most / HOUR / 4);
  const top = step * 4 * HOUR;
  const y = (ms: number) => 1 - ms / top;
  const yours = week.days.flatMap((d, i) => (d.you_ms === null ? [] : [[i, d.you_ms] as const]));
  const last = yours.at(-1);
  const line = (points: (readonly [number, number])[]) => points.map(([i, ms]) => `${i},${y(ms)}`).join(' ');
  const ghost = week.ghost_total_ms > 0;

  return (
    <div class={css.chart} role="img" aria-label={s.progress.chart(week.you_ms, week.ghost_now_ms, week.ghost_total_ms)}>
      <div class={css.plot} aria-hidden="true">
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
            {/* The figure stands right of its dot, or left of it on the last day, where there is no room. */}
            {/* Under a minute there is no figure to stand beside the dot: it would sit on the days' names. */}
            {last[1] >= 60000 && (
              <b class={cx(css.yourTotal, last[0] === 6 && css.before)} style={`left:${(last[0] / 6) * 100}%;top:${y(last[1]) * 100}%`}>
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
