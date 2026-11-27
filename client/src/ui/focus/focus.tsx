import { useEffect, useRef, useState } from 'preact/hooks';
import type { TimerState, TimerView } from '../../core/timer.ts';
import type { Engine } from '../../sync/engine.ts';
import { EXTEND_MS } from '../../sync/focus.ts';
import { LAP_MAX_MS } from '../../sync/settings.ts';
import type { Focus, Race as RaceNow } from '../../sync/focus.ts';
import type { TaskView, Today } from '../../sync/today.ts';
import type { Rooms } from '../../sync/rooms.ts';
import type { Settings } from '../../sync/settings.ts';
import { Button } from '../kit/button.tsx';
import { Fold, Kept } from '../kit/fold.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { TaskRow } from '../kit/task-row.tsx';
import { cx } from '../kit/cx.ts';
import { LapBar } from '../kit/lapbar.tsx';
import { Marks } from '../kit/marks.tsx';
import { Square } from '../kit/square.tsx';
import { Panel } from '../kit/panel.tsx';
import { Race, SplitChip } from '../kit/race.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
import { followLaps, picked } from './choice.ts';
import { dayOf, stopSaid } from './stopped.ts';
import css from './focus.module.css';

// A bell this fresh was seen as it happened. Anything older is news from before the screen opened.
const LIVE_MS = 2000;


/** The lane lengths and the split, said the same way in the panel and in the result. */
function lanes(race: RaceNow, workMs: number, now: number) {
  // The lane is the ghost's whole day, so the empty part is what past you still went on to do.
  // With no ghost it is one set of four.
  const scale = Math.max(race.ghost?.total_ms ?? 4 * workMs, race.you_ms, 1);
  const day = race.ghost && s.pastDay(race.ghost.day, dayOf(now));
  // The split is between the two totals as they are shown, in whole minutes: a chip that said
  // 18 beside 2h 11m and 2h 30m would be arithmetic nobody can check.
  const MIN = 60000;
  const split = race.ghost ? (Math.floor(race.you_ms / MIN) - Math.floor(race.ghost.ms / MIN)) * MIN : 0;
  const text = s.race.split(split);
  return {
    day,
    you: { label: s.race.you, value: s.total(race.you_ms), share: race.you_ms / scale },
    // The second lane is named for the day it is, as Today names it: "Last Tue".
    ghost: race.ghost && { label: s.today.ghostDay(race.ghost.day, dayOf(now)), value: s.total(race.ghost.ms), share: race.ghost.ms / scale },
    split,
    chip: { text, tone: split === 0 ? 'level' : split < 0 ? 'behind' : 'ahead' } as const,
    // Laps that close the gap, were the ghost to stand still.
    // From the true gap, not the shown one: a second can decide whether this lap is enough.
    lapsBehind: (head = 0) => Math.max(0, Math.ceil((-(race.split_ms ?? 0) - head) / workMs)),
  };
}

// `inLap`: a lap is running, so finishing it moves today's race.
function RacePanel({ race, inLap, left, workMs, now }: { race: RaceNow; inLap: boolean; left: number; workMs: number; now: number }) {
  const l = lanes(race, workMs, now);
  const say = () => {
    if (!race.ghost || !l.day) return s.race.noGhost;
    if (l.chip.tone === 'level') return s.race.level;
    if (l.chip.tone === 'behind') return inLap ? s.race.closeInLap(l.lapsBehind(left)) : s.race.close(Math.max(1, l.lapsBehind()));
    // Past it by a whole minute, so the two totals on screen never read the same while the sentence says more.
    return race.you_ms - race.ghost.total_ms >= 60000 ? s.race.pastAll(l.day) : s.race.ghostFinished(l.day, race.ghost.total_ms);
  };
  return (
    <Panel title={l.day ? s.race.against(l.day) : s.race.today}>
      <Race you={l.you} ghost={l.ghost} />
      <p>
        {l.day && (
          <>
            <SplitChip {...l.chip} /> {s.race.at(now)}{' '}
          </>
        )}
        {say()}
      </p>
    </Panel>
  );
}

export function FocusScreen({ engine, focus, today, rooms, settings }: { engine: Engine; focus: Focus; today: Today; rooms: Rooms; settings: Settings }) {
  const redraw = useTick(focus);
  followLaps(focus, () => today.day.peek());
  const state: TimerState = focus.state.value;
  const view: TimerView = focus.view();
  const now = engine.now();
  const race = focus.race();

  const isBreak = state.phase === 'short' || state.phase === 'long';
  // A finished lap is a result while the break it earned is what comes next. Focus stops offering
  // the break when the lap rang on an earlier day: today's race has not begun.
  const result = state.phase === 'work' && view.over && view.next.phase !== 'work';
  // Ready: nothing is running, and the big digits show the lap a tap would start.
  const ready = view.over ? !result : state.phase === 'idle';
  // The timer's own set of four is on no screen. What it decides is said in its own terms: the
  // break this lap will earn, and after the fourth lap in a row the one sentence that marks it.
  const set = result && view.next.phase === 'long';
  const fig = today.figures();

  // The task this lap is for, and the one the next lap will be for. Starting needs no task: with
  // none next, a lap is for nothing in particular. One deleted while its lap runs keeps the lap,
  // and its name and project, for as long as it is in Recently deleted (the core's KEPT_MS).
  const tasks = [today.running.value, today.next.value, ...today.later.value, ...today.done.value, ...today.upcoming.value, ...today.deleted.value];
  const lapTask = (state.task && tasks.find((task) => task?.id === state.task)) || null;
  const nextTask = today.next.value;
  // The task the next lap is for: the one chosen here or the one the last lap was on, while it
  // is still one of today's open tasks, and Today's next one otherwise. Before a start it can be
  // changed: any of today's open ones, or none.
  const open = [nextTask, ...today.later.value].filter((task): task is TaskView => !!task && !task.running);
  const pick = picked.value;
  const kept = pick?.day === today.day.value && (pick.task === null || open.some((task) => task.id === pick.task));
  const chosen = kept ? (open.find((task) => task.id === pick.task) ?? null) : nextTask;
  const choose = (task: string | null) => {
    picked.value = { day: today.day.value, task };
    setChoosing(false);
  };
  const [choosing, setChoosing] = useState(false);
  // The lengths in play: a run's own once it has begun (the break after a lap takes that lap's
  // task's), and before a start what a lap on the task chosen would get.
  const lengths = focus.lengthsFor(ready ? (chosen?.id ?? null) : state.task);
  const ownLengths = ready && !!chosen && Object.values(chosen.lengths).some((length) => length !== null);

  // The moment plays only for a bell that went while this screen was showing the run.
  const watched = useRef<string | null>(null);
  const moment = useRef<string | null>(null);
  if (result && watched.current === state.run && view.ends_at !== null && now - view.ends_at < LIVE_MS) moment.current = state.run;
  watched.current = view.over ? null : state.run;
  // With celebrations off a finished lap is its numbers at once: nothing runs, nothing lights.
  const live = result && moment.current === state.run && settings.all.value.celebrate;
  useEffect(() => {
    if (!live) return;
    // Tap anywhere, or any key: straight to the final state.
    const skip = () => {
      moment.current = null;
      redraw();
    };
    addEventListener('pointerdown', skip);
    addEventListener('keydown', skip);
    return () => {
      removeEventListener('pointerdown', skip);
      removeEventListener('keydown', skip);
    };
  }, [live]);

  // What the last tap did, said once, until a lap starts, here or on another device.
  // What the last stop did, from the core's record of it, wherever it was made: here, on Today,
  // or from the phone's notification with the app opened by that very tap. The record lasts as
  // long as the stop can be taken back; the line stays until a lap starts.
  const rang = useRef(false);
  if (!ready) rang.current = state.phase === 'work' && view.over;
  const last = focus.lastStop.value;
  const line = ready && last ? stopSaid(last, fig.laps, rang.current) : '';
  const [note, setNote] = useState('');
  useEffect(() => {
    if (line || !ready) setNote(line);
  }, [line, ready]);
  const said = line || (ready ? note : '');
  // A lap that starts while the chooser is open closes it: a tap in it would set the lap after this one.
  useEffect(() => {
    if (!ready) setChoosing(false);
  }, [ready]);

  // The break this lap will earn, by the timer's own count and at the task's own length: the one
  // thing the set of four decides that a person feels. It is said on the button that takes it.
  const breakMs = lengths[(ready ? view.next.set_index === 3 : view.next.phase === 'long') ? 'long_ms' : 'short_ms'];
  // The bar is the task's: one segment for each lap of its estimate, more where laps went past
  // it, each as full as it ran. In a lap and on its result it is that lap's task; otherwise the
  // one a start would begin. No task, or one with no estimate, has no bar, and its place is kept.
  const inLap = state.phase === 'work' && !ready;
  const barTask = inLap || result ? lapTask : chosen;
  // The lap running on it grows with the clock: the row's last square is that lap, read live here.
  const growing = inLap && !view.over && barTask?.id === state.task;
  const squares = barTask?.squares ?? [];
  const fills = growing ? squares.slice(0, -1) : squares;
  // The lap just done is the task's last estimated one: its laps are all in, and the bar stands tall.
  const allIn = result && !!barTask && barTask.estimate !== null && barTask.laps === barTask.estimate;
  const bar = (more: { big?: boolean; lighting?: boolean } = {}) =>
    barTask && barTask.estimate !== null ? (
      <LapBar fills={fills} of={Math.max(barTask.estimate, squares.length)} share={growing ? 1 - view.left_ms / (state.planned_ms || 1) : 0} {...more} />
    ) : (
      <i class={css.nobar} />
    );

  // The lines over the digits name the task: in a lap and on its result the one it is on,
  // otherwise the one a tap would start. A lap on a task that is not on today's list still has its title, from the row
  // itself. They are there in every state or in none, so the digits never move: a lap for nothing
  // says so in the same two lines.
  const named = barTask;
  // Named from its row only while the task is alive: one deleted for good, or out of Recently
  // deleted, is said as gone, and its old title is not shown again.
  const raw = (inLap || result) && !named && state.task ? engine.rows('task').value.get(state.task) : undefined;
  const row = raw && (raw.deleted === null || raw.deleted === undefined) ? raw : undefined;
  // Gone only when its row says it was deleted: a live task whose title has not arrived yet is not.
  const gone = !!raw && !row;
  // Before a start there is a choice to show whenever there is a task to choose.
  const title = named?.title ?? (typeof row?.title === 'string' ? row.title : gone ? s.focus.lapGone : (inLap || result ? today.list.value.length > 0 : ready && open.length > 0) ? s.focus.freeTitle : '');
  const upNext = open.filter((task) => task !== named).slice(0, 3);
  // The first row says what the digits cannot, in the project's place: a break and its name.
  // Otherwise the task's project. A lap held is said once, under the
  // digits ("paused since 16:38"). The row is there in every state, so the digits never move.
  const about = (
    <span class={css.about}>
      {isBreak ? (
        <span class={css.project}>
          <i class={css.rest} />
          {state.phase === 'long' ? s.focus.longBreak : s.focus.shortBreak}
          {view.over && s.focus.breakOver}
        </span>
      ) : named?.project ? (
        <span class={css.project}>
          <Square color={named.project.color} />
          {named.project.name}
        </span>
      ) : (
        // How far the task is, the bar says: the words would only repeat it. With nothing on the list, nothing is said.
        title && !named && !raw && s.focus.freeLabel
      )}
      {/* The one word drawn as a link: the two lines are pressed as one. */}
      {ready && title && <u class={css.change}>{s.focus.change}</u>}
    </span>
  );
  const lines = (
    <>
      {about}
      <span class={css.title} title={title}>
        {title}
      </span>
    </>
  );
  // A bar sits with what it counts: the task's laps under the task's title, between it and the
  // digits, so it is never read as the day's. Its place is kept for a task with no estimate. With
  // nothing on the list there is no title, no bar and nothing to choose: only a break is said,
  // and without one there is no row at all, so no empty band.
  const task = (more: { big?: boolean; lighting?: boolean } = {}) =>
    title ? (
      <div class={css.named}>
        {/* Before a start the two lines are the way to choose what the lap is for; once it runs they are words. */}
        {ready ? (
          <button type="button" class={css.task} aria-label={s.focus.choose(title)} aria-haspopup="dialog" onClick={() => setChoosing(true)}>
            {lines}
          </button>
        ) : (
          <div class={css.task}>{lines}</div>
        )}
        {bar(more)}
      </div>
    ) : (
      isBreak && about
    );

  if (result) {
    const l = lanes(race, lengths.work_ms, now);
    const headline = set
      ? s.result.set(focus.lapsToday())
      : !l.day
        ? s.result.noGhost(race.you_ms)
        : l.chip.tone === 'level'
          ? s.result.level(l.day)
          : l.chip.tone === 'ahead'
            ? s.result.ahead(l.split, l.day)
            : s.result.behind(Math.max(1, l.lapsBehind()), fig.laps + 1, l.day);
    return (
      <div class={cx(css.focus, css.result, live && (allIn ? css.setMoment : css.lapMoment))}>
        <h1 class="sr">{s.focus.title}</h1>
        {/* No task and nothing to say of the lap: the headline is the first row, where Today's heading is. */}
        {title && <div class={css.laps}>{task({ big: allIn, lighting: live && allIn })}</div>}
        <div class={css.told}>
          <p class={cx(css.headline, css.words)} role="status">
            {headline}
          </p>
          {/* The marks open in place under the lanes, and take no room while there are none. */}
          <div>
            <div class={css.lanes}>
              <Race big you={l.you} ghost={l.ghost} from={live && !allIn ? Math.max(0, race.you_ms - state.planned_ms) / (race.you_ms || 1) * l.you.share : undefined} />
            </div>
            <Marks settings={settings} say={s.mark} />
          </div>
        </div>
        {/* What to do next, and the line that explains it, travel together: on a phone they are the screen's lower group. */}
        <div class={css.next}>
          {/* The line over the buttons, and at its right end the way out for someone finished for
              the day: where the quiet line of every other state stands, so the buttons under it
              keep the foot of the screen when a lap rings. */}
          <div class={cx(css.quiet, css.over)}>
          <p class={css.facts}>
            {l.day && (
              <>
                <SplitChip {...l.chip} turning={live && !allIn} /> <span class={css.words} data-live>{s.race.at(now)} </span>
              </>
            )}
            {/* The break is said once, on the button that starts it. The task's count is said only
                where no bar draws it: a task with no estimate. */}
            <span class={css.words}>
              {[s.result.laps(focus.lapsToday()), lapTask && lapTask.estimate === null && s.result.task(lapTask.title, lapTask.laps, lapTask.estimate), rooms.cheered.value.length > 0 && s.result.cheered(rooms.cheered.value)].filter(Boolean).join(' ')}
            </span>
          </p>
            <Button kind="link" class={css.far} onClick={focus.stop}>
              {s.focus.doneForNow}
            </Button>
          </div>
          <div class={css.main}>
            <Button kind="primary" onClick={() => focus.start()}>
              {s.focus.startBreak(breakMs)}
            </Button>
            <Button kind="quiet" onClick={() => focus.skipBreak(chosen?.id ?? null)}>
              {s.focus.startLapNow}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const shown = ready ? lengths.work_ms : view.left_ms;
  // The digits are for eyes. A screen reader gets a sentence that changes once a minute.
  const heard = ready ? s.focus.nextLength(lengths.work_ms) : s.focus.left(view.left_ms);

  // What a start would do, or what the last tap did with the way to take it back.
  const why =
    said && focus.undoable.value ? (
      <>
        {said}
        <Button kind="link" class={css.undo} onClick={() => focus.undo()}>
          {s.focus.undo}
        </Button>
      </>
    ) : (
      said || s.focus.endsIfStarted(now + lengths.work_ms, ownLengths)
    );

  return (
    <div class={css.focus}>
      <h1 class="sr">{s.focus.title}</h1>
      <div class={css.clock}>
        <div class={css.face}>
          {task()}
          <div class={css.time}>
            {/* Each digit sits a little differently in its box. Where DESIGN.md gives the bearing of
                the digit that leads, the ink lands exactly on the edge; else the one bearing serves. */}
            {/* From 100 minutes the clock reads hours, seven characters: a size down, in a place that keeps the timer's height. */}
            <div class={css.dial} aria-hidden="true">
              <div
                class={cx(css.digits, s.clock(shown).length > 5 && css.hours, !ready && (view.paused ? css.held : isBreak && css.resting))}
                style={`--bearing:var(--layout-figure-bearing-${s.clock(shown).charAt(0)}, var(--layout-figure-bearing))`}
              >
                {s.clock(shown)}
              </div>
            </div>
            <p class="sr" role="timer" aria-live="polite">
              {heard}
            </p>
            {/* While the clock runs this line is about the digits and stays with them. Before a
                start it explains the button: with the digits where there is a sidebar, with the
                button on a phone. */}
            <p class={cx(css.sub, ready && css.wide)} data-live>
              {ready ? why : view.ends_at !== null ? s.focus.endsAt(state.planned_ms, view.ends_at) : s.focus.pausedSince(state.planned_ms, state.paused_at ?? now)}
            </p>
          </div>
        </div>
      </div>
      <div class={css.rail}>
        <RacePanel race={race} inLap={inLap} left={view.left_ms} workMs={lengths.work_ms} now={now} />
        {upNext.length > 0 && (
          <div class={css.upnext}>
            {/* What Today calls the rest of its open tasks, in the same words. */}
            <Panel title={s.today.later}>
              <ul>
                {upNext.map((task) => (
                  <li key={task.id}>
                    <span>{task.title}</span>
                    <b>{s.focus.upNextLaps(task.laps, task.estimate)}</b>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </div>
      <div class={css.actions}>
        <div class={css.main}>
          {ready ? (
            <Button kind="primary" onClick={() => focus.start(chosen?.id ?? null)}>
              {s.focus.startLap}
            </Button>
          ) : view.paused ? (
            <Button kind="primary" onClick={() => focus.resume()}>
              {s.focus.resume}
            </Button>
          ) : isBreak ? (
            <Button onClick={() => focus.skipBreak(chosen?.id ?? null)}>{s.focus.startLapNow}</Button>
          ) : (
            <Button onClick={() => focus.pause()}>{s.focus.pause}</Button>
          )}
          {state.phase === 'work' && !ready && (
            <Button kind="quiet" onClick={focus.stop}>
              {s.focus.stop}
            </Button>
          )}
        </div>
        <div class={css.quiet}>
          {ready && <p class={css.why} data-live>{why}</p>}
          {isBreak && !ready && (
            <Button kind="link" class={css.far} onClick={focus.stop}>
              {s.focus.doneForNow}
            </Button>
          )}
          {/* Not offered when it would take the lap past the longest one there is. */}
          {!ready && !view.paused && state.phase === 'work' && state.planned_ms + EXTEND_MS <= LAP_MAX_MS && (
            <Button kind="link" onClick={() => focus.extend()}>
              {s.focus.extend(EXTEND_MS)}
            </Button>
          )}
        </div>
      </div>
      {/* Today's open tasks in their order, the one Start would begin outlined, and last the lap
          for nothing: starting must not need planning. */}
      <Kept>
        {choosing && (
          <Sheet title={s.focus.chooseTitle} close={s.task.close} onClose={() => setChoosing(false)}>
            <Fold list gap="sm">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} of={s.today.of(task.estimate)} next={task === chosen} onOpen={() => choose(task.id)} />
              ))}
              <TaskRow key="" task={{ id: '', title: s.focus.freeTitle, project: null, estimate: null, laps: 0, squares: [], done: false }} of="" next={!chosen} onOpen={() => choose(null)} />
            </Fold>
          </Sheet>
        )}
      </Kept>
    </div>
  );
}
