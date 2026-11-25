// Marks: contracts/protocol.md section 16. A mark is for something achieved, never for opening
// the app. This file says what has been achieved and when; who gets shown it, and only once, is
// for the caller, which knows what this device did and what has been shown already.

import { addDays, mondayOf, weekTotals } from './progress.ts';
import type { Days } from './progress.ts';
import { localDay } from './stats.ts';
import type { Session } from './stats.ts';
import type { Task } from './today.ts';

/** A mark for something that was achieved, never for showing up. */
export type Mark = {
  /** Its key in `settings.marks`: `laps-25`, `estimate-<task id>`, `week-<monday>`. One mark, one key, so a list of them can be keyed by it. */
  key: string;
} & (
  | /** The total of laps that rang has reached a tier: 1, 4, 25, 100, 250, 500, 1000, 2500. */ { kind: 'laps'; tier: number }
  | /** A task was done with its laps at or under its estimate. */ { kind: 'estimate'; task: string; title: string; estimate: number; laps: number }
  | /** This week has passed the best week before it. */ { kind: 'week'; focus_ms: number; before_ms: number }
);

export const TIERS = [1, 4, 25, 100, 250, 500, 1000, 2500];

/** Something achieved: its key in `settings.marks`, the moment it was, and the cell whose writing made it so. */
export interface Earned {
  key: string;
  at: number;
  mark: Mark;
  cell: [dataset: string, row: string, field: string];
}

const counted = (s: Session) => s.kind === 'work' && s.outcome !== 'void';

const ESTIMATE_KEYS = 100;

/**
 * The keys of marks already shown that are kept when the next is written: those whose mark could
 * come up again. A lap tier's always, since there are eight. A week's while that week is the
 * current one or the one before. Of the rest, one for each task done within its estimate, the
 * newest hundred: the one cell they live in must stay small.
 */
export function keysKept(shown: Readonly<Record<string, unknown>>, today: string): [key: string, at: number][] {
  const all = Object.entries(shown).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
  const lastWeek = addDays(mondayOf(today), -7);
  const rest = all.filter(([key]) => !key.startsWith('laps-') && !key.startsWith('week-')).sort((a, b) => b[1] - a[1]);
  const newest = new Set(rest.slice(0, ESTIMATE_KEYS).map(([key]) => key));
  return all.filter(([key]) => key.startsWith('laps-') || (key.startsWith('week-') ? key.slice(5) >= lastWeek : newest.has(key)));
}

/** The lap tiers reached, and this week if it has passed the best week before it. */
export function lapMarks(sessions: readonly Session[], days: Days, today: string, utcOffsetMin: number): Earned[] {
  const rang = sessions.filter((s) => s.kind === 'work' && s.outcome === 'rang').sort((a, b) => a.ended - b.ended);
  const out: Earned[] = TIERS.filter((tier) => rang.length >= tier).map((tier) => {
    // The lap that made the total reach the tier.
    const lap = rang[tier - 1]!;
    const key = `laps-${tier}`;
    return { key, at: lap.ended, mark: { key, kind: 'laps', tier }, cell: ['session', lap.id, 'outcome'] };
  });

  const monday = mondayOf(today);
  const weeks = weekTotals(days);
  const before = [...weeks].filter(([week, focus]) => week < monday && focus > 0).map(([, focus]) => focus);
  const focus_ms = weeks.get(monday) ?? 0;
  // Only once there is a week before it: a first week has nothing to pass.
  if (before.length && focus_ms > Math.max(...before)) {
    const latest = sessions.filter((s) => counted(s) && localDay(s.started, utcOffsetMin) >= monday).sort((a, b) => b.ended - a.ended)[0];
    const key = `week-${monday}`;
    if (latest) out.push({ key, at: latest.ended, mark: { key, kind: 'week', focus_ms, before_ms: Math.max(...before) }, cell: ['session', latest.id, 'ended'] });
  }
  return out;
}

/** Tasks done with their laps at or under the estimate. A task with no lap at all has kept no estimate. */
export function taskMarks(tasks: readonly Task[], lapsOf: (task: string) => number): Earned[] {
  return tasks.flatMap((task): Earned[] => {
    const laps = lapsOf(task.id);
    if (task.done === null || task.estimate === null || task.deleted !== null || laps < 1 || laps > task.estimate) return [];
    const key = `estimate-${task.id}`;
    return [{ key, at: task.done, mark: { key, kind: 'estimate', task: task.id, title: task.title, estimate: task.estimate, laps }, cell: ['task', task.id, 'done'] }];
  });
}
