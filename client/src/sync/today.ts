// What the Today screen is given. The lead wrote this interface so the ui lane and the core lane
// could build to it at the same time; the core lane fills in createToday.
// Rules: contracts/protocol.md section 12, and section 7 for the ghost.

import { batch, computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { localDay } from '../core/stats.ts';
import { view } from '../core/timer.ts';
import { asRepeat, asTask, byOrder, keyBetween, moveKeys, nextTask, plan, plannedLeft, quickAdd, squares, upNext } from '../core/today.ts';
import type { Repeat, Task } from '../core/today.ts';
import { createCounts, lapLengths } from './counts.ts';
import { createDay } from './day.ts';
import type { Engine, Row } from './engine.ts';

export type { Repeat } from '../core/today.ts';

export type ProjectColor = 'you' | 'rest' | 'ink' | 'ghost' | 'heat-2';

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
  /** The first task to start: the first of today's open tasks, in order, that is not running. Null when there is none. It is not in `later`. */
  readonly next: ReadonlySignal<TaskView | null>;
  /** The task a lap is running on (counting or paused, bell not yet gone), if it is one of today's open tasks. The same task is also in `later`, in its place: this is the handle for the bar, not a third list. */
  readonly running: ReadonlySignal<TaskView | null>;
  /** Today's open tasks other than `next`, in order, the running one included, in its place. With `next` this is the whole list. */
  readonly later: ReadonlySignal<TaskView[]>;
  /** All of today's open tasks in order: `next` and the running one each in its place. For knowing where `next` sits. */
  readonly list: ReadonlySignal<TaskView[]>;
  /** Open tasks due after today, by day. */
  readonly upcoming: ReadonlySignal<TaskView[]>;
  /** Tasks done today, in the order they were done. */
  readonly done: ReadonlySignal<TaskView[]>;
  /** Deleted in the last 30 days, newest first. */
  readonly deleted: ReadonlySignal<TaskView[]>;
  readonly projects: ReadonlySignal<ProjectView[]>;
  /** Worked out at the engine's now, the lap in progress included. Call it on every tick. */
  figures(): DayFigures;
  /** Looks at the clock now: after the device slept, `day` and the lists are right as soon as this returns. */
  wake(): void;

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

const COLORS: readonly ProjectColor[] = ['you', 'rest', 'ink', 'ghost', 'heat-2'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// How often the square of the lap in progress is redrawn: a hundred steps in a 25 minute lap.
const PULSE_MS = 15000;

/** The projects to show, in order: named, and neither deleted nor archived. A colour this build does not know reads as ink. */
export const projectViews = (rows: ReadonlyMap<string, Row>): ProjectView[] =>
  [...rows.values()]
    .filter((p) => typeof p.name === 'string' && typeof p.deleted !== 'number' && typeof p.archived !== 'number')
    .map((p) => ({ id: p.id, order: typeof p.order === 'string' ? p.order : '', name: p.name as string, color: COLORS.find((c) => c === p.color) ?? 'ink' }))
    .sort(byOrder)
    .map(({ id, name, color }) => ({ id, name, color }));

const sameRule = (a: Repeat, b: Repeat) => a?.every === b?.every && (a?.every !== 'week' || a.days === (b as typeof a).days);

/** `close()` stops the midnight and lap timers: for tests and for Node, where a waiting timer keeps the process alive. */
export function createToday(engine: Engine, env: TodayEnv): Today & { close(): void } {
  const counts = createCounts(engine, env.utcOffsetMin);
  const taskRows = engine.rows('task');
  const projectRows = engine.rows('project');
  const settings = () => engine.rows('settings').value.get('current');
  const clock = createDay(engine, env);
  const { day, now: dayNow, wake: turn } = clock;

  // While a lap runs on a task its square fills, so the lists are worked out again every few
  // seconds, and once more at the bell. Nothing else here moves with the clock.
  const pulse = signal(0);
  let cancelPulse = () => {};
  const stopPulse = effect(() => {
    const s = engine.timer.value;
    void pulse.value;
    untracked(() => {
      cancelPulse();
      cancelPulse = () => {};
      const now = engine.now();
      const { over, ends_at } = view(s, now);
      if (s.phase !== 'work' || s.task === null || over || ends_at === null) return;
      cancelPulse = env.schedule(() => void pulse.value++, Math.min(PULSE_MS, ends_at - now));
    });
  });

  const model = computed(() => {
    const today = day.value;
    void pulse.value;
    const state = engine.timer.value;
    const now = engine.now();

    const projects = projectViews(projectRows.value);
    const project = new Map(projects.map((p) => [p.id, p]));

    const tasks = new Map<string, Task>();
    for (const [id, row] of taskRows.value) {
      const task = asTask(id, row);
      if (task) tasks.set(id, task);
    }
    const lists = plan([...tasks.values()], today, now, env.utcOffsetMin());
    // The timer is on a lap for a task only until that lap rings. After the bell the task is
    // like any other in the list, so the top of the plan decides what the next lap is for.
    const lapOn = state.phase === 'work' && !view(state, now).over ? state.task : null;
    const sessions = counts.live(state, now);

    const show = (t: Task): TaskView => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      // A project that was deleted or archived is no longer shown on its tasks.
      project: (t.project !== null && project.get(t.project)) || null,
      estimate: t.estimate,
      ...squares(sessions, state, now, t.id),
      running: t.id === lapOn,
      due: t.due,
      when: t.when,
      repeat: t.repeat,
      done: t.done !== null,
      subtasks: (lists.subtasks.get(t.id) ?? []).map((sub) => ({ id: sub.id, title: sub.title, done: sub.done !== null })),
    });
    const todays = lists.today.map(show);
    return {
      tasks,
      lists,
      projects,
      todays,
      ...upNext(todays, lapOn),
      left: plannedLeft(todays),
      upcoming: lists.upcoming.map(show),
      done: lists.done.map(show),
      deleted: lists.deleted.map(show),
    };
  });

  const task = (id: string) => model.peek().tasks.get(id);
  // A key after the last of a list: where a new row goes.
  const atEnd = (list: readonly { order: string }[]) => keyBetween(list.at(-1)?.order || null, null);

  // The rows a task is ordered among: its parent's subtasks, today's list, or the tasks due the same day.
  function siblings(t: Task): Task[] {
    const { lists } = model.peek();
    if (t.parent !== null) return lists.subtasks.get(t.parent) ?? [];
    return lists.today.includes(t) ? lists.today : lists.upcoming.filter((other) => other.due === t.due);
  }

  // The next task of the series is still exactly the copy that was made: nobody has edited it,
  // moved it, broken it down, or run a lap on it. Only then is it ours to take away or bring back.
  function untouched(next: Task, of: Task, due: string): boolean {
    const copied = next.project === of.project && next.title === of.title && next.notes === of.notes && next.estimate === of.estimate;
    const placed = next.when === of.when && next.order === of.order && sameRule(next.repeat, of.repeat) && next.due === due;
    const used = next.done !== null || model.peek().lists.subtasks.has(next.id) || engine.timer.peek().task === next.id;
    return copied && placed && !used && !counts.sessions.peek().some((s) => s.task === next.id);
  }

  const today: Today & { close(): void } = {
    day,
    next: computed(() => model.value.next),
    running: computed(() => model.value.running),
    later: computed(() => model.value.later),
    list: computed(() => model.value.todays),
    upcoming: computed(() => model.value.upcoming),
    done: computed(() => model.value.done),
    deleted: computed(() => model.value.deleted),
    projects: computed(() => model.value.projects),

    figures() {
      const { left } = model.value;
      const { you_ms, ghost } = counts.race();
      const target = settings()?.day_target;
      return {
        done_ms: you_ms,
        laps: counts.lapsToday(),
        left_laps: left,
        left_ms: left * lapLengths(settings()).work_ms,
        target: typeof target === 'number' && Number.isInteger(target) && target > 0 ? target : 0,
        ghost: ghost && { day: ghost.day, total_ms: ghost.total_ms, laps: counts.lapsOn(ghost.day) },
      };
    },

    wake: turn,

    add(line) {
      const parsed = quickAdd(line);
      if (!parsed) return null;
      // The new task is due the day it really is. If the list is still showing yesterday, it must not land in Upcoming.
      if (day.peek() !== dayNow()) turn();
      const id = env.id();
      engine.write('task', id, { ...parsed, due: dayNow(), order: atEnd(model.peek().lists.today) });
      return id;
    },

    edit(id, fields) {
      if (!task(id)) return;
      const write: Record<string, unknown> = {};
      const title = fields.title?.trim();
      if (title) write.title = title;
      if (fields.notes !== undefined) write.notes = fields.notes;
      if (fields.project !== undefined) write.project = fields.project;
      const { estimate, due, when, repeat } = fields;
      if (estimate === null || (typeof estimate === 'number' && Number.isInteger(estimate) && estimate >= 1)) write.estimate = estimate;
      if (due === null || (typeof due === 'string' && DAY.test(due))) write.due = due;
      if (when !== undefined) write.when = when?.trim().slice(0, 80) || null;
      if (repeat !== undefined) write.repeat = asRepeat(repeat);
      if (Object.keys(write).length) engine.write('task', id, write);
    },

    setDone(id, done) {
      const t = task(id);
      if (!t || (t.done !== null) === done) return;
      const now = engine.now();
      const { tasks } = model.peek();
      // One turn, so one store transaction: the task done and the whole next one of its series.
      batch(() => {
        engine.write('task', id, { done: done ? now : null });
        if (!t.repeat || t.parent !== null) return;
        // Undoing finds the row by the day the task was done on, which may not be today any more.
        const next = nextTask(id, t.due, done ? dayNow() : localDay(t.done!, env.utcOffsetMin()), t.repeat);
        const held = tasks.get(next.id);
        if (!held) {
          if (!done) return;
          const { project, title, notes, estimate, repeat, when, order } = t;
          engine.write('task', next.id, { project, title, notes, estimate, repeat, when, order, due: next.due });
        } else if ((held.deleted === null) !== done && untouched(held, t, next.due)) {
          engine.write('task', next.id, { deleted: done ? null : now });
        }
      });
    },

    remove(id) {
      if (task(id)?.deleted === null) engine.write('task', id, { deleted: engine.now() });
    },

    restore(id) {
      const t = task(id);
      if (t && t.deleted !== null) engine.write('task', id, { deleted: null });
    },

    move(id, before) {
      const t = task(id);
      if (!t) return;
      // One turn, so one store transaction, also when a neighbour has to make room.
      batch(() => {
        for (const [row, order] of moveKeys(siblings(t), id, before)) engine.write('task', row, { order });
      });
    },

    addSubtask(parent, title) {
      const name = title.trim();
      const of = task(parent);
      // One level: a subtask has none of its own.
      if (!name || !of || of.parent !== null) return null;
      const id = env.id();
      engine.write('task', id, { parent, title: name, order: atEnd(model.peek().lists.subtasks.get(parent) ?? []) });
      return id;
    },

    editSubtask(id, fields) {
      const t = task(id);
      if (!t) return;
      const write: Record<string, unknown> = {};
      const title = fields.title?.trim();
      if (title) write.title = title;
      if (fields.done !== undefined && fields.done !== (t.done !== null)) write.done = fields.done ? engine.now() : null;
      if (Object.keys(write).length) engine.write('task', id, write);
    },

    addProject(name, color) {
      const title = name.trim();
      if (!title || !COLORS.includes(color)) return null;
      const id = env.id();
      const keys = [...projectRows.peek().values()].map((p) => ({ order: typeof p.order === 'string' ? p.order : '' })).sort((a, b) => (a.order < b.order ? -1 : 1));
      engine.write('project', id, { name: title, color, order: atEnd(keys) });
      return id;
    },

    editProject(id, fields) {
      const held = projectRows.peek().get(id);
      if (typeof held?.name !== 'string') return;
      const write: Record<string, unknown> = {};
      const name = fields.name?.trim();
      if (name) write.name = name;
      if (fields.color !== undefined && COLORS.includes(fields.color)) write.color = fields.color;
      if (fields.archived !== undefined && fields.archived !== (typeof held.archived === 'number')) write.archived = fields.archived ? engine.now() : null;
      if (Object.keys(write).length) engine.write('project', id, write);
    },

    setTarget(laps) {
      if (Number.isFinite(laps)) engine.write('settings', 'current', { day_target: Math.max(0, Math.floor(laps)) });
    },

    close() {
      stopPulse();
      cancelPulse();
      clock.close();
    },
  };
  return today;
}
