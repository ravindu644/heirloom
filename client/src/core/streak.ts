// The forgiving streak: contracts/protocol.md section 8. One function for focus and for every habit.

export interface StreakInput {
  /** Local day, `2026-11-24`. */
  today: string;
  /** The local days that count: a rang lap, or a habit at its target. Any order. */
  kept: readonly string[];
  /** How many calendar days back `kept` of `of` looks. */
  window: number;
  /** Bit 0 Monday to bit 6 Sunday. Every day when left out. */
  daysMask?: number;
  /** The day the record begins, when it is earlier than the first kept day: the day a habit was made. */
  since?: string;
  /** Weekdays pinned as rest, the same bits: the focus streak's `settings.rest_days`. None when left out. */
  pinned?: number;
}

export interface Streak {
  streak: number;
  /** Every rest day in the record, oldest first. */
  rest: string[];
  kept: number;
  of: number;
}

const DAY_MS = 86400000;
// Days are worked on as UTC midnights, so no time zone or summer time can shift one.
// 1970-01-01 was a Thursday: weekday 3 when Monday is 0.
export const weekday = (ms: number) => (ms / DAY_MS + 3) % 7;

/** How far back "41 of the last 45" looks, for the focus streak and for every habit. */
export const WINDOW_DAYS = 45;

/**
 * `settings.rest_days` as the streak reads it: 0 for anything but a whole number in 0..127, and
 * of more than two bits the first two from Monday, so a newer build's value cannot break it.
 */
export function pinnedDays(mask: unknown): number {
  if (typeof mask !== 'number' || !Number.isInteger(mask) || mask < 0 || mask > 127) return 0;
  let out = 0;
  for (let bit = 0, n = 0; bit < 7 && n < 2; bit++) if ((mask >> bit) & 1) (out |= 1 << bit), n++;
  return out;
}

/**
 * The streak as the screens show it: over the 45 day window, and whether a miss lies inside
 * those days. An empty day there that is not a rest day is a miss.
 */
export function streakWindow(today: string, kept: readonly string[], daysMask = 127, since?: string, pinned = 0): Streak & { missed: boolean } {
  const s = streak({ today, kept, window: WINDOW_DAYS, daysMask, since, pinned });
  // The same days the streak counted: back from today if today is kept, else from yesterday.
  const now = Date.parse(today);
  const keptToday = ((daysMask >> weekday(now)) & 1) === 1 && kept.includes(today);
  const from = new Date((keptToday ? now : now - DAY_MS) - (WINDOW_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  return { ...s, missed: s.of - s.kept > s.rest.filter((day) => day >= from).length };
}

export function streak({ today, kept, window, daysMask = 127, since, pinned = 0 }: StreakInput): Streak {
  const planned = (ms: number) => ((daysMask >> weekday(ms)) & 1) === 1;
  const pin = pinnedDays(pinned) & daysMask;
  const isPinned = (ms: number) => ((pin >> weekday(ms)) & 1) === 1;
  const keptDays = new Set(kept.map((day) => Date.parse(day)).filter(planned));
  if (keptDays.size === 0) return { streak: 0, rest: [], kept: 0, of: 0 };

  const now = Date.parse(today);
  const end = keptDays.has(now) ? now : now - DAY_MS;
  const windowStart = end - (window - 1) * DAY_MS;
  const rest: string[] = [];
  let run = 0;
  // The week's places for rest not already held by a pinned day.
  let free = 0;
  let keptInWindow = 0;
  let of = 0;
  const first = Math.min(...keptDays, since === undefined ? Infinity : Date.parse(since));
  for (let ms = first; ms <= end; ms += DAY_MS) {
    if (ms === first || weekday(ms) === 0) {
      // A pinned day holds a place while it is empty or still to come, so it is known at the
      // week's start; a kept one gives its place back. One before the record holds nothing.
      free = 2;
      const monday = ms - weekday(ms) * DAY_MS;
      for (let day = monday; day < monday + 7 * DAY_MS; day += DAY_MS) if (isPinned(day) && day >= first && !keptDays.has(day)) free -= 1;
    }
    if (!planned(ms)) continue;
    const isKept = keptDays.has(ms);
    if (isKept) run += 1;
    else if (isPinned(ms) || free-- > 0) rest.push(new Date(ms).toISOString().slice(0, 10));
    else run = 0;
    if (ms >= windowStart) {
      of += 1;
      if (isKept) keptInWindow += 1;
    }
  }
  return { streak: run, rest, kept: keptInWindow, of };
}
