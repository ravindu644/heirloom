import { useEffect, useState } from 'preact/hooks';
import type { Focus } from '../../sync/focus.ts';
import type { Progress } from '../../sync/progress.ts';
import { Dots } from '../kit/dots.tsx';
import { Heat, HeatKey } from '../kit/heat.tsx';
import { Laps } from '../kit/laps.tsx';
import { Panel } from '../kit/panel.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
import { Day } from './day.tsx';
import css from './progress.module.css';
import { Guesses, WeekChart } from './week.tsx';

const MIN = 60000;
const YEAR_DAYS = 371;

/** True from the width where the sidebar and the rail fit side by side. */
function useWide() {
  const query = matchMedia('(min-width: 1280px)');
  const [wide, setWide] = useState(query.matches);
  useEffect(() => {
    const change = () => setWide(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return wide;
}

/**
 * The record. It opens with a finding, not a title: how this week stands against the last one
 * and what closes the gap. Under it the evidence, most recent first: the week, the streak, the
 * days since the first lap, one day hour by hour, then where the time went and how the guesses
 * held. On a phone they stack in that order: what changes every lap on top, what a person
 * studies once a week at the foot.
 */
export function ProgressScreen({ focus, progress }: { focus: Focus; progress: Progress }) {
  useTick(focus);
  const week = progress.week();
  const streak = progress.streak.value;
  const since = progress.since.value;
  const bests = progress.bests.value;
  const estimates = progress.estimates.value;
  const shares = progress.projects();
  const today = progress.today.value;
  const [chosen, setChosen] = useState<string | null>(null);
  const day = chosen ?? today;

  // The finding. Level and ahead are said from the two totals as they are shown, in whole
  // minutes; laps to draw level come from the true gap and the lap being run now.
  const state = focus.state.value;
  const view = focus.view();
  const inLap = state.phase === 'work' && !view.over;
  const work = focus.lengths.value.work_ms;
  const shown = (Math.floor(week.you_ms / MIN) - Math.floor(week.ghost_now_ms / MIN)) * MIN;
  const gap = -(week.split_ms ?? 0);
  const after = gap - (inLap ? view.left_ms : 0);
  const behind = Math.max(1, Math.ceil(gap / work));
  const finding =
    week.split_ms === null || week.ghost_total_ms === 0
      ? [s.progress.firstWeek(week.you_ms)]
      : shown === 0
        ? [s.progress.level, s.progress.ghostEnded(week.ghost_total_ms)]
        : shown > 0
          ? [s.progress.ahead(shown), week.you_ms - week.ghost_total_ms >= MIN ? s.progress.pastAll : s.progress.ghostEnded(week.ghost_total_ms)]
          : // Behind, the second sentence is never the same number again: while a lap runs it is what
            // this lap does about it, otherwise what last week ended on.
            [s.progress.behind(behind), !inLap ? s.progress.ghostEnded(week.ghost_total_ms) : after < MIN ? s.progress.closeNow : s.progress.closeWith(Math.max(1, Math.ceil(after / work)))];

  const rest = streak.recent.findLast((d) => d.state === 'rest');
  const open = streak.recent.at(-1)?.state === 'open';
  const most = Math.max(1, ...shares.map((share) => Math.max(share.focus_ms, share.before_ms)));
  // The grid is a year's: older days still count in the totals beside it.
  const cells = since.cells.slice(-YEAR_DAYS);
  const cell = (d: string) => cells.find((c) => c.day === d);

  // With a sidebar and room, the panels stand in two columns, and the page is written in that
  // order; on a phone it is written in the order it is read there. Either way a screen reader
  // hears what a sighted person sees first.
  const two = useWide();
  // A year that outgrows its half of the canvas takes the canvas's whole width. Once it has, it
  // keeps it: at that width it fits, and asking again would send it back.
  const [wide, setWide] = useState(false);

  const weekPanel = (
    <Panel title={week.ghost_total_ms > 0 ? s.progress.week : s.progress.weekAlone}>
      <WeekChart week={week} today={today} />
      <p class={css.quiet}>{week.ghost_total_ms > 0 ? s.progress.byNow(week.ghost_now_ms, today) : s.progress.noLastWeek}</p>
    </Panel>
  );

  const count = String(streak.missed ? streak.kept : streak.streak);
  const streakPanel = (
    <Panel title={s.progress.streak}>
      {/* After a miss the screen counts the days kept, and says nothing of the one that was not. */}
      <p class={css.count}>
        <b style={`--bearing:var(--layout-figure-bearing-${count.charAt(0)})`}>{count}</b>
        {streak.missed ? s.progress.ofLast(streak.of) : s.progress.inARow(streak.streak)}
      </p>
      <Dots
        days={streak.recent.map((d) => d.state)}
        label={s.progress.dots(streak.recent.filter((d) => d.state === 'kept').length, streak.recent.filter((d) => d.state === 'rest').length)}
      />
      <p>{streak.kept === 0 ? s.progress.streakStart : open ? s.progress.todayOpen : rest ? s.progress.restDay(rest.day) : s.progress.restKeeps}</p>
      {(bests.day || bests.week) && (
        <div class={css.bests}>
          <h3>{s.progress.bests}</h3>
          <dl>
            {bests.day && (
              <div>
                <dt>{s.progress.longestDay}</dt>
                <dd>
                  <b>{s.total(bests.day.focus_ms)}</b>
                  {s.progress.on(bests.day.day)}
                </dd>
              </div>
            )}
            {bests.week && (
              <div>
                <dt>{s.progress.bestWeek}</dt>
                <dd>
                  <b>{s.total(bests.week.focus_ms)}</b>
                  {s.progress.from(bests.week.monday)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </Panel>
  );

  const yearPanel = (
    <div class={css.year}>
      <Panel title={s.progress.since}>
        {cells.length === 0 ? (
          <p class={css.quiet}>{s.progress.noYear}</p>
        ) : (
          <>
            <div class={css.since}>
              <div class={css.heat}>
                <Heat
                  days={cells}
                  chosen={day}
                  onChoose={setChosen}
                  label={s.progress.year}
                  say={(c) => s.progress.cell(c.day, cell(c.day)?.focus_ms ?? 0, cell(c.day)?.laps ?? 0, c.rest)}
                  weekdays={s.progress.rowNames}
                  month={s.progress.month}
                  onOver={two ? () => setWide(true) : undefined}
                />
                {/* The chosen day in words, for eyes too: a square says how much, not what. */}
                <p class={css.said} aria-hidden="true">
                  {s.progress.cell(day, cell(day)?.focus_ms ?? 0, cell(day)?.laps ?? 0, cell(day)?.rest ?? false)}
                </p>
                <HeatKey steps={s.progress.key} rest={s.progress.keyRest} />
              </div>
              <dl class={css.totals}>
                <div>
                  <dt>{s.total(since.focus_ms)}</dt>
                  <dd>{s.progress.ofFocus(since.laps)}</dd>
                </div>
                <div>
                  <dt>{s.progress.keptOf(since.kept, since.of)}</dt>
                  <dd>{s.progress.daysKept}</dd>
                </div>
                {since.steadiest && (
                  <div>
                    <dt>{s.progress.steadiest(since.steadiest.weekday)}</dt>
                    <dd>{s.progress.steadiestNote(since.steadiest.kept, since.steadiest.of)}</dd>
                  </div>
                )}
              </dl>
            </div>
            {cells.length === 1 && <p class={css.quiet}>{s.progress.firstSquare}</p>}
          </>
        )}
      </Panel>
    </div>
  );

  const dayPanel = <Day progress={progress} day={day} today={today} onToday={() => setChosen(null)} />;

  const projectsPanel = (
    <Panel title={s.progress.projects}>
      {shares.length === 0 ? (
        <p class={css.quiet}>{s.progress.noProjects}</p>
      ) : (
        <>
          <ul class={css.shares}>
            {shares.map((share) => (
              <li key={share.project?.id ?? ''}>
                <span class={css.name}>
                  {share.project && <i style={`background:var(--${share.project.color})`} />}
                  {share.project?.name ?? s.progress.noProject}
                </span>
                <b>{s.total(share.focus_ms)}</b>
                {/* The bar is ink, not the project's colour: red means you. The dashed mark is the seven days before. */}
                <span class={css.bar} aria-hidden="true">
                  <i style={`width:${(share.focus_ms / most) * 100}%`} />
                  {share.before_ms > 0 && <u style={`left:${(share.before_ms / most) * 100}%`} />}
                </span>
                <span class={css.line}>{s.progress.shareLine(share.laps, share.focus_ms, share.before_ms, share.all_ms)}</span>
              </li>
            ))}
          </ul>
          <p class={css.mark}>
            <u />
            {s.progress.before}
          </p>
        </>
      )}
    </Panel>
  );

  const estimatesPanel = (
    <Panel title={s.progress.estimates}>
      {estimates.ratio === null ? (
        <p class={css.quiet}>{s.progress.noEstimates}</p>
      ) : (
        <>
          <p>{s.progress.ratio(estimates.ratio)}</p>
          <Guesses weeks={estimates.weeks} />
          <ul class={css.tasks}>
            {estimates.tasks.map((task) => (
              <li key={task.id}>
                <span>{task.title}</span>
                <Laps laps={task.laps} estimate={task.estimate} of={s.today.of(task.estimate)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );

  return (
    <div class={css.progress}>
      <header class={css.head}>
        <p>{s.progress.weekOf(week.monday)}</p>
        <h1>{finding.join(' ')}</h1>
      </header>

      {!two ? (
        <div class={css.grid}>
          {weekPanel}
          {streakPanel}
          {yearPanel}
          {dayPanel}
          {projectsPanel}
          {estimatesPanel}
        </div>
      ) : wide ? (
        <div class={css.grid}>
          {weekPanel}
          {streakPanel}
          <div class={css.full}>{yearPanel}</div>
          <div class={css.col}>{dayPanel}</div>
          <div class={css.col}>
            {projectsPanel}
            {estimatesPanel}
          </div>
        </div>
      ) : (
        <div class={css.grid}>
          <div class={css.col}>
            {weekPanel}
            {yearPanel}
            {dayPanel}
          </div>
          <div class={css.col}>
            {streakPanel}
            {projectsPanel}
            {estimatesPanel}
          </div>
        </div>
      )}
    </div>
  );
}
