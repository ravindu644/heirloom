import type { ComponentChildren, TargetedSubmitEvent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Focus } from '../../sync/focus.ts';
import type { TaskView, Today } from '../../sync/today.ts';
import { Button } from '../kit/button.tsx';
import { Figures } from '../kit/figures.tsx';
import type { Figure } from '../kit/figures.tsx';
import { LapBar } from '../kit/lapbar.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { TaskRow } from '../kit/task-row.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
import { TaskSheet } from './task-sheet.tsx';
import css from './today.module.css';

// How long the line about the last tap, and its Undo, stay.
const SAID_MS = 8000;
// More laps than this in a day target and the bar would be dust.
const TARGET_MAX = 24;

/** The line that says what the last tap did, with a way to take it back. */
interface Said {
  text: string;
  undo?: () => void;
}

export function TodayScreen({ focus, today }: { focus: Focus; today: Today }) {
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
  const [said, setSaid] = useState<Said | null>(null);
  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(() => setSaid(null), SAID_MS);
    return () => clearTimeout(timer);
  }, [said]);

  const all = [next, ...later, ...upcoming, ...done].filter((task): task is TaskView => task !== null);
  // The rows the screen opened with are just there. One that comes later arrives, once.
  const settled = useRef(false);
  const born = useRef(new Map<string, boolean>());
  for (const task of all) if (!born.current.has(task.id)) born.current.set(task.id, settled.current);
  useEffect(() => void (settled.current = true), []);
  const opened = all.find((task) => task.id === open);

  const add = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem('task') as HTMLInputElement;
    const id = today.add(field.value);
    if (!id) return;
    // Emptied and still focused: ready for the next line.
    field.value = '';
    const made = [today.next.value, ...today.later.value].find((task) => task?.id === id);
    if (made) setSaid({ text: s.today.added(made.title, made.estimate) });
  };

  const setDone = (task: TaskView, isDone: boolean) => {
    today.setDone(task.id, isDone);
    if (!isDone) return setSaid(null);
    // A repeating task has made its next one by now: say when that is, from the row itself.
    const series = task.id.replace(/-\d{8}$/, '');
    const again = task.repeat && today.upcoming.value.find((other) => other.id !== task.id && other.id.startsWith(`${series}-`));
    setSaid({
      text: again?.due ? s.today.comesBack(task.title, again.due, day) : s.today.markedDone(task.title),
      undo: () => today.setDone(task.id, false),
    });
  };
  const remove = (task: TaskView) => {
    today.remove(task.id);
    setSaid({ text: s.today.removed(task.title), undo: () => today.restore(task.id) });
  };

  // The order is among the tasks that are not running: the running one is in the bar above.
  const movable = [next, ...later].filter((task): task is TaskView => task !== null && !task.running);
  const moves = (task: TaskView) => {
    const at = movable.indexOf(task);
    return (
      // The first has no way up and the last no way down. Their buttons keep their place, unseen.
      <span class={css.moves}>
        <Button kind="small" aria-label={s.today.upLabel(task.title)} disabled={at === 0} onClick={() => today.move(task.id, movable[at - 1]!.id)}>
          {s.today.up}
        </Button>
        <Button kind="small" aria-label={s.today.downLabel(task.title)} disabled={at === movable.length - 1} onClick={() => today.move(task.id, movable[at + 2]?.id ?? null)}>
          {s.today.down}
        </Button>
      </span>
    );
  };

  const row = (task: TaskView, extra: { next?: boolean; end?: ComponentChildren } = {}) => (
    <TaskRow
      key={task.id}
      task={task}
      of={s.today.of(task.estimate)}
      // Where a button takes the count's place, the count moves in beside the squares.
      note={[extra.end && !ordering ? `${task.laps}${s.today.of(task.estimate)}` : '', task.due && task.due !== day ? s.today.due(task.due, day) : '', task.when ?? ''].filter(Boolean).join(', ')}
      checkLabel={s.today.check(task.title)}
      onDone={(isDone) => setDone(task, isDone)}
      onOpen={() => setOpen(task.id)}
      next={extra.next}
      arriving={born.current.get(task.id)}
      end={ordering && !task.running && !task.done && movable.includes(task) ? moves(task) : extra.end}
    />
  );

  const strip: Figure[] = [
    { label: s.today.done, figure: s.total(figures.done_ms), note: s.today.laps(figures.laps), yours: true },
    { label: s.today.planned, figure: s.total(figures.left_ms), note: s.today.laps(figures.left_laps) },
  ];
  // On a first day there is no past you to show, and no hole where it would be.
  if (figures.ghost) {
    strip.push({ label: s.cap(s.pastDay(figures.ghost.day, day)), figure: s.total(figures.ghost.total_ms), note: s.today.laps(figures.ghost.laps) });
  }

  const isBreak = state.phase === 'short' || state.phase === 'long';
  const running = today.running.value;
  const leftInLater = later.reduce((sum, task) => sum + Math.max(0, (task.estimate ?? 0) - task.laps), 0);

  return (
    <div class={css.today}>
      <header class={css.head}>
        <h1>{s.today.title}</h1>
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
                <Button kind="small" onClick={() => setTargeting(true)}>
                  {s.today.targetChange}
                </Button>
              )}
            </p>
          </>
        ) : (
          <p>
            {s.today.targetNone}
            <Button
              kind="small"
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
              label={s.today.target}
              text={s.today.targetText(figures.target)}
              less={s.today.targetLess}
              more={s.today.targetMore}
              onLess={() => today.setTarget(Math.max(1, figures.target - 1))}
              onMore={() => today.setTarget(Math.min(TARGET_MAX, figures.target + 1))}
            />
            <Button kind="small" onClick={() => setTargeting(false)}>
              {s.today.targetKeep}
            </Button>
            <Button
              kind="small"
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

      <div class={css.cols}>
        <div class={css.now}>
          <form class={css.add} onSubmit={add}>
            <input name="task" aria-label={s.today.add} placeholder={s.today.addHint} autocomplete="off" enterkeyhint="done" />
          </form>

          {state.phase !== 'idle' && !(isBreak && view.over) && (
            <div class={css.bar}>
              <i class={isBreak ? css.rest : undefined} />
              <a href="#/focus" aria-label={s.today.toFocus}>
                {view.over ? (
                  <span>{s.today.lapDone(state.set_index + 1)}</span>
                ) : (
                  <>
                    <b>{s.clock(view.left_ms)}</b>
                    <span>{isBreak ? (state.phase === 'long' ? s.focus.longBreak : s.focus.shortBreak) : (running?.title ?? s.today.free)}</span>
                  </>
                )}
              </a>
              {view.over ? (
                <Button onClick={() => focus.start()}>{s.focus.startBreak(view.next.phase === 'long' ? focus.lengths.value.long_ms : focus.lengths.value.short_ms)}</Button>
              ) : view.paused ? (
                <Button onClick={() => focus.resume()}>{s.focus.resume}</Button>
              ) : (
                !isBreak && <Button onClick={() => focus.pause()}>{s.focus.pause}</Button>
              )}
            </div>
          )}

          {next && (
            <section>
              <h2 class={css.sect}>{s.today.next}</h2>
              {row(next, {
                next: true,
                // The one filled button of the screen. It starts a lap on this task, now, break or no break.
                end: inLap ? undefined : (
                  <Button kind="primary" onClick={() => focus.skipBreak(next.id)}>
                    {s.today.start}
                  </Button>
                ),
              })}
            </section>
          )}

          {later.length > 0 && (
            <section>
              <h2 class={css.sect}>
                {s.today.later}
                <span>{s.today.laterCount(later.length, leftInLater)}</span>
              </h2>
              <div class={css.rows}>{later.map((task) => row(task))}</div>
            </section>
          )}

          {movable.length > 1 && (
            <Button kind="small" onClick={() => setOrdering(!ordering)}>
              {ordering ? s.today.orderKeep : s.today.order}
            </Button>
          )}

          {!next && later.length === 0 && <p class={css.empty}>{done.length ? s.today.allDone : s.today.empty}</p>}
        </div>

        <div class={css.then}>
          {upcoming.length > 0 && (
            <section>
              <h2 class={css.sect}>{s.today.upcoming}</h2>
              <div class={css.rows}>{upcoming.map((task) => row(task))}</div>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h2 class={css.sect}>{s.today.doneToday}</h2>
              <div class={css.rows}>{done.map((task) => row(task))}</div>
            </section>
          )}
          {deleted.length > 0 && (
            <Button kind="small" onClick={() => setBin(true)}>
              {s.today.bin(deleted.length)}
            </Button>
          )}
        </div>
      </div>

      {said && (
        <p class={css.said} role="status">
          <span>{said.text}</span>
          {said.undo && (
            <Button
              onClick={() => {
                said.undo!();
                setSaid(null);
              }}
            >
              {s.today.undo}
            </Button>
          )}
        </p>
      )}

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
                end={
                  <Button kind="small" onClick={() => today.restore(task.id)}>
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
