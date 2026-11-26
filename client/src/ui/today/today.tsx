import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import type { Engine } from '../../sync/engine.ts';
import type { Focus } from '../../sync/focus.ts';
import type { Settings } from '../../sync/settings.ts';
import type { TaskView, Today } from '../../sync/today.ts';
import { upNext } from '../../core/today.ts';
import { Button } from '../kit/button.tsx';
import { Figures } from '../kit/figures.tsx';
import { Fold, Kept } from '../kit/fold.tsx';
import { stopSaid } from '../focus/stopped.ts';
import { picked } from '../focus/choice.ts';
import { focusRow, hasMoved, useLift } from '../kit/lift.ts';
import type { Carry } from '../kit/lift.ts';
import type { Figure } from '../kit/figures.tsx';
import { LapBar } from '../kit/lapbar.tsx';
import links from '../kit/links.module.css';
import { Marks } from '../kit/marks.tsx';
import { QuickAdd } from '../kit/quick-add.tsx';
import { say } from '../kit/said.tsx';
import { Twice } from '../kit/twice.tsx';
import said from '../kit/said.module.css';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { cx } from '../kit/cx.ts';
import { TaskRow } from '../kit/task-row.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
import { TaskSheet } from './task-sheet.tsx';
import css from './today.module.css';

// More laps than this in a day target and the bar would be dust.
const TARGET_MAX = 24;

type List = 'next' | 'later' | 'upcoming' | 'done';

export function TodayScreen({ engine, focus, today, settings, app, onReminderSet }: { engine: Engine; focus: Focus; today: Today; settings: Settings; app?: boolean; onReminderSet?: () => void }) {
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
  const [targeting, setTargeting] = useState(false);
  // The editor is open only while there is a target to edit. One taken away on another device
  // closes it here, and the way to set one is offered again; it does not come back open by
  // itself when a target is set elsewhere later.
  const editing = targeting && figures.target > 0;
  useEffect(() => {
    if (!figures.target) setTargeting(false);
  }, [figures.target]);

  // Every task the screen shows. The running one is in `later`, in its place.
  const all = [next, ...later, ...upcoming, ...done].filter((task): task is TaskView => task !== null);
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
    if (made) say({ lead: s.today.saidAdded, title: made.title, tail: made.estimate === null ? undefined : s.today.addedLaps(made.estimate), comma: made.estimate !== null });
    return true;
  };

  const setDone = (task: TaskView, isDone: boolean) => {
    // Ticking the task a lap is running on ends that lap too: the bar says both, and its one
    // Undo unticks the task, which puts the lap back as well.
    const onIt = isDone && state.phase === 'work' && state.task === task.id && !view.over;
    today.setDone(task.id, isDone);
    if (!isDone) return say(null);
    // The stop as the core recorded it, in the words Focus has for it: a lap by the day's count, yesterday's as that, a start taken back as that.
    const stop = onIt ? focus.lastStop.peek() : null;
    const lapEnds = !stop ? undefined : stop.phase === 'work' && !stop.counted ? s.today.noLap : stopSaid(stop, today.figures().laps, engine.now());
    // A repeating task has made its next one by now: say when that is, from the row itself.
    const series = task.id.replace(/-\d{8}$/, '');
    const again = task.repeat && today.upcoming.value.find((other) => other.id !== task.id && other.id.startsWith(`${series}-`));
    say({ lead: s.today.saidDone, title: task.title, tail: lapEnds ?? (again?.due ? s.today.comesBack(again.due, day) : undefined), undo: () => today.setDone(task.id, false) });
  };
  const remove = (task: TaskView) => {
    setOpen(null);
    today.remove(task.id);
    say({ lead: s.today.saidRemoved, title: task.title, tail: s.today.keeps, undo: () => today.restore(task.id) });
  };

  // The open tasks are one list to the hand: today's in their true order (the first that is not
  // running is the Next card, the rest follow under "Later"), then Upcoming under its heading,
  // which is the edge between them. A row is set down before the row that then follows it.
  const movable = today.list.value;
  const lists = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState('');
  // Where the row in the hand would land, while it is carried.
  const [carry, setCarry] = useState<Carry>(null);
  // A row set down as Next is what Focus's Start begins too: a task chosen on Focus earlier (the
  // one the last lap was on) gives way, or two screens would offer two tasks. While a lap runs
  // the choice is for the lap after it, and stays.
  const followNext = (id: string) => {
    if (today.next.peek()?.id === id && !inLap) picked.value = null;
  };
  useLift(
    lists,
    (id, before) => {
    const ahead = upcoming.find((task) => task.id === id);
    // Set down over the edge, or before one of today's rows: a row out of Upcoming is for today.
    const intoToday = !!ahead && (before === '' || movable.some((task) => task.id === before));
    if (intoToday) {
      const was = today.moveToToday(id, before || null);
      followNext(id);
      // The bar says so, to eyes and to a screen reader: the day it has now, the day it had as its row showed it, and the way back.
      const undo = () => {
        today.moveBack(id, was!);
        // The Undo that was pressed goes with the bar: the focus goes back with the row, to its words in Upcoming.
        (document.activeElement as HTMLElement | null)?.blur();
        if (lists.current) focusRow(lists.current, id, (controls) => controls.find((one) => one.dataset.task));
      };
      if (was) say({ lead: '', title: s.today.nowToday, tail: ahead.due ? s.today.wasDue(s.today.due(ahead.due, day)) : undefined, undo });
      return;
    }
    // Within today's rows the edge is their end; within Upcoming there is no edge under a row.
    today.move(id, before || null);
    followNext(id);
    const list = (ahead ? upcoming : movable).filter((task) => task.id !== id);
    const at = before ? list.findIndex((task) => task.id === before) : list.length;
    setPlaced(s.today.nowAt([...movable, ...upcoming].find((task) => task.id === id)?.title ?? '', at + 1, list.length + 1));
    },
    // A row of today let go inside Upcoming, or stepped at it with the keys: it stays, and the bar says why.
    () => say({ lead: '', title: s.today.staysToday }),
    setCarry,
  );
  // The list answers before the release: what is Next, and what Later holds, as they will be once
  // the row in the hand is let go. The rows stay in their lists until then; the hand moves them.
  const lapOn = today.running.value?.id ?? null;
  const shown = (() => {
    const open = [...movable, null, ...upcoming];
    const moving = carry && open.find((task) => task?.id === carry.id);
    if (!carry || !moving) return { next, later, upcoming };
    const rest = open.filter((task) => task !== moving);
    // Before a row, before the edge between today and Upcoming (''), or at the very end (null).
    const at = carry.before === null ? -1 : rest.findIndex((task) => (carry.before === '' ? task === null : task?.id === carry.before));
    rest.splice(at < 0 ? rest.length : at, 0, moving);
    return { ...upNext(rest.slice(0, rest.indexOf(null)) as TaskView[], lapOn), upcoming: rest.slice(rest.indexOf(null) + 1) };
  })();

  // Recently deleted closes with its last row.
  useEffect(() => {
    if (bin && deleted.length === 0) setBin(false);
  }, [bin, deleted.length]);

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
    // Without a scroll: the page stays where the person left it.
    to?.focus({ preventScroll: true });
  }, [open]);

  // The Next card's look: its outline, and its Start, the one filled button of the screen, which
  // starts a lap on this task now, break or no break. It goes to a carried row the moment the row
  // is over the top place.
  const look = (task: TaskView): { next?: boolean; end?: ComponentChildren } =>
    task.id !== shown.next?.id
      ? {}
      : {
          next: true,
          end: inLap ? undefined : (
            <Button kind={rung ? 'secondary' : 'primary'} onClick={() => focus.skipBreak(task.id)}>
              {s.today.start}
            </Button>
          ),
        };

  // An Upcoming row carried up among today's is due today once let go, and says so already.
  const comingToday = (task: TaskView) => carry?.id === task.id && [shown.next, ...shown.later].includes(task);

  const row = (task: TaskView, list: List, extra: { next?: boolean; end?: ComponentChildren } = {}) => (
    <TaskRow
      key={task.id}
      task={task}
      of={s.today.of(task.estimate)}
      note={[task.due && task.due !== day && !comingToday(task) ? s.today.due(task.due, day) : '', task.time ?? '', task.subtasks.length ? s.today.subtasks(task.subtasks.filter((sub) => sub.done).length, task.subtasks.length) : ''].filter(Boolean).join(', ')}
      checkLabel={s.today.check(task.title)}
      onDone={(isDone) => setDone(task, isDone)}
      onOpen={() => {
        from.current = { id: task.id, list };
        setOpen(task.id);
      }}
      next={extra.next}
      end={extra.end}
      lift={list !== 'done'}
    />
  );

  const loose = [next, ...later].filter((task) => task && task.estimate === null).length;
  const strip: Figure[] = [
    { label: s.today.done, figure: s.total(figures.done_ms), note: s.today.laps(figures.laps), yours: true },
    // Open tasks with no estimate are not in the laps: the small line says how many there are.
    { label: s.today.planned, figure: s.total(figures.left_ms), note: loose ? s.today.plannedWith(figures.left_laps, loose) : s.today.laps(figures.left_laps) },
  ];
  // On a first day there is no past you to show, and no hole where it would be.
  if (figures.ghost) {
    strip.push({ label: s.today.ghostDay(figures.ghost.day, day), figure: s.total(figures.ghost.total_ms), note: s.today.laps(figures.ghost.laps) });
  }

  const isBreak = state.phase === 'short' || state.phase === 'long';
  // The bell has gone on a lap and its break has not been started.
  const rung = state.phase === 'work' && view.over;
  const running = today.running.value;
  // A lap for a task that is not in today's open list (done since, due another day) is still a
  // lap for that task: it is named from the task's own row, as Focus names it.
  const lapRow = state.task ? engine.rows('task').value.get(state.task) : undefined;
  const named = typeof lapRow?.title === 'string' ? lapRow.title : undefined;
  const leftInLater = shown.later.reduce((sum, task) => sum + Math.max(0, (task.estimate ?? 0) - task.laps), 0);

  return (
    <div class={cx(css.today, said.room)}>
      <div class={css.summary}>
      <header class={css.head}>
        <h1 id="list-today" tabIndex={-1}>
          {s.today.title}
        </h1>
        <p>{s.today.date(day)}</p>
        {/* Where a row now stands, for a screen reader, after the keyboard moved it. */}
        <p class="sr" role="status">
          {placed}
        </p>
      </header>

      <Figures items={strip} />

      {/* The bar, its words, and the editor that opens in place under them: each has its own place. */}
      <Fold class={css.target} role="group" aria-label={s.today.target}>
        {figures.target > 0 && (
          <div key="bar" class={css.lane}>
            {/* The lap running fills its segment as it runs, as on Focus: Today is drawn again on every tick. */}
            <LapBar fills={figures.fills} of={figures.target} share={figures.open ?? 0} />
          </div>
        )}
        <p key="words">
          {figures.target > 0 ? s.today.targetAt(figures.laps, figures.target) : s.today.targetNone}
          {!editing && (
            <Button
              kind="link"
              onClick={() => {
                // What is on the list is the plan for the day; with no list, one set of four.
                if (!figures.target) today.setTarget(Math.min(TARGET_MAX, figures.laps + figures.left_laps || 4));
                setTargeting(true);
              }}
            >
              {figures.target > 0 ? s.today.targetChange : s.today.targetSet}
            </Button>
          )}
        </p>
        {editing && (
          <div key="editor" class={css.targeting}>
            <div>
              <span id="target-label">{s.today.targetLabel}</span>
              <div role="group" aria-labelledby="target-label">
                <Stepper
                  text={s.today.targetText(figures.target)}
                  less={s.today.targetLess}
                  more={s.today.targetMore}
                  onLess={() => today.setTarget(Math.max(1, figures.target - 1))}
                  onMore={() => today.setTarget(Math.min(TARGET_MAX, figures.target + 1))}
                  top={figures.target >= TARGET_MAX}
                  floor={figures.target <= 1}
                />
                {/* Every tap of the stepper is already kept: this only closes. */}
                <Button onClick={() => setTargeting(false)}>{s.today.targetKeep}</Button>
              </div>
            </div>
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
      </Fold>

      </div>

      <div>
      <div class={css.cols} ref={lists}>
        {/* The field and the lap's strip stand over the lists, apart from them: on a laptop "Done" starts level with "Next", not with the field. */}
        <div class={css.left}>
        <Fold gap="md">
          <QuickAdd key="add" name="task" label={s.today.add} hint={s.today.addHint} example={s.today.addExample} go={s.today.addGo} said onAdd={add} />

          {state.phase !== 'idle' && !(isBreak && view.over) && (
            <div key="bar" class={css.bar}>
              <i class={isBreak ? css.rest : undefined} />
              <a href="#/focus" aria-label={s.today.toFocus}>
                {rung ? (
                  <span class={css.rung}>{s.today.lapDone}</span>
                ) : (
                  <>
                    <b>{s.clock(view.left_ms)}</b>
                    <span>{isBreak ? (state.phase === 'long' ? s.focus.longBreak : s.focus.shortBreak) : (running?.title ?? named ?? s.today.free)}</span>
                  </>
                )}
              </a>
              {/* Its button is an outline on the bar. When the lap has rung, the break is what comes
                  next, here as on Focus: its button takes the fill and the list's Start steps down. */}
              {rung ? (
                <Button kind="primary" onClick={() => focus.start()}>
                  {/* The break a lap on this task has earned: the task's own length where it has one. */}
                  {s.focus.startBreak(focus.lengthsFor(state.task)[view.next.phase === 'long' ? 'long_ms' : 'short_ms'])}
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
        </Fold>

        <Fold gap="md" class={css.open} data-said>
          {next && (
            <section key="next">
              <h2 class={css.sect} id="list-next" tabIndex={-1} data-lift-head="0">
                {s.today.next}
              </h2>
              <Fold>{row(next, 'next', look(next))}</Fold>
            </section>
          )}
          {/* From what the list will be: a row carried up from Upcoming over the only task of today
              brings the heading in while it is held, over the task it pushes down. */}
          {shown.later.length > 0 && (
            <section key="later">
              {/* It stands over whichever row is first under Next, and moves with it while a row is carried. */}
              <h2 class={css.sect} id="list-later" tabIndex={-1} data-lift-head={next ? 1 : 0}>
                {s.today.later}
                <span>{s.today.laterCount(shown.later.length, leftInLater)}</span>
              </h2>
              <Fold gap="sm">{later.map((task) => row(task, 'later', look(task)))}</Fold>
            </section>
          )}

          {!next && later.length === 0 && (
            <p key="empty" class={css.empty}>
              {done.length ? s.today.allDone : s.today.empty}
            </p>
          )}

          {/* Under today's rows in the same column, so the open tasks are one list to the hand
              at every width. Its heading is the edge: a row comes up over it, none goes down under it. */}
          {upcoming.length > 0 && (
            <section key="upcoming">
              {/* Its last row carried up into today, it fades: it goes when the row is let go. */}
              <h2 class={cx(css.sect, shown.upcoming.length === 0 && css.leaving)} id="list-upcoming" tabIndex={-1} data-lift-edge>
                {s.today.upcoming}
              </h2>
              <Fold gap="sm">{upcoming.map((task) => row(task, 'upcoming', look(task)))}</Fold>
            </section>
          )}

          {/* How rows are put in order, said once: until this device has moved one, and only where one can be. */}
          {(movable.length > 1 || upcoming.length > 0) && !hasMoved.value && (
            <p key="hint" class={css.hint}>
              {s.today.holdHint}
            </p>
          )}
          {deleted.length > 0 && (
            <div key="links" class={links.links}>
              {deleted.length > 0 && (
                <Button kind="link" onClick={() => setBin(true)}>
                  {s.today.bin(deleted.length)}
                </Button>
              )}
            </div>
          )}

        </Fold>
        </div>

        <Fold gap="md">
          {done.length > 0 && (
            <section key="done">
              <h2 class={css.sect} id="list-done" tabIndex={-1}>
                {s.today.doneToday}
              </h2>
              <Fold gap="sm">{done.map((task) => row(task, 'done'))}</Fold>
            </section>
          )}
        </Fold>
      </div>
      {/* A task done inside its guess, a milestone reached from here: said once, for as long as an
          Undo lasts. It stays in sight directly over the bar that says the task is done, wherever
          the list is scrolled: in the flow of the list it would lie under that bar. */}
      <div class={css.foot}>
        <Marks settings={settings} say={s.mark} last={UNDO_MS} />
      </div>
      </div>

      <Kept>
        {opened && (
          <TaskSheet
            task={opened}
            today={today}
            onClose={() => setOpen(null)}
            onDone={() => setDone(opened, !opened.done)}
            onRemove={() => remove(opened)}
            lengths={focus.lengths.value}
            app={app}
            onReminderSet={onReminderSet}
          />
        )}
        {bin && (
          <Sheet key="bin" title={s.today.binTitle} close={s.task.close} onClose={() => setBin(false)}>
            <p class={css.binNote}>{s.today.binNote}</p>
            <Fold gap="sm">
              {deleted.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  of={s.today.of(task.estimate)}
                  note={task.deleted === null ? undefined : s.today.gone(task.deleted)}
                  links={
                    <>
                      <Button kind="link" onClick={() => today.restore(task.id)}>
                        {s.today.restore}
                      </Button>
                      {/* It cannot be taken back, so it asks twice. */}
                      <Twice words={s.today.purge} ask={s.today.purgeAsk} onDo={() => today.purge(task.id)} />
                    </>
                  }
                />
              ))}
            </Fold>
          </Sheet>
        )}
      </Kept>
    </div>
  );
}
