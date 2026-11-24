import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import type { Focus } from '../../sync/focus.ts';
import type { Settings } from '../../sync/settings.ts';
import type { TaskView, Today } from '../../sync/today.ts';
import { Button } from '../kit/button.tsx';
import { Figures } from '../kit/figures.tsx';
import type { Figure } from '../kit/figures.tsx';
import { LapBar } from '../kit/lapbar.tsx';
import { Marks } from '../kit/marks.tsx';
import { QuickAdd } from '../kit/quick-add.tsx';
import { Said, useSaid } from '../kit/said.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { cx } from '../kit/cx.ts';
import { TaskRow } from '../kit/task-row.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
import { TaskSheet } from './task-sheet.tsx';
import css from './today.module.css';

// A row comes in over `motion.fill`. This long after a task is first seen, it has arrived.
const ARRIVING_MS = 1000;
// More laps than this in a day target and the bar would be dust.
const TARGET_MAX = 24;

type List = 'next' | 'later' | 'upcoming' | 'done';

export function TodayScreen({ focus, today, settings }: { focus: Focus; today: Today; settings: Settings }) {
  useTick(focus);
  const day = today.day.value;
  const next = today.next.value;
  const later = today.later.value;
  const upcoming = today.upcoming.value;
  const done = today.done.value;
  const deleted = today.deleted.value;
  const figures = today.figures();
  const state = focus.state.value;
  const view = focus.view();
  // A lap is counting or paused. Start is not offered then: it would end that lap.
  const inLap = state.phase === 'work' && !view.over;

  const [open, setOpen] = useState<string | null>(null);
  const [bin, setBin] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [targeting, setTargeting] = useState(false);
  const [said, setSaid] = useSaid();

  // Every task the screen shows. The running one is in `later`, in its place.
  const all = [next, ...later, ...upcoming, ...done].filter((task): task is TaskView => task !== null);
  // The rows the screen opened with are just there. A task added later arrives, once: at the
  // moment it is first seen, not again when it moves to another section.
  const settled = useRef(false);
  const seen = useRef(new Map<string, number>());
  for (const task of all) if (!seen.current.has(task.id)) seen.current.set(task.id, settled.current ? performance.now() : -Infinity);
  useEffect(() => void (settled.current = true), []);
  const opened = all.find((task) => task.id === open);
  // The open task went away, deleted here or on another device: its sheet must not come back
  // by itself when the task does.
  useEffect(() => {
    if (open && !opened) setOpen(null);
  }, [open, opened]);

  const add = (text: string) => {
    const id = today.add(text);
    if (!id) return false;
    const made = [today.next.value, ...today.later.value].find((task) => task?.id === id);
    if (made) setSaid({ lead: s.today.saidAdded, title: made.title, tail: made.estimate === null ? undefined : s.today.addedLaps(made.estimate), comma: made.estimate !== null, row: () => document.querySelector(`[data-task="${CSS.escape(id)}"]`)?.parentElement });
    return true;
  };

  const setDone = (task: TaskView, isDone: boolean) => {
    today.setDone(task.id, isDone);
    if (!isDone) return setSaid(null);
    // A repeating task has made its next one by now: say when that is, from the row itself.
    const series = task.id.replace(/-\d{8}$/, '');
    const again = task.repeat && today.upcoming.value.find((other) => other.id !== task.id && other.id.startsWith(`${series}-`));
    setSaid({ lead: s.today.saidDone, title: task.title, tail: again?.due ? s.today.comesBack(again.due, day) : undefined, undo: () => today.setDone(task.id, false) });
  };
  const remove = (task: TaskView) => {
    setOpen(null);
    today.remove(task.id);
    setSaid({ lead: s.today.saidRemoved, title: task.title, tail: s.today.keeps, undo: () => today.restore(task.id) });
  };

  // Today's open tasks in their true order. While the order is being changed the screen shows this
  // one list, so that Up and Down move a row exactly where they seem to: the Next card and the
  // list under it put the running task somewhere else than its place.
  const movable = today.list.value;
  const moves = (task: TaskView) => {
    const at = movable.findIndex((other) => other.id === task.id);
    return (
      // The first has no way up and the last no way down. Their buttons keep their place, unseen.
      <span class={css.moves}>
        <Button kind="link" aria-label={s.today.upLabel(task.title)} disabled={at === 0} onClick={() => today.move(task.id, movable[at - 1]!.id)}>
          {s.today.up}
        </Button>
        <Button kind="link" aria-label={s.today.downLabel(task.title)} disabled={at === movable.length - 1} onClick={() => today.move(task.id, movable[at + 2]?.id ?? null)}>
          {s.today.down}
        </Button>
      </span>
    );
  };

  // Where the focus goes when the sheet closes. The dialog hands it back to the row that opened
  // it; when that row has moved or gone, it is sent to the task's row where it now is, or, for a
  // task that is done or deleted, to the heading of the list it left.
  const from = useRef<{ id: string; list: List } | null>(null);
  useEffect(() => {
    const was = from.current;
    if (open || !was) return;
    from.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const stillOpen = [next, ...later, ...upcoming].some((task) => task?.id === was.id);
    const to =
      (stillOpen && document.querySelector<HTMLElement>(`[data-task="${CSS.escape(was.id)}"]`)) ||
      document.getElementById(`list-${was.list}`) ||
      document.getElementById('list-today');
    to?.focus();
  }, [open]);

  const row = (task: TaskView, list: List, extra: { next?: boolean; end?: ComponentChildren } = {}) => (
    <TaskRow
      key={task.id}
      task={task}
      of={s.today.of(task.estimate)}
      note={[task.due && task.due !== day ? s.today.due(task.due, day) : '', task.when ?? ''].filter(Boolean).join(', ')}
      checkLabel={s.today.check(task.title)}
      onDone={(isDone) => setDone(task, isDone)}
      onOpen={() => {
        from.current = { id: task.id, list };
        setOpen(task.id);
      }}
      next={extra.next}
      arriving={performance.now() - seen.current.get(task.id)! < ARRIVING_MS}
      end={ordering && list !== 'upcoming' && list !== 'done' ? moves(task) : extra.end}
    />
  );

  const strip: Figure[] = [
    { label: s.today.done, figure: s.total(figures.done_ms), note: s.today.laps(figures.laps), yours: true },
    { label: s.today.planned, figure: s.total(figures.left_ms), note: s.today.laps(figures.left_laps) },
  ];
  // On a first day there is no past you to show, and no hole where it would be.
  if (figures.ghost) {
    strip.push({ label: s.today.ghostDay(figures.ghost.day, day), figure: s.total(figures.ghost.total_ms), note: s.today.laps(figures.ghost.laps) });
  }

  const isBreak = state.phase === 'short' || state.phase === 'long';
  // The bell has gone on a lap and its break has not been started.
  const rung = state.phase === 'work' && view.over;
  const running = today.running.value;
  const leftInLater = later.reduce((sum, task) => sum + Math.max(0, (task.estimate ?? 0) - task.laps), 0);

  return (
    <div class={css.today}>
      <div class={css.summary}>
      <header class={css.head}>
        <h1 id="list-today" tabIndex={-1}>
          {s.today.title}
        </h1>
        <p>{s.today.date(day)}</p>
      </header>

      <Figures items={strip} />

      <section class={css.target} aria-label={s.today.target}>
        {figures.target > 0 ? (
          <>
            <LapBar done={figures.laps} of={figures.target} />
            <p>
              {s.today.targetAt(figures.laps, figures.target)}
              {!targeting && (
                <Button kind="link" onClick={() => setTargeting(true)}>
                  {s.today.targetChange}
                </Button>
              )}
            </p>
          </>
        ) : (
          <p>
            {s.today.targetNone}
            <Button
              kind="link"
              onClick={() => {
                // What is on the list is the plan for the day; with no list, one set of four.
                today.setTarget(Math.min(TARGET_MAX, figures.laps + figures.left_laps || 4));
                setTargeting(true);
              }}
            >
              {s.today.targetSet}
            </Button>
          </p>
        )}
        {targeting && figures.target > 0 && (
          <div class={css.targeting}>
            <Stepper
              text={s.today.targetText(figures.target)}
              less={s.today.targetLess}
              more={s.today.targetMore}
              onLess={() => today.setTarget(Math.max(1, figures.target - 1))}
              onMore={() => today.setTarget(Math.min(TARGET_MAX, figures.target + 1))}
            />
            <Button kind="link" onClick={() => setTargeting(false)}>
              {s.today.targetKeep}
            </Button>
            <Button
              kind="link"
              onClick={() => {
                today.setTarget(0);
                setTargeting(false);
              }}
            >
              {s.today.targetClear}
            </Button>
          </div>
        )}
      </section>

      </div>

      <div class={css.cols}>
        <div class={css.now}>
          <QuickAdd name="task" label={s.today.add} hint={s.today.addHint} onAdd={add} />

          {state.phase !== 'idle' && !(isBreak && view.over) && (
            <div class={css.bar}>
              <i class={isBreak ? css.rest : undefined} />
              <a href="#/focus" aria-label={s.today.toFocus}>
                {rung ? (
                  <span class={css.rung}>{s.today.lapDone(state.set_index + 1)}</span>
                ) : (
                  <>
                    <b>{s.clock(view.left_ms)}</b>
                    <span>{isBreak ? (state.phase === 'long' ? s.focus.longBreak : s.focus.shortBreak) : (running?.title ?? s.today.free)}</span>
                  </>
                )}
              </a>
              {/* Its button is an outline on the bar. When the lap has rung, the break is what comes
                  next, here as on Focus: its button takes the fill and the list's Start steps down. */}
              {rung ? (
                <Button kind="primary" onClick={() => focus.start()}>
                  {s.focus.startBreak(view.next.phase === 'long' ? focus.lengths.value.long_ms : focus.lengths.value.short_ms)}
                </Button>
              ) : view.paused ? (
                <Button class={css.onBar} onClick={() => focus.resume()}>
                  {s.focus.resume}
                </Button>
              ) : (
                !isBreak && (
                  <Button class={css.onBar} onClick={() => focus.pause()}>
                    {s.focus.pause}
                  </Button>
                )
              )}
            </div>
          )}

          {ordering ? (
            <section>
              <h2 class={css.sect} id="list-later" tabIndex={-1}>
                {s.today.ordering}
              </h2>
              <div class={css.rows}>{movable.map((task) => row(task, 'later', { next: task.id === next?.id }))}</div>
            </section>
          ) : (
            <>
              {next && (
                <section>
                  <h2 class={css.sect} id="list-next" tabIndex={-1}>
                    {s.today.next}
                  </h2>
                  {row(next, 'next', {
                    next: true,
                    // The one filled button of the screen. It starts a lap on this task, now, break or no break.
                    end: inLap ? undefined : (
                      <Button kind={rung ? 'secondary' : 'primary'} onClick={() => focus.skipBreak(next.id)}>
                        {s.today.start}
                      </Button>
                    ),
                  })}
                </section>
              )}

              {later.length > 0 && (
                <section>
                  <h2 class={css.sect} id="list-later" tabIndex={-1}>
                    {s.today.later}
                    <span>{s.today.laterCount(later.length, leftInLater)}</span>
                  </h2>
                  <div class={css.rows}>{later.map((task) => row(task, 'later'))}</div>
                </section>
              )}
            </>
          )}

          {movable.length > 1 && (
            <Button kind="link" onClick={() => setOrdering(!ordering)}>
              {ordering ? s.today.orderKeep : s.today.order}
            </Button>
          )}

          {!next && later.length === 0 && <p class={css.empty}>{done.length ? s.today.allDone : s.today.empty}</p>}

          {/* A task done inside its guess, a milestone reached from here: said once, for as long as an Undo lasts. */}
          <div class={css.foot}>
            <Marks settings={settings} say={s.mark} last={UNDO_MS} />
            {said && <Said said={said} undo={s.today.undo} onDone={() => setSaid(null)} />}
          </div>
        </div>

        <div class={css.then}>
          {upcoming.length > 0 && (
            <section>
              <h2 class={css.sect} id="list-upcoming" tabIndex={-1}>
                {s.today.upcoming}
              </h2>
              <div class={css.rows}>{upcoming.map((task) => row(task, 'upcoming'))}</div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h2 class={css.sect} id="list-done" tabIndex={-1}>
                {s.today.doneToday}
              </h2>
              <div class={css.rows}>{done.map((task) => row(task, 'done'))}</div>
            </section>
          )}
          {deleted.length > 0 && (
            <Button kind="link" onClick={() => setBin(true)}>
              {s.today.bin(deleted.length)}
            </Button>
          )}
        </div>
      </div>

      {opened && (
        <TaskSheet
          task={opened}
          today={today}
          onClose={() => setOpen(null)}
          onDone={() => setDone(opened, !opened.done)}
          onRemove={() => remove(opened)}
        />
      )}
      {bin && (
        <Sheet title={s.today.binTitle} close={s.task.close} onClose={() => setBin(false)}>
          <p class={css.binNote}>{s.today.binNote}</p>
          <div class={css.rows}>
            {deleted.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                of={s.today.of(task.estimate)}
                note={task.deleted === null ? undefined : s.today.gone(task.deleted)}
                end={
                  <Button kind="link" onClick={() => today.restore(task.id)}>
                    {s.today.restore}
                  </Button>
                }
              />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
