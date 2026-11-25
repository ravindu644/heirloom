// The rules behind the Today screen: contracts/protocol.md section 12.

import type { Session } from './stats.ts';
import { KEPT_MS, asDeleted, isDay, isLength, isMoment, isTime } from './real.ts';
import { fill, localDay } from './stats.ts';
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
  /** `15:30` on its due day. A stored value that is no time of day reads as null. */
  time: string | null;
  /** The task's own lengths for a lap and the breaks after one. Null: the account's. */
  work_ms: number | null;
  short_ms: number | null;
  long_ms: number | null;
  done: number | null;
  /** '' when the row has none yet: it sorts first. */
  order: string;
  deleted: number | null;
}

const DAY_MS = 86400000;

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const time = (v: unknown): number | null => (isMoment(v) ? v : null);

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
    due: isDay(due) ? due : null,
    repeat: asRepeat(row.repeat),
    when: text(row.when) || null,
    time: isTime(row.time) ? row.time : null,
    work_ms: isLength(row.work_ms) ? row.work_ms : null,
    short_ms: isLength(row.short_ms) ? row.short_ms : null,
    long_ms: isLength(row.long_ms) ? row.long_ms : null,
    done: time(row.done),
    order: text(row.order) ?? '',
    deleted: asDeleted(row.deleted),
  };
}

/** The most laps an estimate is offered: four rows of eight squares, which is what a row can draw. A row that holds more is read as it is. */
export const ESTIMATE_MAX = 32;

/** One line of text as one task: "pointers chapter 3 ~4". A larger estimate than the top is taken as the top. Null when there is no title in it. */
export function quickAdd(line: string): { title: string; estimate: number | null } | null {
  const trimmed = line.trim();
  const found = /(?:^|\s)~([1-9]\d?)$/.exec(trimmed);
  const title = found ? trimmed.slice(0, found.index).trim() : trimmed;
  return title ? { title, estimate: found ? Math.min(ESTIMATE_MAX, Number(found[1])) : null } : null;
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

const KEY_MAX = 64;

/**
 * The keys to write so that `id` sits just before `before` among its siblings, or at the end
 * with null (or with a `before` that is not among them). Nearly always one key, for the moved row.
 */
export function moveKeys(siblings: readonly Pick<Task, 'id' | 'order'>[], id: string, before: string | null): [id: string, order: string][] {
  const list = siblings.filter((other) => other.id !== id).sort(byOrder);
  const found = before === null ? -1 : list.findIndex((other) => other.id === before);
  const at = found < 0 ? list.length : found;
  const low = list[at - 1]?.order || null;
  const high = list[at]?.order ?? null;
  if (high === null || (low ?? '') < high) {
    const key = keyBetween(low, high);
    if (key.length <= KEY_MAX) return [[id, key]];
    // The gap has been halved until no key of 64 characters fits. Once in a few hundred moves
    // into one gap: the whole list gets fresh keys, short and evenly stepped.
    let last: string | null = null;
    return [...list.slice(0, at), { id }, ...list.slice(at)].map((row) => [row.id, (last = keyBetween(last, null))]);
  }
  // The neighbours hold the same key: two devices each picked it. Nothing sorts between them, so
  // the rows that share it from here on move up, into the room before the first larger key, and
  // the moved row takes the room they leave. Usually that is one row.
  const run = list.slice(at).filter((other) => other.order === high);
  const ceiling = list[at + run.length]?.order ?? null;
  let last = keyBetween(low, ceiling);
  return [[id, last], ...run.map((row): [string, string] => [row.id, (last = keyBetween(last, ceiling))])];
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

/**
 * Today's list as the screen shows it. `next` is the first task that is not running, lifted out
 * of the list. `later` is every other task in order, the running one included, in its place: its
 * row stays where it was while its square fills. `running` is that same task again, for the bar.
 */
export function upNext<T extends { id: string }>(today: readonly T[], timerTask: string | null): { running: T | null; next: T | null; later: T[] } {
  const running = today.find((t) => t.id === timerTask) ?? null;
  const next = today.find((t) => t !== running) ?? null;
  return { running, next, later: today.filter((t) => t !== next) };
}

/** Laps still planned: each task's estimate less the laps it has, never under 0. No estimate adds nothing. */
export const plannedLeft = (tasks: readonly { estimate: number | null; laps: number }[]): number =>
  tasks.reduce((left, t) => left + Math.max(0, (t.estimate ?? 0) - t.laps), 0);

/** How long those laps would take: each task's at its own lap length, or at `work_ms`, the account's, where it has none. */
export const plannedLeftMs = (tasks: readonly { estimate: number | null; laps: number; lengths: { work_ms: number | null } }[], work_ms: number): number =>
  tasks.reduce((left, t) => left + plannedLeft([t]) * (t.lengths.work_ms ?? work_ms), 0);

/**
 * The laps and squares of one task, oldest first: a lap that rang is a lap and a whole square,
 * a stopped one a lap and a square as full as it ran, one set aside nothing. The lap in progress
 * on the task is a square that fills and no lap yet, until its row is there; once its bell has
 * gone it is a lap and a whole square, row or no row, so a task never shows a full square beside
 * a count that has not moved.
 */
export function squares(sessions: readonly Session[], state: TimerState, now: number, task: string): { laps: number; squares: number[] } {
  const share = (ran: number, planned: number) => (planned > 0 ? Math.min(1, Math.max(0, ran / planned)) : 0);
  const mine = sessions.filter((s) => s.kind === 'work' && s.task === task && s.outcome !== 'void').toSorted((a, b) => a.started - b.started);
  const out = mine.map(fill);
  let laps = mine.length;
  if (state.phase === 'work' && state.task === task && !sessions.some((s) => s.id === state.run)) {
    const { over, left_ms } = view(state, now);
    if (over) laps += 1;
    out.push(over ? 1 : share(state.planned_ms - left_ms, state.planned_ms));
  }
  return { laps, squares: out };
}
