// What the Progress screen is given. The lead wrote this interface so the ui lane and the core
// lane could build to it at the same time; the core lane fills in createProgress.
// Rules: contracts/protocol.md section 13, with sections 7 (counting) and 8 (the streak).

import type { ReadonlySignal } from '@preact/signals-core';
import type { Engine } from './engine.ts';
import type { ProjectView } from './today.ts';

/** This week against last week, as running totals. Times in ms. */
export interface WeekRace {
  /** Monday of this week, `2026-11-23`. */
  monday: string;
  /** Seven days, Monday first. `you_ms` is null for days still to come; `ghost_ms` is last week's running total at that day's end. */
  days: { day: string; you_ms: number | null; ghost_ms: number }[];
  /** This week so far, the lap in progress included. */
  you_ms: number;
  /** Last week up to this weekday and time of day, and its whole total. */
  ghost_now_ms: number;
  ghost_total_ms: number;
  /** `you_ms - ghost_now_ms`. Under 0 is behind. Null when last week has nothing. */
  split_ms: number | null;
}

export interface StreakView {
  /** Kept days since the last miss. */
  streak: number;
  /** Kept days and all days in the last 45 of the record: "41 of the last 45". */
  kept: number;
  of: number;
  /** True when a miss lies inside those days: then the screen shows kept of, not the run. */
  missed: boolean;
  /** The last 14 days, oldest first, for the row of dots. Today is `open` until it has a lap. */
  recent: { day: string; state: 'kept' | 'rest' | 'empty' | 'open' }[];
}

export interface YearCell {
  day: string;
  focus_ms: number;
  laps: number;
  /** 0 to 4. */
  level: number;
  rest: boolean;
}

export interface Since {
  /** The first day with a counted session, or null before any. */
  first: string | null;
  focus_ms: number;
  laps: number;
  kept: number;
  of: number;
  /** 0 is Monday. Null until a weekday has come round three times. */
  steadiest: { weekday: number; kept: number; of: number } | null;
  /** One cell per day from `first` to today. */
  cells: YearCell[];
}

export interface Bests {
  day: { day: string; focus_ms: number } | null;
  week: { monday: string; focus_ms: number } | null;
}

export interface ProjectShare {
  project: ProjectView | null;
  focus_ms: number;
  laps: number;
  /** The same sum over the seven days before. */
  before_ms: number;
}

export interface Estimates {
  /** Laps run for each lap guessed, over tasks done in the last 28 days. Null with no such task. */
  ratio: number | null;
  /** The eight done most recently, newest first. */
  tasks: { id: string; title: string; estimate: number; laps: number }[];
}

export interface TimelineEntry {
  id: string;
  kind: 'work' | 'short' | 'long';
  outcome: 'rang' | 'stopped' | 'void';
  started: number;
  ended: number;
  /** Running time: the end less the start less the pauses. */
  ran_ms: number;
  task: { id: string; title: string } | null;
  project: ProjectView | null;
  /** One of a pair that ran on two devices at once. */
  overlap: boolean;
}

export interface LookBack {
  day: string;
  focus_ms: number;
  laps: number;
  /** Tasks done today, in the order they were done. */
  done: { id: string; title: string; estimate: number | null; laps: number }[];
  note: string;
}

export interface Progress {
  /** Worked out at the engine's now, the lap in progress included. Call it on every tick. */
  week(): WeekRace;
  projects(): ProjectShare[];
  lookBack(): LookBack;
  /** These change when a session row does, and at local midnight. */
  readonly streak: ReadonlySignal<StreakView>;
  readonly since: ReadonlySignal<Since>;
  readonly bests: ReadonlySignal<Bests>;
  readonly estimates: ReadonlySignal<Estimates>;
  /** A day's sessions, oldest first. Breaks and laps set aside are in it. */
  timeline(day: string): TimelineEntry[];

  /** Sets a lap aside from the timeline: kept there, counted nowhere. */
  setAside(session: string): void;
  /** Counts it again, as what it was. */
  countAgain(session: string): void;
  /** The one line about a day. */
  setNote(day: string, text: string): void;
  /** Re-checks the day now: call it when the app comes back to the front. */
  wake(): void;
}

export interface ProgressEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. */
  utcOffsetMin(): number;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
}

export function createProgress(engine: Engine, env: ProgressEnv): Progress & { close(): void } {
  throw new Error('not built yet: createProgress, roadmap section 5');
}
