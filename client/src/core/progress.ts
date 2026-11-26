// The rules behind the Progress screen: contracts/protocol.md section 13.
// Nothing here counts a session: it all starts from the day totals of stats(), so a lap is
// counted one way, here, in the race and on the server.

import { localDay, stats } from './stats.ts';
import type { Session, Stats } from './stats.ts';
import { pinnedDays, streak, streakWindow, weekday } from './streak.ts';
import type { Task } from './today.ts';

/** Focus and laps per local day, as `stats()` gives them. */
export type Days = Stats['days'];

/** This week against last week, as running totals. Times in ms. */
export interface WeekRace {
  /** Monday of this week, `2026-11-23`. */
  monday: string;
  /** Seven days, Monday first. `you_ms` is null for days still to come; `ghost_ms` is last week's running total at that day's end. */
  days: { day: string; you_ms: number | null; ghost_ms: number }[];
  /** This week so far, the lap in progress included. */
  you_ms: number;
  /** Last week up to this weekday and time of day, and its whole total. */
  ghost_now_ms: number;
  ghost_total_ms: number;
  /** `you_ms - ghost_now_ms`. Under 0 is behind. Null when last week has nothing. */
  split_ms: number | null;
}

export interface StreakView {
  /** Kept days since the last miss. */
  streak: number;
  /** Kept days and all days in the last 45 of the record: "41 of the last 45". */
  kept: number;
  of: number;
  /** True when a miss lies inside those days: then the screen shows kept of, not the run. */
  missed: boolean;
  /** The last 14 days, oldest first, for the row of dots. Today is `open` until it has a lap. */
  recent: { day: string; state: 'kept' | 'rest' | 'empty' | 'open' }[];
  /** The weekdays pinned as rest, 0 Monday to 6 Sunday, in that order: at most two, empty for none. */
  pinned: number[];
}

export interface YearCell {
  day: string;
  focus_ms: number;
  laps: number;
  /** 0 to 4. */
  level: number;
  rest: boolean;
}

export interface Since {
  /** The first day with a counted session, or null before any. */
  first: string | null;
  focus_ms: number;
  laps: number;
  kept: number;
  of: number;
  /** 0 is Monday. Null until a weekday has come round three times. */
  steadiest: { weekday: number; kept: number; of: number } | null;
  /** One cell per day from `first` to today. */
  cells: YearCell[];
}

export interface Bests {
  day: { day: string; focus_ms: number } | null;
  week: { monday: string; focus_ms: number } | null;
}

const DAY_MS = 86400000;
const RECENT_DAYS = 14;

/** `day` moved by `n` days. */
export const addDays = (day: string, n: number): string => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);
/** The Monday of the week `day` is in. */
export const mondayOf = (day: string): string => addDays(day, -weekday(Date.parse(day)));

/**
 * `youToday` is today's focus so far, the lap in progress included; `ghostByNow` is the focus of
 * the same weekday last week up to this time of day. Both come from the race's own counting.
 */
export function weekRace(days: Days, today: string, youToday: number, ghostByNow: number): WeekRace {
  const monday = mondayOf(today);
  let you = 0;
  let ghost = 0;
  let ghostNow = ghostByNow;
  const out: WeekRace['days'] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const then = days[addDays(day, -7)]?.focus_ms ?? 0;
    ghost += then;
    if (day < today) ghostNow += then;
    const mine = day < today ? (days[day]?.focus_ms ?? 0) : day === today ? youToday : null;
    if (mine !== null) you += mine;
    out.push({ day, you_ms: mine === null ? null : you, ghost_ms: ghost });
  }
  return { monday, days: out, you_ms: you, ghost_now_ms: ghostNow, ghost_total_ms: ghost, split_ms: ghost > 0 ? you - ghostNow : null };
}

/**
 * The forgiving streak over the last 45 days, and the last 14 as dots. `kept` is the days with a
 * lap that rang: a day is earned at a bell, so a day of stopped laps has laps and is not kept.
 */
export function streakView(kept: ReadonlySet<string>, today: string, restDays = 0): StreakView {
  const s = streakWindow(today, [...kept], 127, undefined, restDays);
  const rest = new Set(s.rest);
  const recent = Array.from({ length: RECENT_DAYS }, (_, i) => {
    const day = addDays(today, i + 1 - RECENT_DAYS);
    const state = kept.has(day) ? ('kept' as const) : day === today ? ('open' as const) : rest.has(day) ? ('rest' as const) : ('empty' as const);
    return { day, state };
  });
  const pin = pinnedDays(restDays);
  const pinned = [0, 1, 2, 3, 4, 5, 6].filter((w) => (pin >> w) & 1);
  return { streak: s.streak, kept: s.kept, of: s.of, missed: s.missed, recent, pinned };
}

/** A year cell's level, from the day's laps. */
export const level = (laps: number): number => (laps >= 9 ? 4 : laps >= 7 ? 3 : laps >= 4 ? 2 : laps >= 1 ? 1 : 0);

/** Everything since the first counted session, and one cell per day of it. `kept` is the days with a lap that rang. */
export function since(days: Days, kept: ReadonlySet<string>, today: string, restDays = 0): Since {
  const first = Object.keys(days).sort()[0] ?? null;
  if (first === null) return { first, focus_ms: 0, laps: 0, kept: 0, of: 0, steadiest: null, cells: [] };

  const s = streak({ today, kept: [...kept], window: Infinity, pinned: restDays });
  const rest = new Set(s.rest);
  const cells: YearCell[] = [];
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const { focus_ms = 0, laps = 0 } = days[day] ?? {};
    cells.push({ day, focus_ms, laps, level: level(laps), rest: rest.has(day) });
  }

  // The steadiest weekday, over the days the streak counts: from the first kept day to today, or
  // to yesterday while today has no lap.
  const had = Array<number>(7).fill(0);
  const did = Array<number>(7).fill(0);
  const start = [...kept].sort()[0];
  const end = kept.has(today) ? today : addDays(today, -1);
  for (let day = start; day !== undefined && day <= end; day = addDays(day, 1)) {
    const w = weekday(Date.parse(day));
    had[w]! += 1;
    if (kept.has(day)) did[w]! += 1;
  }
  let best: number | null = null;
  for (let w = 0; w < 7; w++) {
    if (had[w]! < 3) continue;
    // A higher share wins; then the one kept more often; then the earlier weekday, which is the one already held.
    const better = best === null || did[w]! * had[best]! > did[best]! * had[w]! || (did[w]! * had[best]! === did[best]! * had[w]! && did[w]! > did[best]!);
    if (better) best = w;
  }
  return {
    first,
    focus_ms: cells.reduce((sum, cell) => sum + cell.focus_ms, 0),
    laps: cells.reduce((sum, cell) => sum + cell.laps, 0),
    kept: s.kept,
    of: s.of,
    steadiest: best === null ? null : { weekday: best, kept: did[best]!, of: had[best]! },
    cells,
  };
}

/** Focus per Monday to Sunday week, by its Monday, oldest first. */
export function weekTotals(days: Days): Map<string, number> {
  const weeks = new Map<string, number>();
  for (const day of Object.keys(days).sort()) weeks.set(mondayOf(day), (weeks.get(mondayOf(day)) ?? 0) + days[day]!.focus_ms);
  return weeks;
}

/** The day and the Monday to Sunday week with the most focus. The earlier one wins a tie. */
export function bests(days: Days): Bests {
  let day: Bests['day'] = null;
  for (const d of Object.keys(days).sort()) {
    const { focus_ms } = days[d]!;
    if (focus_ms > (day?.focus_ms ?? 0)) day = { day: d, focus_ms };
  }
  const weeks = weekTotals(days);
  let week: Bests['week'] = null;
  // The map was filled oldest first, so the first of two equal weeks is met first and kept.
  for (const [monday, focus_ms] of weeks) {
    if (focus_ms > (week?.focus_ms ?? 0)) week = { monday, focus_ms };
  }
  return { day, week };
}

/**
 * Focus and laps per project over today and the six days before, and the focus of the seven
 * days before those. `projectOf` says which project a session is under, null for none. Projects
 * with nothing in either window are left out. Most time first.
 */
export function projectShares(
  sessions: readonly Session[],
  projectOf: (session: Session) => string | null,
  today: string,
  utcOffsetMin: number,
): { project: string | null; focus_ms: number; laps: number; before_ms: number }[] {
  const groups = new Map<string | null, Session[]>();
  for (const s of sessions) {
    const project = projectOf(s);
    groups.set(project, [...(groups.get(project) ?? []), s]);
  }
  const recent = addDays(today, -6);
  const before = addDays(today, -13);
  const shares = [...groups].map(([project, list]) => {
    const share = { project, focus_ms: 0, laps: 0, before_ms: 0 };
    for (const [day, total] of Object.entries(stats(list, utcOffsetMin).days)) {
      if (day > today || day < before) continue;
      if (day < recent) share.before_ms += total.focus_ms;
      else {
        share.focus_ms += total.focus_ms;
        share.laps += total.laps;
      }
    }
    return share;
  });
  return shares
    .filter((share) => share.focus_ms > 0 || share.before_ms > 0 || share.laps > 0)
    .sort((a, b) => b.focus_ms - a.focus_ms || b.before_ms - a.before_ms || ((a.project ?? '') < (b.project ?? '') ? -1 : 1));
}

/**
 * How the guesses have held, over tasks that are done, have an estimate and are not deleted:
 * laps run for each lap guessed over the last 28 days, the eight done most recently (newest
 * first), and the same ratio for each of the last eight Monday to Sunday weeks, oldest first,
 * this week last. A week with no such task has no ratio.
 */
export function estimates(
  tasks: readonly Task[],
  lapsOf: (task: string) => number,
  today: string,
  utcOffsetMin: number,
): { ratio: number | null; tasks: { id: string; title: string; estimate: number; laps: number }[]; weeks: { monday: string; ratio: number | null }[] } {
  // Laps run over laps guessed, for a set of tasks. None, no ratio.
  const ratio = (list: readonly { estimate: number; laps: number }[]) => {
    const guessed = list.reduce((sum, t) => sum + t.estimate, 0);
    return guessed > 0 ? list.reduce((sum, t) => sum + t.laps, 0) / guessed : null;
  };
  const guessed = tasks
    .filter((t) => t.done !== null && t.estimate !== null && t.deleted === null)
    .sort((a, b) => b.done! - a.done!)
    .map((t) => ({ id: t.id, title: t.title, estimate: t.estimate!, laps: lapsOf(t.id), day: localDay(t.done!, utcOffsetMin) }));
  const recent = guessed.filter((t) => t.day >= addDays(today, -27));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const monday = addDays(mondayOf(today), (i - 7) * 7);
    return { monday, ratio: ratio(guessed.filter((t) => t.day >= monday && t.day < addDays(monday, 7))) };
  });
  return { ratio: ratio(recent), tasks: recent.slice(0, 8).map(({ id, title, estimate, laps }) => ({ id, title, estimate, laps })), weeks };
}

/** What a lap that was set aside goes back to when it is counted again: the row itself says. */
export const outcomeOf = (s: Pick<Session, 'started' | 'ended' | 'paused_ms' | 'planned_ms'>): 'rang' | 'stopped' =>
  s.ended - s.started - s.paused_ms >= s.planned_ms ? 'rang' : 'stopped';
