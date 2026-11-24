// What the Habits screen is given. The lead wrote this interface so the ui lane and the core
// lane could build to it at the same time; the core lane fills in createHabits.
// Rules: contracts/protocol.md section 14, and section 8 for the streak.

import type { ReadonlySignal } from '@preact/signals-core';
import type { Engine } from './engine.ts';

export interface HabitDay {
  day: string;
  /** The habit is planned for this weekday. */
  planned: boolean;
  /** Live check-ins on the day. */
  count: number;
  /** The count has reached the target. */
  done: boolean;
  /** A rest day of the streak (section 8). */
  rest: boolean;
}

export interface HabitView {
  id: string;
  title: string;
  /** Weekday mask: bit 0 Monday to bit 6 Sunday. */
  days: number;
  /** Check-ins that make a day done. */
  target: number;
  /** Local time of day for the reminder, `07:30`, or null. */
  remind: string | null;
  /** Today's check-ins and whether today is planned and done. */
  today: HabitDay;
  /** This week, Monday first. Days after today have count 0 and are not done. */
  week: HabitDay[];
  /** From the first check-in to today, oldest first, for the small heatmap. Empty before any. */
  record: HabitDay[];
  /** Done days since the last miss, and done of planned over the last 45 days of the record. */
  streak: number;
  kept: number;
  of: number;
  /** True when a miss lies inside those days: then the screen shows kept of, not the run. */
  missed: boolean;
}

export interface HabitEdit {
  title?: string;
  days?: number;
  target?: number;
  remind?: string | null;
  archived?: boolean;
}

export interface Habits {
  /** Habits that are neither archived nor deleted, in order. */
  readonly list: ReadonlySignal<HabitView[]>;
  /** Archived ones, for bringing back. */
  readonly archived: ReadonlySignal<HabitView[]>;
  /** Deleted in the last 30 days, newest first. */
  readonly deleted: ReadonlySignal<HabitView[]>;
  /** Of the habits planned for today: how many are done. */
  readonly today: ReadonlySignal<{ done: number; planned: number }>;
  /** Check-ins this week so far and last week up to the same weekday and time. Call it on a tick. */
  week(): { now: number; before: number };

  /** A new habit at the end of the list. Returns its id, or null for an empty title. */
  add(title: string, days: number, target: number): string | null;
  edit(id: string, fields: HabitEdit): void;
  /** One check-in for today: one row, never a number changed. Returns the row's id. */
  checkIn(id: string): string | null;
  /** Takes back the latest check-in of today for this habit. */
  undo(id: string): void;
  remove(id: string): void;
  restore(id: string): void;
  move(id: string, before: string | null): void;
  /** Re-checks the day now: call it when the app comes back to the front. */
  wake(): void;
}

export interface HabitsEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. */
  utcOffsetMin(): number;
  /** A new row id. */
  id(): string;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
}

export function createHabits(engine: Engine, env: HabitsEnv): Habits & { close(): void } {
  throw new Error('not built yet: createHabits, roadmap section 6');
}
