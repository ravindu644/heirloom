// What the Focus screen is given, and the one place session rows are written: at the bell when
// this device may, and when a run is stopped or replaced.
// Rules: contracts/protocol.md sections 6 (timer), 7 (the race) and 11 (sessions).
//
// Create it once, right after the engine and before anything else runs: a run that another
// device replaces while no Focus is listening is closed by nobody.

import { batch, computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { stampCounter, stampDevice, stampMs } from '../core/hlc.ts';
import type { Stamp } from '../core/hlc.ts';
import { closeRun, mayWriteBell } from '../core/session.ts';
import type { End } from '../core/session.ts';
import type { Race } from '../core/stats.ts';
import { act, view } from '../core/timer.ts';
import { asTask } from '../core/today.ts';
import type { TimerAction, TimerState, TimerView } from '../core/timer.ts';
import { createCounts, lapLengths } from './counts.ts';
import type { Engine } from './engine.ts';

export type { Race } from '../core/stats.ts';

export interface Focus {
  /** The timer cell. Changes only when someone acts, on any device. */
  readonly state: ReadonlySignal<TimerState>;
  /** The account's lengths for a lap, a short break and a long break, from settings or their defaults. */
  readonly lengths: ReadonlySignal<{ work_ms: number; short_ms: number; long_ms: number }>;
  /**
   * What a run begun now for that task would get: the task's own lengths, each falling back by
   * itself to the account's. For no task, or one this device does not hold, the account's.
   */
  lengthsFor(task: string | null): { work_ms: number; short_ms: number; long_ms: number };
  /** Time left, the end, over, paused, what comes next: worked out at the engine's now. Call it on every tick. */
  view(): TimerView;
  /** Running time of the current run in ms, pauses left out. */
  ran(): number;
  /** You against the ghost at the engine's now, the lap in progress included. */
  race(): Race;
  /** Today's laps (local day): those that rang and those that were stopped. One not counted is not in it. */
  lapsToday(): number;

  /** Starts what `view().next` names: the next lap, or the break a finished lap has earned. */
  start(task?: string | null): void;
  /** Starts a lap now, in place of a break that is due or running. */
  skipBreak(task?: string | null): void;
  pause(): void;
  resume(): void;
  /** Five more minutes on the current run. */
  extend(): void;
  /**
   * Ends the run where it is. A lap stopped before its bell is a lap that ended early: it keeps
   * its minutes and its place in the set, and the next start is the next lap. But one stopped
   * within its first minute of running was a start taken back: no lap, nothing kept, and the
   * next start is the same lap. After the bell it rang. A break under a minute leaves nothing either.
   */
  stop(): void;
  /**
   * What the stop that can still be undone ended; null whenever `undoable` is false. `ran_ms`
   * is the running time at the stop, pauses left out. `counted` is true when the stop left a lap
   * of the day (a lap of a minute or more, or one that had rung); false for a start taken back
   * and for any break. The screen's line about a stop reads this, not the newest row: a lap
   * stopped in its first minute leaves no row, and the newest row is then another lap.
   */
  readonly lastStop: ReadonlySignal<{ phase: 'work' | 'short' | 'long'; task: string | null; started: number; ran_ms: number; counted: boolean } | null>;
  /**
   * True for ten seconds after `stop()` on this device, while the timer cell is
   * still the idle state that stop wrote. Any other write to the timer, here or elsewhere, ends it.
   */
  readonly undoable: ReadonlySignal<boolean>;
  /** Puts the timer back as it was before that stop: the same run, the seconds since counted as running. Nothing when not undoable. */
  undo(): void;
}

export interface FocusEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. */
  utcOffsetMin(): number;
  /** A new run id. It becomes the session's row id. */
  runId(): string;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
}

/** What Focus uses of the engine. */
export type FocusEngine = Pick<Engine, 'timer' | 'sync' | 'device' | 'now' | 'rows' | 'write' | 'stamp'>;

/** What `extend()` adds. */
export const EXTEND_MS = 300000;
/** How long a stop can be taken back. */
export const UNDO_MS = 10000;
/**
 * How long the bar that says what the last tap did stays when it only reports. DESIGN.md: it
 * goes by itself after four seconds when it only reports, after ten (`UNDO_MS`) when it carries an Undo.
 */
export const SAID_MS = 4000;
// A bell older than this starts nothing by itself: someone who comes back the next morning finds
// the timer idle, not a break that began nine hours ago.
const AUTO_LATE_MS = 2 * 60 * 60 * 1000;
// What the run that starts by itself adds to the id of the run that rang. Two devices that both
// see the bell make the same id, so they write the same state.
const AUTO_SUFFIX = '_';
// The longest the watch waits before looking again: a browser runs a timer set further out than 2^31 ms at once.
const DAY_MS = 86400000;

/**
 * Starts a lap called in a room (protocol section 15, Start together): run id `run`, begun at
 * `at` (or when the last run here ended, if that was later), for `task`. Only when the timer is on no lap and no break (one whose bell has gone is on
 * neither), and not when it already holds that run. Says whether it started it. Rooms calls it.
 */
export type Together = (run: string, at: number, task: string | null) => boolean;

/** `close()` stops the bell watch: for tests and for Node, where a waiting timer keeps the process alive. */
export function createFocus(engine: FocusEngine, env: FocusEnv): Focus & { close(): void; together: Together } {
  const me = engine.device;
  const state = engine.timer;
  const counts = createCounts(engine, env.utcOffsetMin);
  const { rows, timerStamp, today, current, covered, rangOnce } = counts;
  const lengths = computed(() => lapLengths(engine.rows('settings').value.get('current')));
  // Read when a run begins, by the device that begins it: the timer cell carries the length from
  // there, so a task edited mid-lap changes the next run and not this one.
  const taskRows = engine.rows('task');
  const lengthsFor = (task: string | null) => lapLengths(task === null ? undefined : taskRows.value.get(task), lengths.value);

  // The timer last did something on an earlier local day: its bell if it rang, else the last
  // time someone touched it. Then the next lap is lap one, and yesterday's half set earns no break.
  // Not while a lap or a break is counting: a lap of some hours begun before midnight is this
  // sitting still, and the break it is earning is its own.
  function newDay(s: TimerState, v: TimerView, now: number): boolean {
    const stamp = timerStamp();
    if (!stamp || (s.phase !== 'idle' && !v.over && !v.paused)) return false;
    return today(v.over && v.ends_at !== null ? v.ends_at : stampMs(stamp)) < today(now);
  }

  function look(s: TimerState, now: number): TimerView {
    const v = view(s, now);
    return newDay(s, v, now) ? { ...v, next: { phase: 'work', set_index: 0 } } : v;
  }

  // Closes a run as protocol section 11 says and writes the row it leaves, if any. `written` is
  // the time in the stamp of the timer cell that held `s`.
  // Says whether the run leaves a row at all, written now or held already.
  function keep(s: TimerState, how: End, now: number, written: number): boolean {
    const closed = closeRun(s, how, { now, device: me, written, rang: rangOnce(s) });
    if (!closed) return false;
    // The same rang row twice is harmless, but it is a push for nothing.
    if (closed.stamp_at === null || !covered(closed.id, closed.row.ended, written)) engine.write('session', closed.id, closed.row, closed.stamp_at ?? undefined);
    return true;
  }

  // The run this device wrote last and has not seen end, and when it wrote it. If another
  // device's run takes the timer, this is all that is left of ours, and what its row is made from.
  let own: { state: TimerState; written: number } | null = null;

  // `own` is set before the watch hears of the write, so it never takes our own next run for a replacement.
  function put(next: TimerState) {
    batch(() => {
      engine.write('timer', 'current', { state: next });
      const stamp = timerStamp();
      own = stamp && next.phase !== 'idle' ? { state: next, written: stampMs(stamp) } : null;
    });
  }

  const written = () => stampMs(timerStamp() ?? '');

  // One turn, so one store transaction: the row of the run that ends and the timer cell that ends it.
  function begin(lap: boolean, task: string | null | undefined, run = env.runId(), at?: number) {
    const s = state.peek();
    const now = engine.now();
    const v = look(s, now);
    const phase = lap ? 'work' : v.next.phase;
    const fresh = phase === 'work' && newDay(s, v, now);
    // A lap is as long as its task says. A break is as long as the task of the lap it follows says.
    const of = phase === 'work' ? (task ?? null) : s.task;
    batch(() => {
      keep(s, 'stop', now, written());
      const start: TimerAction = {
        do: 'start',
        phase,
        run,
        task: phase === 'work' ? (task ?? null) : null,
        planned_ms: untracked(() => lengthsFor(of))[`${phase}_ms`],
        ...(fresh && { new_set: true }),
      };
      put(act(s, start, at ?? now));
    });
  }

  // The last stop made here, for as long as it can be taken back: the state before it, and the
  // stamp of the idle cell it wrote, which no longer matches once anyone writes the timer again.
  let undone: { before: TimerState; stamp: string | undefined } | null = null;
  let cancelUndo = () => {};
  const undoable = signal(false);
  const lastStop = signal<Focus['lastStop']['value']>(null);

  function forget() {
    cancelUndo();
    undone = null;
    batch(() => {
      undoable.value = false;
      lastStop.value = null;
    });
  }

  function stop() {
    const s = state.peek();
    const phase = s.phase;
    if (phase === 'idle') return;
    const now = engine.now();
    // One turn, so one store transaction: the row of the lap that ends here and the timer cell that ends it.
    let row = false;
    batch(() => {
      row = keep(s, 'stop', now, written());
      put(act(s, { do: 'stop' }, now));
    });
    cancelUndo();
    undone = { before: s, stamp: timerStamp() };
    batch(() => {
      // A break's row is no lap, and a lap that leaves no row was a start taken back.
      lastStop.value = { phase, task: s.task, started: s.started ?? now, ran_ms: s.planned_ms - view(s, now).left_ms, counted: phase === 'work' && row };
      undoable.value = true;
    });
    cancelUndo = env.schedule(forget, UNDO_MS);
  }

  // Only the timer is put back. The row the stop left stays until the run rings, is stopped
  // again or is replaced: that row is then written from a newer timer cell, so it is the newer row.
  // The watch forgets the stop the moment the timer cell is written, by this too.
  function undo() {
    if (undone) put(undone.before);
  }

  function change(action: TimerAction) {
    const s = state.peek();
    const next = act(s, action, engine.now());
    if (next !== s) put(next);
  }

  // Automatic starts, protocol section 16: the break a lap has earned, or the lap after a short
  // break, begun at the bell by the device that writes the bell. Never after a long break, so a
  // set of four does not chain into the next.
  function follow(s: TimerState, stamp: Stamp, bell: number, now: number) {
    const set = engine.rows('settings').peek().get('current');
    const wanted = s.phase === 'work' ? set?.auto_break === true : s.phase === 'short' && set?.auto_work === true;
    if (!wanted || s.run === null || now - bell > AUTO_LATE_MS) return;
    const { phase } = view(s, bell).next;
    // Everything is worked out as of the bell, not of the moment of writing, so a second device
    // that sees the same bell a little later writes the very same state.
    // The break is for the lap that has just rung, the lap for the task it goes on with: each takes that task's lengths.
    const task = phase === 'work' ? taskAfter(s) : null;
    const start: TimerAction = { do: 'start', phase, run: s.run + AUTO_SUFFIX, task, planned_ms: lengthsFor(phase === 'work' ? task : s.task)[`${phase}_ms`] };
    const next = act(s, start, bell);
    // Stamped just after the cell it follows, as a rang row is stamped at it: anything a person
    // does afterwards is newer, and a stop made elsewhere before the bell is too.
    engine.write('timer', 'current', { state: next }, stampMs(stamp), stampCounter(stamp) + 1);
    own = { state: next, written: stampMs(stamp) };
  }

  // The task a lap begun by itself after this break is for: the task of the lap that rang
  // before the break, while it is open. The person chose it, and nothing has been said since.
  // Done or deleted in the break, or a task this device does not hold: no task, and which next
  // is the person's to say.
  function taskAfter(rest: TimerState): string | null {
    const before = counts.sessions
      .peek()
      .filter((row) => row.kind === 'work' && row.outcome === 'rang' && row.ended <= (rest.started ?? 0))
      .sort((a, b) => b.ended - a.ended)[0];
    const id = before?.task ?? null;
    const row = id === null ? undefined : taskRows.peek().get(id);
    const task = row && asTask(row.id, row);
    return task && task.done === null && task.deleted === null ? task.id : null;
  }

  // The watch. It runs when the timer cell, the sync state or the session rows change, and when
  // the bell is due: so a device that wakes late, comes back online or catches up does the right thing.
  const due = signal(0);
  let cancel = () => {};
  const stopWatch = effect(() => {
    const s = state.value;
    const inStep = engine.sync.value === 'in-step';
    void rows.value;
    void due.value;
    untracked(() => {
      const now = engine.now();
      if (undone && timerStamp() !== undone.stamp) forget();
      // Another device's run has the timer and ours never ended: it ends here, unless a row says
      // it already did. An idle timer is not this: whoever stopped our run wrote its row.
      const ours = own?.state.run;
      if (own && ours && s.run !== null && s.run !== ours && !current(ours, own.written)) {
        keep(own.state, 'replaced', now, own.written);
      }
      const stamp = timerStamp();
      own = stamp && s.phase !== 'idle' && stampDevice(stamp) === me ? { state: s, written: stampMs(stamp) } : null;

      cancel();
      cancel = () => {};
      const { over, ends_at } = view(s, now);
      if (!stamp || s.run === null || ends_at === null) return;
      if (!over) {
        cancel = env.schedule(() => void due.value++, Math.min(ends_at - now, DAY_MS));
      } else if (mayWriteBell(stamp, me, inStep, covered(s.run, ends_at, stampMs(stamp)))) {
        // One turn, so one store transaction: the row of the bell, and what starts by itself at it.
        batch(() => {
          keep(s, 'bell', now, stampMs(stamp));
          follow(s, stamp, ends_at, now);
        });
      }
    });
  });

  return {
    state,
    lengths,
    lengthsFor,
    view: () => look(state.value, engine.now()),
    ran: () => state.value.planned_ms - view(state.value, engine.now()).left_ms,

    race: counts.race,
    lapsToday: counts.lapsToday,

    start: (task) => begin(false, task),
    skipBreak: (task) => begin(true, task),
    together(run, at, task) {
      const s = state.peek();
      const v = view(s, engine.now());
      if (s.run === run || (s.phase !== 'idle' && !v.over)) return false;
      // Never before what ran here last had ended: a bell or a stop a few seconds after the
      // call's minute would otherwise overlap the called lap, and those seconds count twice.
      // The idle cell was written by the stop that ended it.
      const ended = s.phase === 'idle' ? (timerStamp() === undefined ? at : written()) : (v.ends_at ?? at);
      begin(true, task, run, Math.max(at, ended));
      return true;
    },
    pause: () => change({ do: 'pause' }),
    resume: () => change({ do: 'resume' }),
    extend: () => change({ do: 'extend', ms: EXTEND_MS }),
    stop,
    lastStop,
    undoable,
    undo,

    close() {
      stopWatch();
      cancel();
      forget();
    },
  };
}
