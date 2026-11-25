// What the Today screen is given. The lead wrote this interface so the ui lane and the core lane
// could build to it at the same time; the core lane fills in createToday.
// Rules: contracts/protocol.md section 12, and section 7 for the ghost.

import { batch, computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { GONE, isDay, isLength, isTime } from '../core/real.ts';
import { localDay } from '../core/stats.ts';
import { view } from '../core/timer.ts';
import { ESTIMATE_MAX, asRepeat, asTask, byOrder, keyBetween, moveKeys, nextTask, plan, plannedLeft, plannedLeftMs, quickAdd, squares, upNext } from '../core/today.ts';
import type { Repeat, Task } from '../core/today.ts';
import { LAP_MAX_MS, createCounts, lapLengths } from './counts.ts';
import { createDay } from './day.ts';
import type { Engine, Row } from './engine.ts';
import type { Focus } from './focus.ts';

export type { Repeat } from '../core/today.ts';
export { ESTIMATE_MAX } from '../core/today.ts';

/** DESIGN.md's twelve project colours by name, in its order. */
export const COLORS = ['you', 'rest', 'ink', 'ghost', 'heat-2', 'amber', 'olive', 'teal', 'sky', 'indigo', 'plum', 'clay'] as const;
/** One of the twelve, or a colour the person picked: `#` and six hex digits. */
export type ProjectColor = (typeof COLORS)[number] | `#${string}`;
/** A hex in capitals is one too; it is written, and shown, in lower case. */
export const isColor = (value: unknown): value is ProjectColor =>
  typeof value === 'string' && ((COLORS as readonly string[]).includes(value) || /^#[0-9a-f]{6}$/i.test(value));
// One spelling of each colour: a name as it is, a hex in lower case.
const asColor = (value: unknown): ProjectColor | null => (isColor(value) ? (value.toLowerCase() as ProjectColor) : null);

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
  /** Whole laps, or null when the person gave none. A row from an older build may hold more than `ESTIMATE_MAX`. */
  estimate: number | null;
  /** The laps on this task: those that rang and those that were stopped. The "2" of "2 of 4". It may pass the estimate. */
  laps: number;
  /** One number per square, oldest first: 1 for a lap that rang, as full as it ran for one stopped or in progress. One more than `laps` while a lap is in progress on it. */
  squares: number[];
  /** The timer is on this task right now, running or paused. */
  running: boolean;
  /** Local day, `2026-11-24`, or null. */
  due: string | null;
  /** Free words for when in the day: "after dinner". */
  when: string | null;
  /** The time of day on `due`, `15:30`. Null when none is set, and while there is no `due` for it to be on (another device may have cleared the day as this one set the time). */
  time: string | null;
  repeat: Repeat;
  /** The task's own lengths for a lap and for the breaks after a lap on it, in ms. Null: the account's. */
  lengths: { work_ms: number | null; short_ms: number | null; long_ms: number | null };
  done: boolean;
  /** When it was deleted, in ms, or null while it is alive. It goes for good 30 days after, or at once by `purge`. */
  deleted: number | null;
  subtasks: SubtaskView[];
}

/** The three figures at the top of Today, and the day target. Times in ms. */
export interface DayFigures {
  done_ms: number;
  /** Today's laps, rang or stopped. */
  laps: number;
  /** One fill per lap of today, oldest first, for the day target's bar: 1 for a lap that rang, less for one stopped. As many as `laps`. */
  fills: number[];
  /** Laps still planned on today's list, and how long they would take, each task's at its own lap length. */
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
  /** `15:30`, or null for none. On a task with no day it sets the day to today as well. */
  time?: string | null;
  repeat?: Repeat;
  /** The task's own lap length in ms, a second to `LAP_MAX_MS`, or null for the account's. */
  work_ms?: number | null;
  /** Its own break lengths in ms, a second to a day as in settings, or null for the account's. */
  short_ms?: number | null;
  long_ms?: number | null;
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
  /**
   * Every task to remind of, for the phone: open, not deleted, with a day and a time on it,
   * subtasks too (but not those of a deleted task, which are on no screen). By day and time.
   * It changes only when a task does, not with the clock.
   */
  readonly timed: ReadonlySignal<readonly { id: string; title: string; day: string; time: string }[]>;
  /** Worked out at the engine's now, the lap in progress included. Call it on every tick. */
  figures(): DayFigures;
  /** Looks at the clock now: after the device slept, `day` and the lists are right as soon as this returns. */
  wake(): void;

  /** Quick add: "pointers chapter 3 ~4". Due today, at the end of the list. Returns the new id, or null for an empty title. */
  add(text: string): string | null;
  edit(id: string, fields: TaskEdit): void;
  /**
   * Done or not done. A repeating task done makes the next one of its series. Done while a lap
   * is running or paused on the task ends that lap as Focus's stop does, in the same write; a
   * lap whose bell has gone is left alone. Not done again within the ten seconds of that stop,
   * with the timer untouched since, puts the lap back too. A subtask ends nothing.
   */
  setDone(id: string, done: boolean): void;
  /** To Recently deleted, for 30 days. */
  remove(id: string): void;
  restore(id: string): void;
  /** Deletes for good a task that is in Recently deleted, its subtasks with it: on no screen again, and no way back. Anything else is left alone. */
  purge(id: string): void;
  /** Puts a task just before another in its list, or at the end with null. */
  move(id: string, before: string | null): void;
  addSubtask(parent: string, title: string): string | null;
  /** A subtask's title, or done. Removing one is `remove`. */
  editSubtask(id: string, fields: { title?: string; done?: boolean }): void;
  /** The name is trimmed and cut at `PROJECT_NAME_MAX`; an empty one makes nothing. */
  addProject(name: string, color: ProjectColor): string | null;
  /** A name is trimmed and cut as in `addProject`; an empty one is ignored. */
  editProject(id: string, fields: { name?: string; color?: ProjectColor; archived?: boolean }): void;
  /** Deletes the project. Its tasks keep it and show none, so `restoreProject` gives each its project back. There is no shelf. */
  removeProject(id: string): void;
  /** The Undo of `removeProject`, here or on another device. */
  restoreProject(id: string): void;
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
  /**
   * The one place a lap is ended and put back. A task marked done while its lap runs ends the
   * lap through it, and the done taken back in time puts the lap back through it. The app always
   * hands it over. Left out (the lists alone, with no Focus beside them), a done ends no lap.
   */
  focus?: Pick<Focus, 'stop' | 'undo'>;
}

/** The most characters a project's name holds: it is a label on a task's row, not a sentence. */
export const PROJECT_NAME_MAX = 24;
// Trimmed, and cut by whole characters: half of an emoji is not a character.
const projectName = (typed: string | undefined): string => [...(typed ?? '').trim()].slice(0, PROJECT_NAME_MAX).join('').trim();
// How often the square of the lap in progress is redrawn: a hundred steps in a 25 minute lap.
const PULSE_MS = 15000;

/** The projects to show, in order: named, and neither deleted nor archived. A colour this build does not know reads as ink; the cell is left as it is. */
export const projectViews = (rows: ReadonlyMap<string, Row>): ProjectView[] =>
  [...rows.values()]
    .filter((p) => typeof p.name === 'string' && typeof p.deleted !== 'number' && typeof p.archived !== 'number')
    .map((p) => ({ id: p.id, order: typeof p.order === 'string' ? p.order : '', name: p.name as string, color: asColor(p.color) ?? 'ink' }))
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

  // Every row that is a task. Apart from the lists, so what depends on the tasks alone does not move with the clock.
  const held = computed(() => {
    const tasks = new Map<string, Task>();
    for (const [id, row] of taskRows.value) {
      const task = asTask(id, row);
      if (task) tasks.set(id, task);
    }
    return tasks;
  });

  const timed = computed(() => {
    const tasks = held.value;
    return [...tasks.values()]
      .flatMap((t) => {
        // A subtask shows inside its parent only: with the parent deleted or not there, it is on no screen.
        const shown = t.parent === null || tasks.get(t.parent)?.deleted === null;
        return t.due !== null && t.time !== null && t.done === null && t.deleted === null && shown ? [{ id: t.id, title: t.title, day: t.due, time: t.time }] : [];
      })
      .sort((a, b) => (`${a.day} ${a.time} ${a.id}` < `${b.day} ${b.time} ${b.id}` ? -1 : 1));
  });

  const model = computed(() => {
    const today = day.value;
    void pulse.value;
    const state = engine.timer.value;
    const now = engine.now();

    const projects = projectViews(projectRows.value);
    const project = new Map(projects.map((p) => [p.id, p]));

    const tasks = held.value;
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
      // A time is a time on a day. One with no day is what two devices can leave between them: it shows as none.
      time: t.due === null ? null : t.time,
      repeat: t.repeat,
      lengths: { work_ms: t.work_ms, short_ms: t.short_ms, long_ms: t.long_ms },
      done: t.done !== null,
      deleted: t.deleted,
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
    const lengths = next.work_ms === of.work_ms && next.short_ms === of.short_ms && next.long_ms === of.long_ms;
    const placed = lengths && next.when === of.when && next.time === of.time && next.order === of.order && sameRule(next.repeat, of.repeat) && next.due === due;
    const used = next.done !== null || model.peek().lists.subtasks.has(next.id) || engine.timer.peek().task === next.id;
    return copied && placed && !used && !counts.sessions.peek().some((s) => s.task === next.id);
  }

  // The idle timer cell written by the stop that the last done made, and the task it was for.
  // While that cell stands, taking the done back asks Focus to take the stop back, and Focus
  // does for as long as it offers an undo: the ten seconds are its to count.
  let ended: { task: string; stamp: string | undefined } | null = null;
  const timerStamp = () => engine.stamp('timer', 'current', 'state');

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
    timed,

    figures() {
      const { left, todays } = model.value;
      const { you_ms, ghost } = counts.race();
      const target = settings()?.day_target;
      const fills = counts.fillsToday();
      return {
        done_ms: you_ms,
        laps: fills.length,
        fills,
        left_laps: left,
        left_ms: plannedLeftMs(todays, lapLengths(settings()).work_ms),
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
      const t = task(id);
      if (!t) return;
      const write: Record<string, unknown> = {};
      const title = fields.title?.trim();
      if (title) write.title = title;
      if (fields.notes !== undefined) write.notes = fields.notes;
      if (fields.project !== undefined) write.project = fields.project;
      const { estimate, due, when, time, repeat } = fields;
      // An estimate stops at the top. A row that held more is brought to it by the first edit of its estimate.
      if (estimate === null) write.estimate = null;
      else if (typeof estimate === 'number' && Number.isInteger(estimate) && estimate >= 1) write.estimate = Math.min(ESTIMATE_MAX, estimate);
      if (due === null || isDay(due)) write.due = due;
      if (when !== undefined) write.when = when?.trim().slice(0, 80) || null;
      if (time === null || isTime(time)) write.time = time;
      // A time is on a day. With none, it is today's, written with it so no device ever holds one without the other.
      if (isTime(time) && ('due' in write ? write.due : t.due) === null) {
        // The day it really is: a list still showing yesterday must not date it then.
        if (day.peek() !== dayNow()) turn();
        write.due = dayNow();
      }
      // The day cleared takes its time with it: left behind, 15:30 would come back, reminder and
      // all, on whatever day is picked next week. Only a time this build reads: another value is not ours to rewrite.
      if (write.due === null && t.time !== null) write.time = null;
      if (repeat !== undefined) write.repeat = asRepeat(repeat);
      // A lap no longer than the longest there is, a break as settings takes one; null gives the length back to the account.
      for (const name of ['work_ms', 'short_ms', 'long_ms'] as const) {
        const length = fields[name];
        if (length === null || (isLength(length) && (name !== 'work_ms' || length <= LAP_MAX_MS))) write[name] = length;
      }
      if (Object.keys(write).length) engine.write('task', id, write);
    },

    setDone(id, done) {
      const t = task(id);
      if (!t || (t.done !== null) === done) return;
      const now = engine.now();
      const { tasks } = model.peek();
      const state = engine.timer.peek();
      // The work is finished, so the lap on it is: left counting, it read as a lap for nothing.
      // Not once its bell has gone: that lap rang, and its break is still offered.
      const lapOn = done && t.parent === null && state.phase === 'work' && state.task === id && !view(state, now).over;
      const lapBack = !done && ended?.task === id && ended.stamp === timerStamp();
      // One turn, so one store transaction: the task done, the lap it ends, and the whole next one of its series.
      batch(() => {
        engine.write('task', id, { done: done ? now : null });
        if (lapOn && env.focus) {
          env.focus.stop();
          ended = { task: id, stamp: timerStamp() };
        }
        if (lapBack) env.focus?.undo();
        if (!t.repeat || t.parent !== null) return;
        // Undoing finds the row by the day the task was done on, which may not be today any more.
        const next = nextTask(id, t.due, done ? dayNow() : localDay(t.done!, env.utcOffsetMin()), t.repeat);
        const held = tasks.get(next.id);
        if (!held) {
          if (!done) return;
          const { project, title, notes, estimate, repeat, when, time, work_ms, short_ms, long_ms, order } = t;
          engine.write('task', next.id, { project, title, notes, estimate, repeat, when, time, work_ms, short_ms, long_ms, order, due: next.due });
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

    purge(id) {
      // Only what is in Recently deleted: nothing goes for good that was not first deleted, and seen there.
      if (model.peek().lists.deleted.some((t) => t.id === id)) engine.write('task', id, { deleted: GONE });
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
      const title = projectName(name);
      const hue = asColor(color);
      if (!title || !hue) return null;
      const id = env.id();
      const keys = [...projectRows.peek().values()].map((p) => ({ order: typeof p.order === 'string' ? p.order : '' })).sort((a, b) => (a.order < b.order ? -1 : 1));
      engine.write('project', id, { name: title, color: hue, order: atEnd(keys) });
      return id;
    },

    editProject(id, fields) {
      const held = projectRows.peek().get(id);
      if (typeof held?.name !== 'string') return;
      const write: Record<string, unknown> = {};
      const name = projectName(fields.name);
      if (name) write.name = name;
      const hue = asColor(fields.color);
      if (hue) write.color = hue;
      if (fields.archived !== undefined && fields.archived !== (typeof held.archived === 'number')) write.archived = fields.archived ? engine.now() : null;
      if (Object.keys(write).length) engine.write('project', id, write);
    },

    removeProject(id) {
      const held = projectRows.peek().get(id);
      if (typeof held?.name === 'string' && typeof held.deleted !== 'number') engine.write('project', id, { deleted: engine.now() });
    },

    restoreProject(id) {
      if (typeof projectRows.peek().get(id)?.deleted === 'number') engine.write('project', id, { deleted: null });
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
