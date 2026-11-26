// What the Progress screen is given. The lead wrote this interface so the ui lane and the core
// lane could build to it at the same time; the core lane fills in createProgress.
// Rules: contracts/protocol.md section 13, with sections 7 (counting) and 8 (the streak).

import { computed } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { addDays, bests, estimates, outcomeOf, projectShares, since, streakView, weekRace } from '../core/progress.ts';
import type { Bests, Since, StreakView, WeekRace } from '../core/progress.ts';
import { KEPT_MS, isDay } from '../core/real.ts';
import { focusOf, localDay, stats } from '../core/stats.ts';
import type { Session } from '../core/stats.ts';
import { pinnedDays } from '../core/streak.ts';
import { asTask } from '../core/today.ts';
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
  /** The eight done most recently, newest first. */
  tasks: { id: string; title: string; estimate: number; laps: number }[];
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
  /** The local day, `2026-11-24`. It changes at midnight and on `wake()`. */
  readonly today: ReadonlySignal<string>;
  /** The one line about any day, '' when there is none. */
  note(day: string): string;
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
    const taskLaps = new Map<string, number>();
    const ofTask = new Map<string | null, Session[]>();
    // The days a streak keeps: what is earned needs the bell, so a day of stopped laps has laps and is not kept.
    const kept = new Set<string>();
    for (const session of sessions) {
      if (session.kind === 'work' && session.outcome === 'rang') kept.add(localDay(session.started, offset()));
      // A task's laps are counted as the task shows them: rang or stopped.
      if (session.task !== null && session.kind === 'work' && session.outcome !== 'void') taskLaps.set(session.task, (taskLaps.get(session.task) ?? 0) + 1);
      const list = ofTask.get(session.task);
      if (list) list.push(session);
      else ofTask.set(session.task, [session]);
    }
    // All the focus there has ever been on each task, and on no task: counted as a day is, the
    // minutes two devices ran at once on the one task counted once.
    const taskFocus = new Map<string | null, number>();
    for (const [task, list] of ofTask) {
      taskFocus.set(task, Object.values(stats(list, offset()).days).reduce((sum, day) => sum + day.focus_ms, 0));
    }
    return { days, kept, overlapping: new Set(overlaps.flat()), byDay: counts.byDay.value, taskLaps, taskFocus };
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
  // The task a lap is named for: one still to be seen somewhere, deleted ones while they are in
  // Recently deleted. The lap itself is the day's whatever became of its task.
  const named = (task: string | null): Task | undefined => {
    const held = task === null ? undefined : tasks.value.get(task);
    return held && (held.deleted === null || engine.now() - held.deleted < KEPT_MS) ? held : undefined;
  };
  // The project a lap's minutes are counted under: none for no task, a task with none, or a
  // project archived or deleted. A task deleted, even for good, keeps its time in its project.
  const projectOf = (task: string | null): ProjectView | null => {
    const project = task === null ? null : tasks.value.get(task)?.project;
    return (project && projects.value.get(project)) || null;
  };

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

  // The sessions of the days from `from` to `to`, with the lap in progress in the place of its row.
  function between(from: string, to: string, now: number): Session[] {
    const open = counts.open(now);
    const out: Session[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) out.push(...(history.value.byDay.get(day) ?? []));
    return open ? [...out.filter((session) => session.id !== open.id), open] : out;
  }

  return {
    week() {
      const now = engine.now();
      const today = localDay(now, offset());
      void clock.day.value;
      const lastWeek = history.value.byDay.get(addDays(today, -7)) ?? [];
      return weekRace(history.value.days, today, counts.race().you_ms, focusOf(lastWeek, now - 7 * DAY_MS));
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
      return projectShares(between(addDays(today, -13), today, now), (session) => projectOf(session.task)?.id ?? null, today, offset()).map(
        ({ project, ...sums }) => ({
          project: (project !== null && projects.value.get(project)) || null,
          ...sums,
          // The lap in progress gives its minutes and is no lap yet: it becomes one at its bell or when it is stopped.
          laps: sums.laps - (open?.outcome === 'stopped' && project === runningFor ? 1 : 0),
          all_ms: (allTime.value.get(project) ?? 0) + (project === runningFor ? running : 0),
        }),
      );
    },

    lookBack() {
      const now = engine.now();
      const day = localDay(now, offset());
      void clock.day.value;
      const note = engine.rows('day').value.get(day)?.note;
      const done = [...tasks.value.values()]
        .filter((t) => t.parent === null && t.deleted === null && t.done !== null && localDay(t.done, offset()) === day)
        .sort((a, b) => a.done! - b.done!);
      return {
        day,
        focus_ms: counts.race().you_ms,
        laps: counts.lapsToday(),
        done: done.map((t) => ({ id: t.id, title: t.title, estimate: t.estimate, laps: history.value.taskLaps.get(t.id) ?? 0 })),
        note: typeof note === 'string' ? note : '',
      };
    },

    streak: computed(() => streakView(history.value.kept, clock.day.value, restDays.value)),
    since: computed(() => since(history.value.days, history.value.kept, clock.day.value, restDays.value)),
    bests: computed(() => bests(history.value.days)),
    estimates: computed(() => estimates([...tasks.value.values()], (id) => history.value.taskLaps.get(id) ?? 0, clock.day.value, offset())),

    today: clock.day,

    note(day) {
      const note = engine.rows('day').value.get(day)?.note;
      return typeof note === 'string' ? note : '';
    },

    timeline(day) {
      const { byDay, overlapping } = history.value;
      // The lap in progress is in its day as far as it has run, in the place of any row it has outgrown.
      const open = counts.open(engine.now());
      const rows = byDay.get(day) ?? [];
      const sessions = open && localDay(open.started, offset()) === day ? [...rows.filter((session) => session.id !== open.id), open] : rows;
      // The first of a pair to start is on row 0 and the one that began during it on row 1, here
      // and nowhere else, so every screen draws the pair the same way.
      let upper = -Infinity;
      return sessions
        .toSorted((a, b) => a.started - b.started)
        .map((session) => {
          const task = named(session.task);
          const overlap = overlapping.has(session.id);
          const row = overlap && session.started < upper ? 1 : 0;
          if (overlap && row === 0) upper = session.ended;
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
            overlap,
            row,
            ...(session === open && { live: open.outcome === 'rang' ? ('rang' as const) : engine.timer.value.paused_at !== null ? ('paused' as const) : ('running' as const) }),
          };
        });
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
