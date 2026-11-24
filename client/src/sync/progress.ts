// What the Progress screen is given. The lead wrote this interface so the ui lane and the core
// lane could build to it at the same time; the core lane fills in createProgress.
// Rules: contracts/protocol.md section 13, with sections 7 (counting) and 8 (the streak).

import { computed } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { addDays, bests, estimates, outcomeOf, projectShares, since, streakView, weekRace } from '../core/progress.ts';
import type { Bests, Since, StreakView, WeekRace } from '../core/progress.ts';
import { focusOf, localDay, stats } from '../core/stats.ts';
import type { Session } from '../core/stats.ts';
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

const DAY_MS = 86400000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
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
  let passes = 0;
  const history = computed(() => {
    passes += 1;
    const sessions = counts.sessions.value;
    const { days, overlaps } = stats(sessions, offset());
    const taskLaps = new Map<string, number>();
    for (const session of sessions) {
      if (session.task !== null && session.kind === 'work' && session.outcome === 'rang') taskLaps.set(session.task, (taskLaps.get(session.task) ?? 0) + 1);
    }
    return { days, overlapping: new Set(overlaps.flat()), byDay: counts.byDay.value, taskLaps };
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
  // The project a task is shown under: none for no task, a task with none, or a project archived or deleted.
  const projectOf = (task: string | null): ProjectView | null => {
    const project = task === null ? null : tasks.value.get(task)?.project;
    return (project && projects.value.get(project)) || null;
  };

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
      return projectShares(between(addDays(today, -13), today, now), (session) => projectOf(session.task)?.id ?? null, today, offset()).map(
        ({ project, ...sums }) => ({ project: (project !== null && projects.value.get(project)) || null, ...sums }),
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

    streak: computed(() => streakView(history.value.days, clock.day.value)),
    since: computed(() => since(history.value.days, clock.day.value)),
    bests: computed(() => bests(history.value.days)),
    estimates: computed(() => estimates([...tasks.value.values()], (id) => history.value.taskLaps.get(id) ?? 0, clock.day.value, offset())),

    timeline(day) {
      const { byDay, overlapping } = history.value;
      return (byDay.get(day) ?? [])
        .toSorted((a, b) => a.started - b.started)
        .map((session) => {
          const task = session.task === null ? undefined : tasks.value.get(session.task);
          return {
            id: session.id,
            kind: session.kind,
            outcome: session.outcome,
            started: session.started,
            ended: session.ended,
            ran_ms: Math.max(0, session.ended - session.started - session.paused_ms),
            task: task ? { id: task.id, title: task.title } : null,
            project: projectOf(session.task),
            overlap: overlapping.has(session.id),
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
      if (DAY.test(day)) engine.write('day', day, { note: text.trim().slice(0, NOTE_MAX) });
    },

    wake: clock.wake,
    close: clock.close,
    recomputed: () => passes,
  };
}
