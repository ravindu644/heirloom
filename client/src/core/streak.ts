// The forgiving streak: contracts/protocol.md section 8. One function for focus and for every habit.

export interface StreakInput {
  /** Local day, `2026-11-24`. */
  today: string;
  /** The local days that count: a rang lap, or a habit at its target. Any order. */
  kept: readonly string[];
  /** How many days back `kept` of `of` looks. */
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

export function streak(input: StreakInput): Streak {
  throw new Error('not built yet: streak, roadmap section 5');
}
