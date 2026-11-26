// The rules behind the Habits screen: contracts/protocol.md section 14.
// The streak is section 8's, the same function the focus streak uses, with the habit's weekdays
// as the mask and its done days as the kept days.

import { addDays, mondayOf } from './progress.ts';
import { asDeleted, isDay, isMoment, isTime } from './real.ts';
import { streakWindow, weekday } from './streak.ts';

/** A habit row with every field in its place: what is missing or malformed reads as its default. */
export interface Habit {
  id: string;
  title: string;
  /** Weekday mask, bit 0 Monday to bit 6 Sunday. Every day when the row has none it can use. */
  days: number;
  /** Check-ins that make a day done. 1 when the row has none it can use. */
  target: number;
  /** The one time an older build knows, as the row holds it. */
  remind: string | null;
  /** The reminder times, sorted, one for each check-in of the day at most: place k is for the k-th. */
  reminds: string[];
  order: string;
  archived: number | null;
  deleted: number | null;
}

/** One check-in: its own row, so two devices checking in offline make two and neither is lost. */
export interface CheckIn {
  id: string;
  habit: string;
  day: string;
  at: number;
}

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

const whole = (v: unknown, least: number, most = Infinity): v is number => typeof v === 'number' && Number.isInteger(v) && v >= least && v <= most;
const time = (v: unknown): number | null => (isMoment(v) ? v : null);

/** A weekday mask a habit can have, or null. */
export const asDays = (v: unknown): number | null => (whole(v, 1, 127) ? v : null);
/** A target a habit can have, or null. */
export const asTarget = (v: unknown): number | null => (whole(v, 1) ? v : null);
/** A reminder time, `07:30`, or null. */
export const asRemind = (v: unknown): string | null => (isTime(v) ? v : null);
/** A list of reminder times, sorted and none twice, or null when it is not a list of times of day. */
export const asReminds = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isTime) ? [...new Set(v as string[])].sort() : null);

/** A row is a habit when it has a title, as a task is. */
export function asHabit(id: string, row: Readonly<Record<string, unknown>>): Habit | null {
  if (typeof row.title !== 'string') return null;
  const target = asTarget(row.target) ?? 1;
  const remind = asRemind(row.remind);
  // The list when the row has one, and a list with one entry that is no time of day reads as
  // empty; else the one time an older build wrote. Never more than the day's check-ins: a
  // target lowered elsewhere cuts what is read, whatever the cell still holds.
  const reminds = Array.isArray(row.reminds) ? (asReminds(row.reminds) ?? []) : remind === null ? [] : [remind];
  return {
    id,
    title: row.title,
    days: asDays(row.days) ?? 127,
    target,
    remind,
    reminds: reminds.slice(0, target),
    order: typeof row.order === 'string' ? row.order : '',
    archived: time(row.archived),
    deleted: asDeleted(row.deleted),
  };
}

/** A live check-in, or null: a row still arriving, or one that was taken back. */
export function asCheckIn(id: string, row: Readonly<Record<string, unknown>>): CheckIn | null {
  const { habit, day, at } = row;
  // The day must be a real one: the record walks from the first check-in day by day, and a day
  // that is not on the calendar, or decades back, would break or bury it.
  if (typeof habit !== 'string' || !isDay(day) || !isMoment(at) || typeof row.deleted === 'number') return null;
  return { id, habit, day, at };
}

/**
 * A habit as its screen shows it, from its live check-ins counted per day. The target used is
 * today's, for every past day: that is the rule, so raising a target turns past days that met
 * the old one into days that fall short, and lowering it does the opposite. `made` is the day the
 * habit was made, where the planned days are counted from.
 */
export function habitDays(habit: Pick<Habit, 'days' | 'target'>, counts: ReadonlyMap<string, number>, today: string, made?: string) {
  const planned = (day: string) => ((habit.days >> weekday(Date.parse(day))) & 1) === 1;
  const done = [...counts].filter(([, count]) => count >= habit.target).map(([day]) => day);
  // Days it is not planned for are no part of the streak: the streak function leaves them out by the mask.
  // Counted from the day it was made, so two habits made together read the same N of planned days.
  const s = streakWindow(today, done, habit.days, made);
  const rest = new Set(s.rest);
  const on = (day: string): HabitDay => {
    const count = counts.get(day) ?? 0;
    return { day, planned: planned(day), count, done: count >= habit.target, rest: rest.has(day) };
  };

  const first = [...counts.keys()].sort()[0];
  const record: HabitDay[] = [];
  for (let day = first; day !== undefined && day <= today; day = addDays(day, 1)) record.push(on(day));
  const monday = mondayOf(today);
  // The days of the week still to come hold nothing yet, whatever a clock set wrong may have written there.
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => (day <= today ? on(day) : { day, planned: planned(day), count: 0, done: false, rest: false }));
  return { today: on(today), week, record, streak: s.streak, kept: s.kept, of: s.of, missed: s.missed };
}

/**
 * Check-ins this week so far, and last week's up to the same weekday and time. `byDay` holds the
 * live check-ins to count, under the day each is for.
 */
export function weekAgainst(byDay: ReadonlyMap<string, readonly CheckIn[]>, today: string, now: number): { now: number; before: number } {
  const monday = mondayOf(today);
  let thisWeek = 0;
  let before = 0;
  for (let day = monday; day <= today; day = addDays(day, 1)) {
    thisWeek += byDay.get(day)?.length ?? 0;
    const then = byDay.get(addDays(day, -7)) ?? [];
    // Whole days up to that weekday, and on it only what had been tapped by this time.
    before += day < today ? then.length : then.filter((checkin) => checkin.at <= now - 7 * 86400000).length;
  }
  return { now: thisWeek, before };
}
