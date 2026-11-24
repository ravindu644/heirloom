// What the Focus screen is given. The lead wrote this interface so the ui lane and the core lane
// could build to it at the same time; the core lane fills in createFocus.
// Rules: contracts/protocol.md sections 6 (timer), 7 (the race) and 11 (sessions).

import type { ReadonlySignal } from '@preact/signals-core';
import type { TimerState, TimerView } from '../core/timer.ts';
import type { Engine } from './engine.ts';

/** You against the ghost: protocol section 7. `split_ms` under 0 is behind. No past day, no ghost. */
export interface Race {
  you_ms: number;
  ghost: { day: string; ms: number; total_ms: number } | null;
  split_ms: number | null;
}

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
}

export interface FocusEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. */
  utcOffsetMin(): number;
  /** A new run id. It becomes the session's row id. */
  runId(): string;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
}

/** Also writes the session rows: at the bell when this device may (protocol section 11), and when a run is stopped, set aside or replaced. */
export function createFocus(engine: Engine, env: FocusEnv): Focus {
  throw new Error('not built yet: createFocus, roadmap section 2');
}
