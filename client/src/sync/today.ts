// What the Today screen is given. The lead wrote this interface so the ui lane and the core lane
// could build to it at the same time; the core lane fills in createToday.
// Rules: contracts/protocol.md section 12, and section 7 for the ghost.

import type { ReadonlySignal } from '@preact/signals-core';
import type { Engine } from './engine.ts';

export type ProjectColor = 'you' | 'rest' | 'ink' | 'ghost' | 'heat-2';
export type Repeat = { every: 'day' } | { every: 'week'; days: number } | null;

export interface ProjectView {
  id: string;
  name: string;
  color: ProjectColor;
}

export interface SubtaskView {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskView {
  id: string;
  title: string;
  notes: string;
  project: ProjectView | null;
  /** Whole laps, or null when the person gave none. */
  estimate: number | null;
  /** Laps that rang on this task. The "2" of "2 of 4". It may pass the estimate. */
  laps: number;
  /** One number per square, oldest first: 1 for a lap that rang, a share for one stopped or in progress. */
  squares: number[];
  /** The timer is on this task right now, running or paused. */
  running: boolean;
  /** Local day, `2026-11-24`, or null. */
  due: string | null;
  /** Free words for when in the day: "after dinner". */
  when: string | null;
  repeat: Repeat;
  done: boolean;
  subtasks: SubtaskView[];
}

/** The three figures at the top of Today, and the day target. Times in ms. */
export interface DayFigures {
  done_ms: number;
  laps: number;
  /** Laps still planned on today's list, and how long they would take at the current lap length. */
  left_laps: number;
  left_ms: number;
  /** The day target in laps, 0 when none is set. */
  target: number;
  /** The ghost's whole day, for "Last Tuesday 3h 20m, 8 laps". Null on a first day. */
  ghost: { day: string; total_ms: number; laps: number } | null;
}

export interface TaskEdit {
  title?: string;
  notes?: string;
  project?: string | null;
  estimate?: number | null;
  due?: string | null;
  when?: string | null;
  repeat?: Repeat;
}

export interface Today {
  /** The local day, `2026-11-24`. It changes at midnight, and the lists with it. */
  readonly day: ReadonlySignal<string>;
  /** The first task to start: the top of today's list that is not the one running. */
  readonly next: ReadonlySignal<TaskView | null>;
  /** The task the timer is on, if it is one of today's. */
  readonly running: ReadonlySignal<TaskView | null>;
  /** The rest of today's open tasks, in order. */
  readonly later: ReadonlySignal<TaskView[]>;
  /** Open tasks due after today, by day. */
  readonly upcoming: ReadonlySignal<TaskView[]>;
  /** Tasks done today, in the order they were done. */
  readonly done: ReadonlySignal<TaskView[]>;
  /** Deleted in the last 30 days, newest first. */
  readonly deleted: ReadonlySignal<TaskView[]>;
  readonly projects: ReadonlySignal<ProjectView[]>;
  /** Worked out at the engine's now, the lap in progress included. Call it on every tick. */
  figures(): DayFigures;

  /** Quick add: "pointers chapter 3 ~4". Due today, at the end of the list. Returns the new id, or null for an empty title. */
  add(text: string): string | null;
  edit(id: string, fields: TaskEdit): void;
  /** Done or not done. A repeating task done makes the next one of its series. */
  setDone(id: string, done: boolean): void;
  /** To Recently deleted, for 30 days. */
  remove(id: string): void;
  restore(id: string): void;
  /** Puts a task just before another in its list, or at the end with null. */
  move(id: string, before: string | null): void;
  addSubtask(parent: string, title: string): string | null;
  /** A subtask's title, or done. Removing one is `remove`. */
  editSubtask(id: string, fields: { title?: string; done?: boolean }): void;
  addProject(name: string, color: ProjectColor): string | null;
  editProject(id: string, fields: { name?: string; color?: ProjectColor; archived?: boolean }): void;
  /** The day target in laps. 0 clears it. */
  setTarget(laps: number): void;
}

export interface TodayEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. */
  utcOffsetMin(): number;
  /** A new row id. */
  id(): string;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
}

export function createToday(engine: Engine, env: TodayEnv): Today & { close(): void } {
  throw new Error('not built yet: createToday, roadmap section 4');
}
