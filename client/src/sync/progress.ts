// What the Progress screen is given. The lead wrote this interface so the ui lane and the core
// lane could build to it at the same time; the core lane fills in createProgress.
// Rules: contracts/protocol.md section 13, with sections 7 (counting) and 8 (the streak).

import { computed } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { addDays, bests, estimates, outcomeOf, projectShares, since, streakView, weekRace } from '../core/progress.ts';
import type { Bests, Since, StreakView, WeekRace } from '../core/progress.ts';
import { KEPT_MS, isDay } from '../core/real.ts';
import { focusOn, lapDay, localDay, stats, touches } from '../core/stats.ts';
import type { Session } from '../core/stats.ts';
import { pinnedDays } from '../core/streak.ts';
import { asCheckIn, asHabit, fillRounds } from '../core/habits.ts';
import type { CheckIn } from '../core/habits.ts';
import { asTask, squares } from '../core/today.ts';
import { IDLE } from '../core/timer.ts';
import type { Task } from '../core/today.ts';
import { createCounts } from './counts.ts';
import { createDay } from './day.ts';
import type { Engine } from './engine.ts';
import { projectViews } from './today.ts';
import type { ProjectView } from './today.ts';

export type { Bests, Since, StreakView, WeekRace, YearCell } from '../core/progress.ts';

export interface ProjectShare {
  project: ProjectView | null;
  focus_ms: number;
  laps: number;
  /** The same sum over the seven days before. */
  before_ms: number;
  /** All time: every counted session there is whose task is in the project, the lap in progress included. */
  all_ms: number;
}

export interface Estimates {
  /** Laps run for each lap guessed, over tasks done in the last 28 days. Null with no such task. */
  ratio: number | null;
  /** The eight done most recently, newest first. `day` is the local day it was done; `squares` one fill per counted lap, oldest first, each as full as it ran. */
  tasks: { id: string; title: string; estimate: number; laps: number; day: string; squares: number[] }[];
  /** The same ratio for each of the last eight Monday to Sunday weeks, oldest first, this week last. Null for a week with no such task. */
  weeks: { monday: string; ratio: number | null }[];
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
  /** Which of two rows it is drawn on: 1 for an entry that began while the one it overlaps was on row 0, else 0. */
  row: 0 | 1;
  /**
   * Only on the lap in progress, which has no row yet, so nothing to set aside or count again:
   * `running` while it counts, `paused`, or `rang` when its bell has gone and its row is not
   * written yet. It ends where it has got to.
   */
  live?: 'running' | 'paused' | 'rang';
  /** What it added to the day's focus: its counted interval cut to the day, less what the entries before it covered. 0 for a lap not counted and a break. */
  day_ms: number;
  /** The day's focus once it is added: the last is the day's focus. Null for a lap not counted and a break. */
  split_ms: number | null;
  /** What the day's focus loses if it is set aside: the day with it less the day without it. 0 for a lap not counted and a break. */
  off_ms: number;
  /** For one that began on an earlier day: that day, and what it would lose without it. Else null. */
  began: { day: string; ms: number } | null;
  /** For one that ends on a later day: that day, and what it would lose without it. Else null. */
  ends: { day: string; ms: number } | null;
}

/** A moment of the day: a task done (`id` is the task's), or a habit checked in (`id` is the check-in's, `title` the habit's). */
export type Moment = { kind: 'done'; id: string; at: number; title: string } | { kind: 'checkin'; id: string; habit: string; at: number; title: string };

export interface DayView {
  day: string;
  /** The day's focus, the lap in progress included: the last split. */
  focus_ms: number;
  /** The laps counted on the day, the day each ended. */
  laps: number;
  /** Its sessions and moments in the order the day ran, the lap in progress last. */
  items: (TimelineEntry | Moment)[];
}

export interface Progress {
  /** Worked out at the engine's now, the lap in progress included. Call it on every tick. */
  week(): WeekRace;
  projects(): ProjectShare[];
  /** The local day, `2026-11-24`. It changes at midnight and on `wake()`. */
  readonly today: ReadonlySignal<string>;
  /** The one line about any day, '' when there is none. */
  note(day: string): string;
  /** These change when a session row does, and at local midnight. */
  readonly streak: ReadonlySignal<StreakView>;
  readonly since: ReadonlySignal<Since>;
  readonly bests: ReadonlySignal<Bests>;
  readonly estimates: ReadonlySignal<Estimates>;
  /** The day, lap by lap: its sessions and moments in one list, with its focus and laps. */
  day(day: string): DayView;

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

const DAY_MS = 86400000;
const NOTE_MAX = 280;

/**
 * `close()` stops the midnight timer. `recomputed()` says how many times the whole history has
 * been worked through: it is there for the test that proves this is not every keystroke.
 */
export function createProgress(engine: Engine, env: ProgressEnv): Progress & { close(): void; recomputed(): number } {
  const counts = createCounts(engine, env.utcOffsetMin);
  const clock = createDay(engine, env);
  const sessionRows = engine.rows('session');
  const offset = () => env.utcOffsetMin();

  // The one pass over every session there is. Everything below reads this, and it is worked out
  // again only when a session row has changed AND someone asks: a computed with nobody reading
  // it does nothing. Task rows, the timer and the clock are not read here, so typing a title or
  // starting a lap leaves it as it is.
  // The account's pinned rest days: changing them moves the streak's rest, not the history.
  const restDays = computed(() => pinnedDays(engine.rows('settings').value.get('current')?.rest_days));

  let passes = 0;
  const history = computed(() => {
    passes += 1;
    const sessions = counts.sessions.value;
    const { days, overlaps } = stats(sessions, offset());
    const ofTask = new Map<string | null, Session[]>();
    // The days a streak keeps: what is earned needs the bell, so a day of stopped laps has laps and is not kept.
    const kept = new Set<string>();
    for (const session of sessions) {
      if (session.kind === 'work' && session.outcome === 'rang') kept.add(lapDay(session, offset()));
      (ofTask.get(session.task) ?? ofTask.set(session.task, []).get(session.task)!).push(session);
    }
    // All the focus there has ever been on each task, and on no task: counted as a day is, the
    // minutes two devices ran at once on the one task counted once.
    // And each task's laps as its row draws them, rang or stopped, from its rows alone: one fill
    // per lap, so the count is the length.
    const taskFocus = new Map<string | null, number>();
    const taskFills = new Map<string, number[]>();
    for (const [task, list] of ofTask) {
      taskFocus.set(task, Object.values(stats(list, offset()).days).reduce((sum, day) => sum + day.focus_ms, 0));
      if (task !== null) taskFills.set(task, squares(list, IDLE, 0, task).squares);
    }
    return { days, kept, overlapping: new Set(overlaps.flat()), byDay: counts.byDay.value, taskFills, taskFocus };
  });

  const tasks = computed(() => {
    const all = new Map<string, Task>();
    for (const [id, row] of engine.rows('task').value) {
      const task = asTask(id, row);
      if (task) all.set(id, task);
    }
    return all;
  });
  const projects = computed(() => new Map(projectViews(engine.rows('project').value).map((p) => [p.id, p])));
  // The project a lap's minutes are counted under: none for no task, a task with none, or a
  // project archived or deleted. A task deleted, even for good, keeps its time in its project.
  const projectOf = (task: string | null): ProjectView | null => {
    const project = task === null ? null : tasks.value.get(task)?.project;
    return (project && projects.value.get(project)) || null;
  };

  // The day's moments by local day, worked out again when a task, a habit or a check-in changes:
  // tasks done (top level, not deleted) and live check-ins of a habit that is still there.
  const moments = computed(() => {
    const byDay = new Map<string, Moment[]>();
    const add = (moment: Moment, day = localDay(moment.at, offset())) => (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(moment);
    for (const t of tasks.value.values()) if (t.parent === null && t.deleted === null && t.done !== null) add({ kind: 'done', id: t.id, at: t.done, title: t.title });
    // A check-in shows as Habits counts it, on the day it counts for and only when it fills a
    // round, so a round ticked on two devices, or a tap past the target, is not said twice.
    const habits = engine.rows('habit').value;
    const live = new Map<string, CheckIn[]>();
    for (const [id, row] of engine.rows('checkin').value) {
      const c = asCheckIn(id, row);
      const key = c && `${c.habit} ${c.day}`;
      if (c && key) (live.get(key) ?? live.set(key, []).get(key)!).push(c);
    }
    for (const list of live.values()) {
      const held = habits.get(list[0]!.habit);
      const habit = held && asHabit(list[0]!.habit, held);
      if (habit && habit.deleted === null)
        for (const c of fillRounds(list, habit.target)) if (c) add({ kind: 'checkin', id: c.id, habit: habit.id, at: c.at, title: habit.title }, c.day);
    }
    return byDay;
  });

  // All time per project: its tasks' totals added up. Worked out again when a task moves project
  // or a session changes, from the totals the one pass already made, not from the sessions.
  const allTime = computed(() => {
    const totals = new Map<string | null, number>();
    for (const [task, focus] of history.value.taskFocus) {
      const project = projectOf(task)?.id ?? null;
      totals.set(project, (totals.get(project) ?? 0) + focus);
    }
    return totals;
  });

  return {
    week() {
      const now = engine.now();
      const today = localDay(now, offset());
      void clock.day.value;
      const day = addDays(today, -7);
      return weekRace(history.value.days, today, counts.race().you_ms, focusOn(history.value.byDay.get(day) ?? [], day, offset(), now - 7 * DAY_MS));
    },

    projects() {
      const now = engine.now();
      const today = localDay(now, offset());
      void clock.day.value;
      // The lap in progress is in this week's figure, so it is in the all-time one too: what it
      // has run so far, less whatever a row for it already holds.
      const open = counts.open(now);
      const running = counts.unwritten(now);
      const runningFor = open ? (projectOf(open.task)?.id ?? null) : undefined;
      // The sessions that touch these fourteen days, each once, the lap in progress in the place
      // of its row. One that reaches past an edge brings its minutes from the other side:
      // projectShares keeps only the days it wants.
      const within = new Set<Session>();
      for (let day = addDays(today, -13); day <= today; day = addDays(day, 1)) for (const session of history.value.byDay.get(day) ?? []) if (session.id !== open?.id) within.add(session);
      if (open) within.add(open);
      return projectShares([...within], (session) => projectOf(session.task)?.id ?? null, today, offset()).map(
        ({ project, ...sums }) => ({
          project: (project !== null && projects.value.get(project)) || null,
          ...sums,
          // The lap in progress gives its minutes and is no lap yet: it becomes one at its bell or when it is stopped.
          laps: sums.laps - (open?.outcome === 'stopped' && project === runningFor ? 1 : 0),
          all_ms: (allTime.value.get(project) ?? 0) + (project === runningFor ? running : 0),
        }),
      );
    },


    streak: computed(() => streakView(history.value.kept, clock.day.value, restDays.value)),
    since: computed(() => since(history.value.days, history.value.kept, clock.day.value, restDays.value)),
    bests: computed(() => bests(history.value.days)),
    estimates: computed(() => {
      const fills = history.value.taskFills;
      const made = estimates([...tasks.value.values()], (id) => fills.get(id)?.length ?? 0, clock.day.value, offset());
      return { ...made, tasks: made.tasks.map((t) => ({ ...t, squares: fills.get(t.id) ?? [] })) };
    }),

    today: clock.day,

    note(day) {
      const note = engine.rows('day').value.get(day)?.note;
      return typeof note === 'string' ? note : '';
    },

    day(day) {
      const now = engine.now();
      // The lap in progress, in its days as far as it has run, in the place of any row it has outgrown.
      const open = counts.open(now);
      // Every session whose time touches a day, one across midnight in both days.
      const on = (d: string) => {
        const rows = history.value.byDay.get(d) ?? [];
        return open && touches(open, offset()).includes(d) ? [...rows.filter((session) => session.id !== open.id), open] : rows;
      };
      // What day `d` loses without `lap`: its focus with the day's counted laps less without it,
      // so a lap that ran beside another takes off only what was its alone. Cut at now, as the race is.
      const loss = (lap: Session, d: string) => {
        const all = on(d);
        return focusOn(all, d, offset(), now) - focusOn(all.filter((session) => session !== lap), d, offset(), now);
      };
      const sessions = on(day);
      // The first of a pair to start is on row 0 and the one that began during it on row 1, here
      // and nowhere else, so every screen draws the pair the same way. By start, whichever is drawn last.
      const rows = new Map<Session, 0 | 1>();
      let upper = -Infinity;
      for (const session of sessions.toSorted((a, b) => a.started - b.started)) {
        const overlap = history.value.overlapping.has(session.id);
        rows.set(session, overlap && session.started < upper ? 1 : 0);
        if (overlap && rows.get(session) === 0) upper = session.ended;
      }
      // Sessions at their start and moments at their time, the lap in progress last: it is the
      // one still being added to. The sort is stable, so a moment at the very minute a lap began
      // comes after it.
      const at = (item: Session | Moment) => (item === open ? Infinity : 'at' in item ? item.at : item.started);
      // Each split is the union of the counted laps so far, cut to the day and at now: the last
      // is the day's focus, and today's is the race's figure.
      const counted: Session[] = [];
      let focus_ms = 0;
      const items = [...sessions, ...(moments.value.get(day) ?? [])]
        .sort((a, b) => at(a) - at(b))
        .map((session): TimelineEntry | Moment => {
          if ('at' in session) return session;
          // The task a lap is named for: one still to be seen somewhere, deleted ones while they
          // are in Recently deleted. The lap itself is the day's whatever became of its task.
          const held = session.task === null ? undefined : tasks.value.get(session.task);
          const task = held && (held.deleted === null || now - held.deleted < KEPT_MS) ? held : undefined;
          const adds = session.kind === 'work' && session.outcome !== 'void';
          if (adds) counted.push(session);
          const split_ms = adds ? focusOn(counted, day, offset(), now) : null;
          const day_ms = split_ms === null ? 0 : split_ms - focus_ms;
          focus_ms = split_ms ?? focus_ms;
          const [began, ends] = [localDay(session.started, offset()), localDay(session.ended, offset())];
          return {
            id: session.id,
            kind: session.kind,
            outcome: session.outcome,
            started: session.started,
            ended: session.ended,
            ran_ms: Math.max(0, session.ended - session.started - session.paused_ms),
            task: task ? { id: task.id, title: task.title } : null,
            // Named only with its task: purged, the lap is named by nothing, though its minutes stay in the project's totals.
            project: task ? projectOf(task.id) : null,
            overlap: history.value.overlapping.has(session.id),
            row: rows.get(session)!,
            ...(session === open && { live: open.outcome === 'rang' ? ('rang' as const) : engine.timer.value.paused_at !== null ? ('paused' as const) : ('running' as const) }),
            day_ms,
            split_ms,
            off_ms: loss(session, day),
            // What setting it aside takes off the days on either side, for "Its first 14 minutes count there".
            began: began < day ? { day: began, ms: loss(session, began) } : null,
            ends: ends > day ? { day: ends, ms: loss(session, ends) } : null,
          };
        });
      return { day, focus_ms, laps: day === clock.day.value ? counts.lapsToday() : (history.value.days[day]?.laps ?? 0), items };
    },

    setAside(id) {
      const row = sessionRows.peek().get(id);
      if (row?.kind === 'work' && (row.outcome === 'rang' || row.outcome === 'stopped')) engine.write('session', id, { outcome: 'void' });
    },

    countAgain(id) {
      const session = counts.sessions.peek().find((row) => row.id === id);
      if (session?.kind === 'work' && session.outcome === 'void') engine.write('session', id, { outcome: outcomeOf(session) });
    },

    setNote(day, text) {
      if (isDay(day)) engine.write('day', day, { note: text.trim().slice(0, NOTE_MAX) });
    },

    wake: clock.wake,
    close: clock.close,
    recomputed: () => passes,
  };
}
