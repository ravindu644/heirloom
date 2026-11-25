// Habit reminders (protocol.md section 14): each habit's local time of day, on the days it is
// planned, not on a day it is already done. Worked out here once for both platforms.

/** One habit's reminder, as the caller wants it. The words are the caller's. */
export interface Reminder {
  /** The habit's id. */
  habit: string;
  title: string;
  body: string;
  /** Local time of day, `07:30`. */
  time: string;
  /** The weekdays it is planned, bit 0 Monday to bit 6 Sunday. */
  days: number;
  doneToday: boolean;
}

/** One reminder on one day: when, and the notification id it keeps for as long as it is wanted. */
export interface Due {
  id: number;
  at: number;
  title: string;
  body: string;
  /** What it is, in full: two dues with the same `sig` are the same notification. */
  sig: string;
}

/** How far ahead the phone schedules, in days, today included. */
export const AHEAD_DAYS = 14;
/**
 * Android refuses more than 500 alarms at once per app (AlarmManagerService, MAX_ALARMS_PER_UID),
 * and the bell needs one. Reminders keep well under it, nearest first: ten habits planned every
 * day for fourteen days are 140.
 */
export const MAX_DUE = 400;

/** Reminder ids: 100000 + slot * 16 + the day's number mod 16. Apart from the bell (1) and the countdown (7400). */
export const FIRST_ID = 100_000;
const SLOTS = 4096;
export const LAST_ID = FIRST_ID + SLOTS * 16 - 1;
export const isReminderId = (id: number) => id >= FIRST_ID && id <= LAST_ID;

// FNV-1a: a habit keeps its slot from one rebuild to the next, so an unchanged reminder keeps its
// id and is left alone. Two habits landing on one slot are moved apart in id order.
function slots(habits: string[]): Map<string, number> {
  const taken = new Set<number>();
  const out = new Map<string, number>();
  for (const habit of [...new Set(habits)].sort()) {
    let h = 0x811c9dc5;
    for (let i = 0; i < habit.length; i++) h = Math.imul(h ^ habit.charCodeAt(i), 0x01000193) >>> 0;
    let slot = h % SLOTS;
    while (taken.has(slot)) slot = (slot + 1) % SLOTS;
    taken.add(slot);
    out.set(habit, slot);
  }
  return out;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Every reminder due after `since` (now, unless said) over `ahead` days from today, nearest first,
 * at most `max`. Times are the
 * device's own wall clock: `new Date(y, m, d, h, min)` follows the zone's rules for that date, so
 * summer time that starts or ends inside the window is already right. A move to another zone is
 * not known until this runs again.
 */
export function upcoming(reminders: Reminder[], now: number, ahead = AHEAD_DAYS, max = MAX_DUE, since = now): Due[] {
  const slot = slots(reminders.map((r) => r.habit));
  const start = new Date(now);
  const out: Due[] = [];
  for (const r of reminders) {
    const m = TIME.exec(r.time);
    if (!m) continue;
    for (let d = 0; d < ahead; d++) {
      const at = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, Number(m[1]), Number(m[2])).getTime();
      const date = new Date(at);
      const weekday = (date.getDay() + 6) % 7;
      if (!(r.days & (1 << weekday)) || at <= since || (d === 0 && r.doneToday)) continue;
      // The calendar day's own number, not the offset from today, so tomorrow's id is the same tomorrow.
      const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
      out.push({ id: FIRST_ID + slot.get(r.habit)! * 16 + (day % 16), at, title: r.title, body: r.body, sig: JSON.stringify([r.habit, at, r.title, r.body]) });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}
