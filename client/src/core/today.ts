// The rules behind the Today screen: contracts/protocol.md section 12.

import type { Session } from './stats.ts';
import { localDay } from './stats.ts';
import { weekday } from './streak.ts';
import { view } from './timer.ts';
import type { TimerState } from './timer.ts';

export type Repeat = { every: 'day' } | { every: 'week'; days: number } | null;

/** A task row with every field in its place: what is missing or malformed reads as unset. */
export interface Task {
  id: string;
  title: string;
  notes: string;
  project: string | null;
  estimate: number | null;
  parent: string | null;
  due: string | null;
  repeat: Repeat;
  when: string | null;
  done: number | null;
  /** '' when the row has none yet: it sorts first. */
  order: string;
  deleted: number | null;
}

const DAY_MS = 86400000;
const KEPT_MS = 30 * DAY_MS;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const time = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** A repeat rule as the schema has it, or null for anything else. */
export function asRepeat(v: unknown): Repeat {
  const r = v as { every?: unknown; days?: unknown } | null;
  if (r?.every === 'day') return { every: 'day' };
  const days = r?.days;
  return r?.every === 'week' && typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 127
    ? { every: 'week', days }
    : null;
}

/**
 * A row is a task when it has a title. A row still arriving cell by cell, or one a newer build
 * wrote differently, is not one yet: it is kept and sent on, and shown when its title comes.
 */
export function asTask(id: string, row: Readonly<Record<string, unknown>>): Task | null {
  if (typeof row.title !== 'string') return null;
  const estimate = row.estimate;
  const due = text(row.due);
  return {
    id,
    title: row.title,
    notes: text(row.notes) ?? '',
    project: text(row.project),
    estimate: typeof estimate === 'number' && Number.isInteger(estimate) && estimate >= 1 ? estimate : null,
    parent: text(row.parent),
    due: due !== null && DAY.test(due) ? due : null,
    repeat: asRepeat(row.repeat),
    when: text(row.when) || null,
    done: time(row.done),
    order: text(row.order) ?? '',
    deleted: time(row.deleted),
  };
}

/** One line of text as one task: "pointers chapter 3 ~4". Null when there is no title in it. */
export function quickAdd(line: string): { title: string; estimate: number | null } | null {
  const trimmed = line.trim();
  const found = /(?:^|\s)~([1-9]\d?)$/.exec(trimmed);
  const title = found ? trimmed.slice(0, found.index).trim() : trimmed;
  return title ? { title, estimate: found ? Number(found[1]) : null } : null;
}

/** The first day strictly after `day` that the rule allows. */
export function dayAfter(repeat: Repeat, day: string): string {
  // A mask with no day in it is no rule at all; it reads as every day rather than as never.
  const days = repeat?.every === 'week' && repeat.days & 127 ? repeat.days : 127;
  let ms = Date.parse(day) + DAY_MS;
  while (!((days >> weekday(ms)) & 1)) ms += DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The next task of a series, made when one is marked done on `today`. Its id comes from the
 * series and its day alone, so two devices that mark the same task done offline make the same row.
 */
export function nextTask(id: string, due: string | null, today: string, repeat: Repeat): { id: string; due: string } {
  // Days missed are not owed: counted from today when the task was due before it.
  const next = dayAfter(repeat, due !== null && due > today ? due : today);
  return { id: `${id.replace(/-\d{8}$/, '')}-${next.replaceAll('-', '')}`, due: next };
}

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MIDDLE = 'V';

// A key strictly between `a` and `b`, read as fractions in base 62. '' is the lowest there is,
// null the open top. Halves the gap, so a gap can be split about 380 times before a key passes
// 64 characters.
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // The common start is kept. `a` runs out first and reads as zeros from there; `b` cannot,
    // because no key ends in 0.
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const low = a ? DIGITS.indexOf(a[0]!) : 0;
  const high = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;
  if (high - low > 1) return DIGITS[Math.round((low + high) / 2)]!;
  // Neighbouring digits. If `b` goes on, its first digit alone is already below it.
  if (b !== null && b.length > 1) return b[0]!;
  return DIGITS[low]! + midpoint(a.slice(1), null);
}

/**
 * An order key between two neighbours; null is the open end. 0-9 A-Z a-z, compared as a plain
 * string, never ending in 0. At the open ends it steps instead of halving, since the end of a
 * list is where nearly every row goes: 200 rows added one after another make a key of 7 characters.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (!a && !b) return MIDDLE;
  if (!b) {
    // One more in the first place that has room.
    const i = [...a!].findIndex((digit) => digit !== 'z');
    return i < 0 ? a + MIDDLE : a!.slice(0, i) + DIGITS[DIGITS.indexOf(a![i]!) + 1];
  }
  if (!a) {
    // One less in the first place that has room. A key cannot end in 0, so below a final 1 it goes a place deeper.
    const i = [...b].findIndex((digit) => digit !== '0');
    if (b[i] !== '1') return b.slice(0, i) + DIGITS[DIGITS.indexOf(b[i]!) - 1];
    return i < b.length - 1 ? b.slice(0, i + 1) : b.slice(0, i) + '0' + MIDDLE;
  }
  return midpoint(a, b);
}

/** Rows sort by `order`, then by row id, so two devices that picked the same key still agree. */
export const byOrder = (a: Pick<Task, 'order' | 'id'>, b: Pick<Task, 'order' | 'id'>): number =>
  a.order !== b.order ? (a.order < b.order ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The lists of the Today screen for one local day. Subtasks are under their parent's id, and in no list. */
export function plan(
  tasks: readonly Task[],
  day: string,
  now: number,
  utcOffsetMin: number,
): { today: Task[]; upcoming: Task[]; done: Task[]; deleted: Task[]; subtasks: Map<string, Task[]> } {
  const top = tasks.filter((t) => t.parent === null);
  const open = top.filter((t) => t.done === null && t.deleted === null);
  const subtasks = new Map<string, Task[]>();
  for (const t of tasks.toSorted(byOrder)) {
    if (t.parent !== null && t.deleted === null) subtasks.set(t.parent, [...(subtasks.get(t.parent) ?? []), t]);
  }
  return {
    today: open.filter((t) => t.due === null || t.due <= day).sort(byOrder),
    upcoming: open
      .filter((t) => t.due !== null && t.due > day)
      .sort((a, b) => (a.due !== b.due ? (a.due! < b.due! ? -1 : 1) : byOrder(a, b))),
    done: top
      .filter((t) => t.deleted === null && t.done !== null && localDay(t.done, utcOffsetMin) === day)
      .sort((a, b) => a.done! - b.done! || byOrder(a, b)),
    deleted: top
      .filter((t) => t.deleted !== null && now - t.deleted < KEPT_MS)
      .sort((a, b) => b.deleted! - a.deleted! || byOrder(a, b)),
    subtasks,
  };
}

/** Today's list split three ways: the task the timer is on, the first of the others, and the rest. */
export function upNext<T extends { id: string }>(today: readonly T[], timerTask: string | null): { running: T | null; next: T | null; later: T[] } {
  const running = today.find((t) => t.id === timerTask) ?? null;
  const [next = null, ...later] = today.filter((t) => t !== running);
  return { running, next, later };
}

/** Laps still planned: each task's estimate less the laps it has, never under 0. No estimate adds nothing. */
export const plannedLeft = (tasks: readonly { estimate: number | null; laps: number }[]): number =>
  tasks.reduce((left, t) => left + Math.max(0, (t.estimate ?? 0) - t.laps), 0);

/**
 * The laps and squares of one task, oldest first: a lap that rang is 1, a stopped one the share
 * of its plan it ran, one set aside nothing. The lap in progress on the task is a share that
 * grows, until its row is there.
 */
export function squares(sessions: readonly Session[], state: TimerState, now: number, task: string): { laps: number; squares: number[] } {
  const share = (ran: number, planned: number) => (planned > 0 ? Math.min(1, Math.max(0, ran / planned)) : 0);
  const mine = sessions.filter((s) => s.kind === 'work' && s.task === task && s.outcome !== 'void').toSorted((a, b) => a.started - b.started);
  const out = mine.map((s) => (s.outcome === 'rang' ? 1 : share(s.ended - s.started - s.paused_ms, s.planned_ms)));
  if (state.phase === 'work' && state.task === task && !sessions.some((s) => s.id === state.run)) {
    out.push(share(state.planned_ms - view(state, now).left_ms, state.planned_ms));
  }
  return { laps: mine.filter((s) => s.outcome === 'rang').length, squares: out };
}
