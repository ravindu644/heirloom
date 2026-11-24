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

export function streak({ today, kept, window, daysMask = 127 }: StreakInput): Streak {
  const planned = (ms: number) => ((daysMask >> weekday(ms)) & 1) === 1;
  const keptDays = new Set(kept.map((day) => Date.parse(day)).filter(planned));
  if (keptDays.size === 0) return { streak: 0, rest: [], kept: 0, of: 0 };

  const now = Date.parse(today);
  const end = keptDays.has(now) ? now : now - DAY_MS;
  const windowStart = end - (window - 1) * DAY_MS;
  const rest: string[] = [];
  let run = 0;
  let empties = 0;
  let keptInWindow = 0;
  let of = 0;
  for (let ms = Math.min(...keptDays); ms <= end; ms += DAY_MS) {
    if (weekday(ms) === 0) empties = 0;
    if (!planned(ms)) continue;
    const isKept = keptDays.has(ms);
    if (isKept) run += 1;
    else if (++empties <= 2) rest.push(new Date(ms).toISOString().slice(0, 10));
    else run = 0;
    if (ms >= windowStart) {
      of += 1;
      if (isKept) keptInWindow += 1;
    }
  }
  return { streak: run, rest, kept: keptInWindow, of };
}
