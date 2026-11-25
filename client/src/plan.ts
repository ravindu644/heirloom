// What the notifier is asked to ring and show for the timer as it stands: the bell, the line
// beside the countdown, the buttons. Kept apart from main.tsx so its words and its cases have
// a test; a browser test cannot see a phone's notification.

import type { TimerState, TimerView } from './core/timer.ts';
import type { Paused, Ring } from './platform/notifier.ts';
import { result, ring } from './ui/strings.ts';

export interface PlanFrom {
  state: TimerState;
  view: TimerView;
  /** The task the lap is on, as Today shows it, when this device holds it open. */
  on?: { title: string; laps: number; estimate: number | null };
  /** The breaks after this lap: its task's own where it has them. */
  lengths: { short_ms: number; long_ms: number };
  /** How far the server's clock is ahead of this device's, in ms. `view` is in server time, a `Ring` in the device's. */
  ahead: number;
}

export function planFor({ state, view, on, lengths, ahead }: PlanFrom): Ring | Paused | null {
  if (state.phase === 'idle') return null;
  const lap = state.set_index + 1;
  const work = state.phase === 'work';
  // The countdown names the task and its own count; with no task it is the lap of the set.
  const during = !work ? ring.breakRunning(state.phase === 'long') : on ? ring.lapOn(on.title, on.laps + 1, on.estimate) : ring.lapOn(null, lap, null);
  // A break is left the way Focus leaves it: "Done for now". The buttons name the run they were
  // drawn for: a notification can outlive it, and a tap on a stale one must not act on the next.
  const actions = { pause: ring.pause, resume: ring.resume, stop: work ? ring.stop : ring.breakStop, run: state.run };
  // Paused: no bell, and a notification that stands still, to resume or stop from.
  if (view.paused) return { paused: true, during, left: ring.paused(view.left_ms), actions };
  if (view.ends_at === null) return null;
  // The server names a bell by its run and its end in server time; the same pair lets the page
  // know a push it hears of is for the bell it has planned.
  const push = state.run === null ? undefined : { run: state.run, at: view.ends_at };
  const said = work
    ? // The bell counts what the countdown counted: the task's lap where there is a task.
      { title: on ? ring.lapOnDone(on.title, on.laps + 1) : ring.lapDone(lap), body: result.take(lap === 4 ? lengths.long_ms : lengths.short_ms) }
    : { title: ring.breakOver, body: ring.lapNext(view.next.set_index + 1) };
  return { at: view.ends_at - ahead, ...said, during, push, actions };
}
