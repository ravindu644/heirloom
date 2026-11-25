import { useEffect, useRef, useState } from 'preact/hooks';
import { localDay } from '../../core/stats.ts';
import type { TimerState, TimerView } from '../../core/timer.ts';
import type { Engine, Row } from '../../sync/engine.ts';
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
import css from './focus.module.css';

// A bell this fresh was seen as it happened. Anything older is news from before the screen opened.
const LIVE_MS = 2000;

const dayOf = (now: number) => localDay(now, -new Date(now).getTimezoneOffset());

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
  const lap = state.set_index + 1;
  const nextLap = view.next.phase === 'work' ? view.next.set_index + 1 : (lap % 4) + 1;
  const set = result && lap === 4;

  // The task this lap is for, and the one the next lap will be for. Starting needs no task: with
  // none next, a lap is for nothing in particular.
  const tasks = [today.running.value, today.next.value, ...today.later.value, ...today.done.value];
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
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!ready) setNote('');
  }, [ready]);
  // A stop made where this screen was not looking (the phone's notification, with the app opened
  // by that very tap) is said too, for as long as it can be taken back: from the row the stop
  // left. A lap stopped before its bell says how far it ran; a stop after a bell or in a break
  // says which lap it came after.
  const stopLine = () => {
    const last = [...engine.rows('session').value.values()].reduce<Row | undefined>((a, b) => (a && Number(a.ended) >= Number(b.ended) ? a : b), undefined);
    const lap = state.set_index || 4;
    return last?.kind === 'work' && last.outcome === 'stopped' ? s.focus.stopped(lap, Number(last.ended) - Number(last.started) - Number(last.paused_ms)) : s.focus.stoppedAfter(lap);
  };
  const said = note || (ready && focus.undoable.value ? stopLine() : '');
  // A lap that starts while the chooser is open closes it: a tap in it would set the lap after this one.
  useEffect(() => {
    if (!ready) setChoosing(false);
  }, [ready]);
  // After a bell and in a break both buttons start something: this is the way out for someone
  // finished for the day. The timer comes to rest after the lap that last ended.
  const doneForNow = () => {
    setNote(s.focus.stoppedAfter(((nextLap + 2) % 4) + 1));
    focus.stop();
  };
  // One Stop. It ends the lap where it is, and the line after says what that did.
  const stop = () => {
    setNote(s.focus.stopped(state.set_index + 1, focus.ran()));
    focus.stop();
  };

  // A break that is over or held says only that at the left.
  const plainBreak = view.over || view.paused;
  const lapLine = (
    <p class={css.lapline}>
      {isBreak ? (
        <span>
          <i class={css.rest} />
          <b>{state.phase === 'long' ? s.focus.longBreak : s.focus.shortBreak}</b>
          {plainBreak ? (view.over ? s.focus.breakOver : s.focus.lapPaused) : state.phase === 'long' ? s.focus.afterSet : s.focus.afterLap(lap)}
        </span>
      ) : (
        <span>
          <b>{s.focus.lap(ready ? nextLap : lap)}</b>
          {ready ? s.focus.lapNext : result ? s.focus.lapDone : view.paused ? s.focus.lapPaused : s.focus.lapFocus}
        </span>
      )}
      {/* What the four lead to, wherever this end has no other job. In a break it says the lap that
          is next, and names the set when the words at the left do not; after a long break that
          set is over, and lap 1 is of the next. */}
      {!set && <span>{isBreak ? (plainBreak && state.phase !== 'long' ? s.focus.lapAheadInSet(nextLap) : s.focus.lapAhead(nextLap)) : s.focus.longBreakAhead(ready ? nextLap : lap)}</span>}
    </p>
  );
  // Segments filled: the laps of this set that have rung. Ready, that is the index of the lap to come.
  const share = state.phase === 'work' && !view.over ? 1 - view.left_ms / state.planned_ms : 0;

  if (result) {
    const l = lanes(race, lengths.work_ms, now);
    const breakMs = set ? lengths.long_ms : lengths.short_ms;
    const headline = set
      ? s.result.set
      : !l.day
        ? s.result.noGhost(race.you_ms)
        : l.chip.tone === 'level'
          ? s.result.level(l.day)
          : l.chip.tone === 'ahead'
            ? s.result.ahead(l.split, l.day)
            : s.result.behind(Math.max(1, l.lapsBehind()), nextLap, l.day);
    return (
      <div class={cx(css.focus, css.result, live && (set ? css.setMoment : css.lapMoment))}>
        <h1 class="sr">{s.focus.title}</h1>
        <div class={css.laps}>
          {lapLine}
          <LapBar fills={focus.fills()} big={set} lighting={live && set} longBreak={false} />
        </div>
        <div class={css.told}>
          <p class={cx(css.headline, css.words)} role="status">
            {headline}
          </p>
          {/* The marks open in place under the lanes, and take no room while there are none. */}
          <div>
            <div class={css.lanes}>
              <Race big you={l.you} ghost={l.ghost} from={live && !set ? Math.max(0, race.you_ms - state.planned_ms) / (race.you_ms || 1) * l.you.share : undefined} />
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
                <SplitChip {...l.chip} turning={live && !set} /> <span class={css.words}>{s.race.at(now)} </span>
              </>
            )}
            <span class={css.words}>
              {s.result.laps(focus.lapsToday())} {lapTask && `${s.result.task(lapTask.title, lapTask.laps, lapTask.estimate)} `}
              {rooms.cheered.value.length > 0 && `${s.result.cheered(rooms.cheered.value)} `}
              {s.result.take(breakMs)}
            </span>
          </p>
            <Button kind="link" class={css.far} onClick={doneForNow}>
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

  // The lines over the digits name the task: in a lap the one it is on, otherwise the one a tap
  // would start. A lap on a task that is not on today's list still has its title, from the row
  // itself. They are there in every state or in none, so the digits never move: a lap for nothing
  // says so in the same two lines.
  const inLap = state.phase === 'work' && !ready;
  const named = inLap ? lapTask : chosen;
  const row = inLap && !named && state.task ? engine.rows('task').value.get(state.task) : undefined;
  // Before a start there is a choice to show whenever there is a task to choose.
  const title = named?.title ?? (typeof row?.title === 'string' ? row.title : (inLap ? today.list.value.length > 0 : ready && open.length > 0) ? s.focus.freeTitle : '');
  const upNext = open.filter((task) => task !== named).slice(0, 3);
  const lines = (
    <>
      <span class={css.about}>
        {named?.project && (
          <span class={css.project}>
            <Square color={named.project.color} />
            {named.project.name}
          </span>
        )}
        {named ? s.focus.onTask(named.laps + 1, named.estimate) : !row && s.focus.freeLabel}
        {/* The one word drawn as a link: the two lines are pressed as one. */}
        {ready && <u class={css.change}>{s.focus.change}</u>}
      </span>
      <span class={css.title} title={title}>
        {title}
      </span>
    </>
  );
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
        <div>
          {lapLine}
          {/* Each ended lap as full as it ran: one that was stopped stays part filled. */}
          <LapBar fills={focus.fills()} share={share} longBreak={state.phase === 'long'} />
        </div>
        <div class={css.face}>
          {/* Before a start the two lines are the way to choose what the lap is for; once it runs they are words. */}
          {title &&
            (ready ? (
              <button type="button" class={css.task} aria-label={s.focus.choose(title)} aria-haspopup="dialog" onClick={() => setChoosing(true)}>
                {lines}
              </button>
            ) : (
              <div class={css.task}>{lines}</div>
            ))}
          <div class={css.time}>
            {/* Each digit sits a little differently in its box. Where DESIGN.md gives the bearing of
                the digit that leads, the ink lands exactly on the edge; else the one bearing serves. */}
            <div
              class={cx(css.digits, !ready && (view.paused ? css.held : isBreak && css.resting))}
              style={`--bearing:var(--layout-figure-bearing-${s.clock(shown).charAt(0)}, var(--layout-figure-bearing))`}
              aria-hidden="true"
            >
              {s.clock(shown)}
            </div>
            <p class="sr" role="timer" aria-live="polite">
              {heard}
            </p>
            {/* While the clock runs this line is about the digits and stays with them. Before a
                start it explains the button: with the digits where there is a sidebar, with the
                button on a phone. */}
            <p class={cx(css.sub, ready && css.wide)}>
              {ready ? why : view.ends_at !== null ? s.focus.endsAt(state.planned_ms, view.ends_at) : s.focus.pausedSince(state.planned_ms, state.paused_at ?? now)}
            </p>
          </div>
        </div>
      </div>
      <div class={css.rail}>
        <RacePanel race={race} inLap={state.phase === 'work' && !ready} left={view.left_ms} workMs={lengths.work_ms} now={now} />
        {upNext.length > 0 && (
          <div class={css.upnext}>
            <Panel title={s.focus.upNext}>
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
            <Button kind="quiet" onClick={stop}>
              {s.focus.stop}
            </Button>
          )}
        </div>
        <div class={css.quiet}>
          {ready && <p class={css.why}>{why}</p>}
          {isBreak && !ready && (
            <Button kind="link" class={css.far} onClick={doneForNow}>
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
