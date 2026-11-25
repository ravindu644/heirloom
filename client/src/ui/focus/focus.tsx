import { useEffect, useRef, useState } from 'preact/hooks';
import { localDay } from '../../core/stats.ts';
import type { TimerState, TimerView } from '../../core/timer.ts';
import type { Engine } from '../../sync/engine.ts';
import { EXTEND_MS } from '../../sync/focus.ts';
import type { Focus, Race as RaceNow } from '../../sync/focus.ts';
import type { TaskView, Today } from '../../sync/today.ts';
import type { Rooms } from '../../sync/rooms.ts';
import type { Settings } from '../../sync/settings.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { LapBar } from '../kit/lapbar.tsx';
import { Marks } from '../kit/marks.tsx';
import { Square } from '../kit/square.tsx';
import { Panel } from '../kit/panel.tsx';
import { Race, SplitChip } from '../kit/race.tsx';
import * as s from '../strings.ts';
import { useTick } from '../tick.ts';
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
    ghost: race.ghost && { label: s.race.ghost, value: s.total(race.ghost.ms), share: race.ghost.ms / scale },
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
  const state: TimerState = focus.state.value;
  const lengths = focus.lengths.value;
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
  const stop = () => {
    setNote(s.focus.stopped(focus.ran()));
    focus.stop();
  };
  const setAside = () => {
    setNote(s.focus.setAsideDone);
    focus.setAside();
  };

  const lapLine = (
    <p class={css.lapline}>
      {isBreak ? (
        <span>
          <i class={css.rest} />
          <b>{state.phase === 'long' ? s.focus.longBreak : s.focus.shortBreak}</b>
          {view.over ? s.focus.breakOver : view.paused ? s.focus.lapPaused : state.phase === 'long' ? s.focus.afterSet : s.focus.afterLap(lap)}
        </span>
      ) : (
        <span>
          <b>{s.focus.lap(ready ? nextLap : lap)}</b>
          {ready ? s.focus.lapNext : result ? s.focus.lapDone : view.paused ? s.focus.lapPaused : s.focus.lapFocus}
        </span>
      )}
      {!set && <span>{isBreak ? s.focus.lapAhead(nextLap) : s.focus.longBreakAhead(ready ? nextLap : lap)}</span>}
    </p>
  );
  // Segments filled: the laps of this set that have rung. Ready, that is the index of the lap to come.
  const done = ready ? view.next.set_index : state.phase === 'work' && !view.over ? state.set_index : lap;
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
          <LapBar done={done} big={set} lighting={live && set} />
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
          <div class={css.main}>
            <Button kind="primary" onClick={() => focus.start()}>
              {s.focus.startBreak(breakMs)}
            </Button>
            <Button kind="quiet" onClick={() => focus.skipBreak(nextTask?.id)}>
              {s.focus.skipBreak}
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
  const named = inLap ? lapTask : nextTask;
  const row = inLap && !named && state.task ? engine.rows('task').value.get(state.task) : undefined;
  const title = named?.title ?? (typeof row?.title === 'string' ? row.title : inLap && today.list.value.length > 0 ? s.focus.freeTitle : '');
  const upNext = [nextTask, ...today.later.value].filter((task): task is TaskView => !!task && !task.running && task !== named).slice(0, 3);
  const shown = ready ? lengths.work_ms : view.left_ms;
  // The digits are for eyes. A screen reader gets a sentence that changes once a minute.
  const heard = ready ? s.focus.nextLength(lengths.work_ms) : s.focus.left(view.left_ms);

  // What a start would do, or what the last tap did with the way to take it back.
  const why =
    note && focus.undoable.value ? (
      <>
        {note}
        <Button kind="link" class={css.undo} onClick={() => focus.undo()}>
          {s.focus.undo}
        </Button>
      </>
    ) : (
      note || s.focus.endsIfStarted(now + lengths.work_ms)
    );

  return (
    <div class={css.focus}>
      <h1 class="sr">{s.focus.title}</h1>
      <div class={css.clock}>
        <div>
          {lapLine}
          <LapBar done={done} share={share} />
        </div>
        <div class={css.face}>
          {title && (
            <div class={css.task}>
              {!named && !row && <p class={css.about}>{s.focus.freeLabel}</p>}
              {named && (
                <p class={css.about}>
                  {named.project && (
                    <span>
                      <Square color={named.project.color} />
                      {named.project.name}
                    </span>
                  )}
                  {s.focus.onTask(named.laps + 1, named.estimate)}
                </p>
              )}
              <p class={css.title} title={title}>
                {title}
              </p>
            </div>
          )}
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
                    <b>
                      {task.laps}
                      {s.today.of(task.estimate)}
                    </b>
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
            <Button kind="primary" onClick={() => focus.start(nextTask?.id)}>
              {s.focus.startLap(nextLap)}
            </Button>
          ) : view.paused ? (
            <Button kind="primary" onClick={() => focus.resume()}>
              {s.focus.resume}
            </Button>
          ) : isBreak ? (
            <Button onClick={() => focus.skipBreak(nextTask?.id)}>{s.focus.startLapNow(nextLap)}</Button>
          ) : (
            <Button onClick={() => focus.pause()}>{s.focus.pause}</Button>
          )}
          {state.phase === 'work' && !ready && (
            <Button kind="quiet" onClick={stop}>
              {s.focus.stop(focus.ran())}
            </Button>
          )}
          {/* Starting must not need planning: the lesser choice beside the task that is next. */}
          {ready && nextTask && (
            <Button kind="quiet" onClick={() => focus.start(null)}>
              {s.focus.startFree}
            </Button>
          )}
        </div>
        <div class={css.quiet}>
          {ready && <p class={css.why}>{why}</p>}
          {!ready && !view.paused && state.phase === 'work' && (
            <Button kind="link" onClick={() => focus.extend()}>
              {s.focus.extend(EXTEND_MS)}
            </Button>
          )}
          {!ready && state.phase === 'work' && (
            <Button kind="link" onClick={setAside}>
              {s.focus.setAside}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
