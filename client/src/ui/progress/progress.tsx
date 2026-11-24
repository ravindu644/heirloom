import { useState } from 'preact/hooks';
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
import { WeekChart } from './week.tsx';

const MIN = 60000;

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
  const today = progress.lookBack().day;
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
  const finding =
    week.split_ms === null || week.ghost_total_ms === 0
      ? [s.progress.firstWeek(week.you_ms)]
      : shown === 0
        ? [s.progress.level, s.progress.ghostEnded(week.ghost_total_ms)]
        : shown > 0
          ? [s.progress.ahead(shown), week.you_ms - week.ghost_total_ms >= MIN ? s.progress.pastAll : s.progress.ghostEnded(week.ghost_total_ms)]
          : [s.progress.behind(Math.max(1, Math.ceil(gap / work))), inLap && after < MIN ? s.progress.closeNow : s.progress.close(Math.max(1, Math.ceil(after / work)))];

  const rest = streak.recent.findLast((d) => d.state === 'rest');
  const open = streak.recent.at(-1)?.state === 'open';
  const most = Math.max(1, ...shares.map((share) => Math.max(share.focus_ms, share.before_ms)));
  const cells = since.cells;
  const cell = (d: string) => cells.find((c) => c.day === d);

  return (
    <div class={css.progress}>
      <header class={css.head}>
        <p>{s.progress.weekOf(week.monday)}</p>
        <h1>{finding.join(' ')}</h1>
      </header>

      <div class={css.grid}>
        <div class={css.wide}>
          <div class={css.week}>
            <Panel title={s.progress.week}>
              <WeekChart week={week} today={today} />
              <p class={css.quiet}>{week.ghost_total_ms > 0 ? s.progress.byNow(week.ghost_now_ms, today) : s.progress.noLastWeek}</p>
            </Panel>
          </div>

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

          <div class={css.day}>
            <Day progress={progress} day={day} today={today} onToday={() => setChosen(null)} />
          </div>
        </div>

        <div class={css.side}>
          <div class={css.streak}>
            <Panel title={s.progress.streak}>
              {/* After a miss the screen counts the days kept, and says nothing of the one that was not. */}
              <p class={css.count}>
                <b>{streak.missed ? streak.kept : streak.streak}</b>
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
          </div>

          <div class={css.projects}>
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
                        <span class={css.line}>{s.progress.shareLine(share.laps, share.focus_ms, share.before_ms)}</span>
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
          </div>

          <div class={css.estimates}>
            <Panel title={s.progress.estimates}>
              {estimates.ratio === null ? (
                <p class={css.quiet}>{s.progress.noEstimates}</p>
              ) : (
                <>
                  <p>{s.progress.ratio(estimates.ratio)}</p>
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
          </div>
        </div>
      </div>
    </div>
  );
}
