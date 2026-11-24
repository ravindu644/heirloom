// What the Focus screen is given, and the one place session rows are written: at the bell when
// this device may, and when a run is stopped, set aside or replaced.
// Rules: contracts/protocol.md sections 6 (timer), 7 (the race) and 11 (sessions).
//
// Create it once, right after the engine and before anything else runs: a run that another
// device replaces while no Focus is listening is closed by nobody.

import { batch, computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { stampDevice, stampMs } from '../core/hlc.ts';
import { closeRun, mayWriteBell } from '../core/session.ts';
import type { End } from '../core/session.ts';
import { localDay, race } from '../core/stats.ts';
import type { Race, Session } from '../core/stats.ts';
import { act, view } from '../core/timer.ts';
import type { TimerAction, TimerState, TimerView } from '../core/timer.ts';
import type { Engine } from './engine.ts';

export type { Race } from '../core/stats.ts';

export interface Focus {
  /** The timer cell. Changes only when someone acts, on any device. */
  readonly state: ReadonlySignal<TimerState>;
  /** The lengths a new lap, short break and long break get, from settings or their defaults. */
  readonly lengths: ReadonlySignal<{ work_ms: number; short_ms: number; long_ms: number }>;
  /** Time left, the end, over, paused, what comes next: worked out at the engine's now. Call it on every tick. */
  view(): TimerView;
  /** Running time of the current run in ms, pauses left out. "Stop and log 6 min" reads this. */
  ran(): number;
  /** You against the ghost at the engine's now, the lap in progress included. */
  race(): Race;
  /** Laps that rang today (local day). */
  lapsToday(): number;

  /** Starts what `view().next` names: the next lap, or the break a finished lap has earned. */
  start(task?: string | null): void;
  /** Starts a lap now, in place of a break that is due or running. */
  skipBreak(task?: string | null): void;
  pause(): void;
  resume(): void;
  /** Five more minutes on the current run. */
  extend(): void;
  /** Ends the run and keeps its minutes: rang if the bell has gone, stopped if not. Under 60 s nothing is kept. */
  stop(): void;
  /** Ends the run and sets it aside: kept in the timeline, counted nowhere. */
  setAside(): void;
  /**
   * True for ten seconds after `stop()` or `setAside()` on this device, while the timer cell is
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
const UNDO_MS = 10000;
// The longest a length may be (the settings schema's maximum), and the longest the watch waits
// before looking again: a browser runs a timer set further out than 2^31 ms at once.
const DAY_MS = 86400000;
const LENGTHS = { work_ms: 1500000, short_ms: 300000, long_ms: 900000 };

// A row still arriving cell by cell, or one from a build that writes something else, is not counted yet.
const isSession = (row: Record<string, unknown>) =>
  ['started', 'ended', 'paused_ms'].every((field) => typeof row[field] === 'number') &&
  ['kind', 'outcome', 'device'].every((field) => typeof row[field] === 'string');

/** `close()` stops the bell watch: for tests and for Node, where a waiting timer keeps the process alive. */
export function createFocus(engine: FocusEngine, env: FocusEnv): Focus & { close(): void } {
  const me = engine.device;
  const state = engine.timer;
  const rows = engine.rows('session');
  const sessions = computed(() => [...rows.value.values()].filter(isSession) as unknown as Session[]);

  const lengths = computed(() => {
    const set = engine.rows('settings').value.get('current');
    const length = (name: keyof typeof LENGTHS) => {
      const value = set?.[name];
      return typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= DAY_MS ? value : LENGTHS[name];
    };
    return { work_ms: length('work_ms'), short_ms: length('short_ms'), long_ms: length('long_ms') };
  });

  const timerStamp = () => engine.stamp('timer', 'current', 'state');
  const today = (ms: number) => localDay(ms, env.utcOffsetMin());

  // The timer last did something on an earlier local day: its bell if it rang, else the last
  // time someone touched it. Then the next lap is lap one, and yesterday's half set earns no break.
  function newDay(s: TimerState, v: TimerView, now: number): boolean {
    const stamp = timerStamp();
    if (!stamp) return false;
    return today(v.over && v.ends_at !== null ? v.ends_at : stampMs(stamp)) < today(now);
  }

  function look(s: TimerState, now: number): TimerView {
    const v = view(s, now);
    return newDay(s, v, now) ? { ...v, next: { phase: 'work', set_index: 0 } } : v;
  }

  // The row held for a run was written no earlier than the timer cell that shows the run. A row
  // from before is about a run that has since gone on: a stop that was undone.
  function current(run: string, written: number): boolean {
    const stamp = engine.stamp('session', run, 'ended');
    return stamp !== undefined && stampMs(stamp) >= written;
  }

  // A row already tells this run's story up to this bell. A row that ends earlier does not: the
  // lap was extended after it rang, or went on here after another device stopped it.
  function covered(run: string, endsAt: number, written: number): boolean {
    const ended = rows.peek().get(run)?.ended;
    return typeof ended === 'number' && ended >= endsAt && current(run, written);
  }

  // Closes a run as protocol section 11 says and writes the row it leaves, if any. `written` is
  // the time in the stamp of the timer cell that held `s`.
  function keep(s: TimerState, how: End, now: number, written: number) {
    const closed = closeRun(s, how, { now, device: me, written, rang: rangOnce(s) });
    if (!closed) return;
    // The same rang row twice is harmless, but it is a push for nothing.
    if (closed.stamp_at !== null && covered(closed.id, closed.row.ended, written)) return;
    engine.write('session', closed.id, closed.row, closed.stamp_at ?? undefined);
  }

  const rangOnce = (s: TimerState) => s.run !== null && rows.peek().get(s.run)?.outcome === 'rang';

  // The idle state a run leaves behind. A run that holds a rang row reached its bell once, so for
  // the set of four it is done, even when an extension has reopened it: the pure rule only sees a
  // lap that is not over and would hand out the same lap again, five laps before the long break.
  // So for such a run the rule is asked at a moment the run is over.
  function after(s: TimerState, now: number): TimerState {
    if (!rangOnce(s)) return act(s, { do: 'stop' }, now);
    const running = act(s, { do: 'resume' }, now);
    return act(running, { do: 'stop' }, Math.max(now, view(running, now).ends_at ?? now));
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
  function begin(lap: boolean, task: string | null | undefined) {
    const s = state.peek();
    const now = engine.now();
    const v = look(s, now);
    const phase = lap ? 'work' : v.next.phase;
    const fresh = phase === 'work' && newDay(s, v, now);
    // A lap begun over a run that rang once is the next lap: it starts from what that run leaves behind.
    const from = phase === 'work' && rangOnce(s) ? after(s, now) : s;
    batch(() => {
      keep(s, 'stop', now, written());
      const start: TimerAction = {
        do: 'start',
        phase,
        run: env.runId(),
        task: phase === 'work' ? (task ?? null) : null,
        planned_ms: lengths.peek()[`${phase}_ms`],
        ...(fresh && { new_set: true }),
      };
      put(act(from, start, now));
    });
  }

  // The last stop made here, for as long as it can be taken back: the state before it, and the
  // stamp of the idle cell it wrote, which no longer matches once anyone writes the timer again.
  let undone: { before: TimerState; stamp: string | undefined } | null = null;
  let cancelUndo = () => {};
  const undoable = signal(false);

  function forget() {
    cancelUndo();
    undone = null;
    undoable.value = false;
  }

  function end(how: 'stop' | 'void') {
    const s = state.peek();
    if (s.phase === 'idle') return;
    const now = engine.now();
    const idle = after(s, now);
    batch(() => {
      keep(s, how, now, written());
      put(idle);
    });
    undone = { before: s, stamp: timerStamp() };
    undoable.value = true;
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
        keep(s, 'bell', now, stampMs(stamp));
      }
    });
  });

  return {
    state,
    lengths,
    view: () => look(state.value, engine.now()),
    ran: () => state.value.planned_ms - view(state.value, engine.now()).left_ms,

    race() {
      const s = state.value;
      const now = engine.now();
      // A row that ends before the run has got to (see `covered`) would hide the lap in progress.
      const end = s.paused_at ?? Math.min(now, view(s, now).ends_at ?? now);
      const list = sessions.value.filter((row) => !(row.id === s.run && row.ended < end));
      return race(list, s, now, env.utcOffsetMin());
    },

    lapsToday() {
      const s = state.value;
      const now = engine.now();
      const day = today(now);
      const laps = sessions.value.filter((row) => row.kind === 'work' && row.outcome === 'rang' && today(row.started) === day).length;
      // As the race does: a lap whose bell has gone counts before its row is written, which may
      // be a while on a device that is offline with another device's timer.
      const { over, ends_at } = view(s, now);
      const stamp = timerStamp();
      if (s.phase !== 'work' || !over || s.run === null || s.started === null || ends_at === null || !stamp) return laps;
      // Not twice: a rang row is in the count already, and a row that covers this bell has the last word on it.
      return today(s.started) !== day || rangOnce(s) || covered(s.run, ends_at, stampMs(stamp)) ? laps : laps + 1;
    },

    start: (task) => begin(false, task),
    skipBreak: (task) => begin(true, task),
    pause: () => change({ do: 'pause' }),
    resume: () => change({ do: 'resume' }),
    extend: () => change({ do: 'extend', ms: EXTEND_MS }),
    stop: () => end('stop'),
    setAside: () => end('void'),
    undoable,
    undo,

    close() {
      stopWatch();
      cancel();
      forget();
    },
  };
}
