// Totals from sessions, and the race against a past day: contracts/protocol.md section 7.

import { view } from './timer.ts';
import type { Phase, TimerState } from './timer.ts';

/** A session row: its id (the timer's run id) and the fields of contracts/schemas/session.schema.json. */
export interface Session {
  id: string;
  kind: Phase;
  task: string | null;
  started: number;
  ended: number;
  planned_ms: number;
  paused_ms: number;
  outcome: 'rang' | 'stopped' | 'void';
  device: string;
  note?: string;
}

export interface Stats {
  /** Keyed by local day, `2026-11-24`. A day with nothing counted is absent. */
  days: Record<string, { focus_ms: number; laps: number }>;
  /** Pairs of session ids that ran on two devices at once, each pair and the list sorted by id. */
  overlaps: [string, string][];
}

/** You against the ghost. `split_ms` under 0 is behind. No past day with focus, no ghost. */
export interface Race {
  you_ms: number;
  ghost: { day: string; ms: number; total_ms: number } | null;
  split_ms: number | null;
}

const DAY_MS = 86400000;

// What focus needs of a lap: where its counted interval starts and ends.
type Span = Pick<Session, 'started' | 'paused_ms' | 'ended'>;
const from = (s: Span) => s.started + s.paused_ms;
const counts = (s: Session) => s.kind === 'work' && s.outcome !== 'void';

/** How much of a lap ran: 1 if it rang, else its running time over its plan, never over 1. Wherever laps are drawn, each is drawn this full. */
export const fill = (s: Pick<Session, 'outcome' | 'started' | 'ended' | 'paused_ms' | 'planned_ms'>): number =>
  s.outcome === 'rang' ? 1 : s.planned_ms > 0 ? Math.min(1, Math.max(0, (s.ended - s.started - s.paused_ms) / s.planned_ms)) : 0;

/** The local day, `2026-11-24`, that `ms` falls in for someone `utcOffsetMin` minutes east of UTC. */
export const localDay = (ms: number, utcOffsetMin: number): string =>
  new Date(ms + utcOffsetMin * 60000).toISOString().slice(0, 10);

/** Where the local day `day` begins, in ms, for someone `utcOffsetMin` minutes east of UTC. */
export const midnight = (day: string, utcOffsetMin: number): number => Date.parse(day) - utcOffsetMin * 60000;

/** The day a lap is counted on: the day it ended, its bell or its stop. Its minutes are cut at midnight. */
export const lapDay = (s: Pick<Session, 'ended'>, utcOffsetMin: number): string => localDay(s.ended, utcOffsetMin);

/** Every local day a session's time touches, from the day it started to the day it ended, oldest first. */
export function touches(s: Pick<Session, 'started' | 'ended'>, utcOffsetMin: number): string[] {
  // A row can say anything: from the earlier end, so a lap's own day is always listed, and
  // ponytail: no lap runs a week, so no walk is longer than its last week.
  const end = Math.max(s.started, s.ended);
  const days = [localDay(Math.max(Math.min(s.started, s.ended), end - 7 * DAY_MS), utcOffsetMin)];
  const last = localDay(end, utcOffsetMin);
  while (days.at(-1)! < last) days.push(localDay(midnight(days.at(-1)!, utcOffsetMin) + DAY_MS, utcOffsetMin));
  return days;
}

// A session under every day it touches. A day's total clips its list to the day's midnights, so
// a lap listed under two days gives each only its own part.
function byDay<T extends Span>(spans: readonly T[], utcOffsetMin: number): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const s of spans) {
    for (const day of touches(s, utcOffsetMin)) {
      const list = days.get(day);
      if (list) list.push(s);
      else days.set(day, [s]);
    }
  }
  return days;
}

// The length of the union inside `[since, upTo)`: walk the laps by start and add only what
// reaches past everything before. Clipping keeps the order, so the sort by start still holds.
function focus(spans: readonly Span[], since = -Infinity, upTo = Infinity): number {
  let total = 0;
  let reach = -Infinity;
  for (const s of spans.toSorted((a, b) => from(a) - from(b))) {
    const end = Math.min(s.ended, upTo);
    total += Math.max(0, end - Math.max(reach, from(s), since));
    reach = Math.max(reach, end);
  }
  return total;
}

// The focus of `day` in these spans, nothing after `upTo`.
const focusIn = (spans: readonly Span[], day: string, utcOffsetMin: number, upTo = Infinity) => {
  const start = midnight(day, utcOffsetMin);
  return focus(spans, start, Math.min(upTo, start + DAY_MS));
};

/** `utcOffsetMin` is the viewer's offset from UTC in minutes, 330 for Sri Lanka. */
export function stats(sessions: readonly Session[], utcOffsetMin: number): Stats {
  const counted = sessions.filter(counts);
  const days: Stats['days'] = {};
  for (const [day, list] of byDay(counted, utcOffsetMin)) {
    // A lap that was stopped is a lap, a short one, on the day it ended.
    const laps = list.filter((s) => lapDay(s, utcOffsetMin) === day).length;
    const focus_ms = focusIn(list, day, utcOffsetMin);
    if (laps > 0 || focus_ms > 0) days[day] = { focus_ms, laps };
  }

  // By start, each lap is compared only with those that begin before it ends: a year of laps is
  // a few thousand comparisons, not millions.
  const overlaps: [string, string][] = [];
  const inOrder = counted.toSorted((a, b) => from(a) - from(b));
  inOrder.forEach((a, i) => {
    for (let j = i + 1; j < inOrder.length && from(inOrder[j]!) < a.ended; j++) {
      const b = inOrder[j]!;
      // More than an instant: back to back on two devices is not an overlap.
      const shared = Math.min(a.ended, b.ended) - from(b);
      if (a.device !== b.device && shared > 0) overlaps.push(a.id < b.id ? [a.id, b.id] : [b.id, a.id]);
    }
  });
  return { days, overlaps: overlaps.sort((x, y) => (x[0] !== y[0] ? (x[0] < y[0] ? -1 : 1) : x[1] < y[1] ? -1 : 1)) };
}

/** The focus of local day `day` in these sessions, nothing after `upTo`: the counted ones, cut at the day's midnights, minutes two ran at once counted once. */
export const focusOn = (sessions: readonly Session[], day: string, utcOffsetMin: number, upTo = Infinity): number =>
  focusIn(sessions.filter(counts), day, utcOffsetMin, upTo);

/** Today so far against the same stretch of a past day. `state` is the timer, for the lap in progress. */
export function race(sessions: readonly Session[], state: TimerState, now: number, utcOffsetMin: number): Race {
  const past = byDay(sessions.filter(counts), utcOffsetMin);
  const today = localDay(now, utcOffsetMin);

  // A lap with no row yet runs to now, to its pause, or to its bell. It joins today's union like
  // any lap, so the number does not jump when its row is written. Begun yesterday, the clip
  // counts it from midnight; a lap from yesterday that ran past midnight is in today's list too.
  const spans: Span[] = [...(past.get(today) ?? [])];
  if (state.phase === 'work' && state.started !== null && !sessions.some((s) => s.id === state.run)) {
    const ended = state.paused_at ?? Math.min(now, view(state, now).ends_at ?? now);
    spans.push({ started: state.started, paused_ms: state.paused_ms, ended });
  }
  const you_ms = focusIn(spans, today, utcOffsetMin, now);

  const has = (day: string) => focusIn(past.get(day) ?? [], day, utcOffsetMin) > 0;
  const lastWeek = localDay(now - 7 * DAY_MS, utcOffsetMin);
  const day = has(lastWeek) ? lastWeek : [...past.keys()].filter((d) => d < today && has(d)).sort().at(-1);
  if (!day) return { you_ms, ghost: null, split_ms: null };

  const list = past.get(day) ?? [];
  // The same time of day, that many whole days ago.
  const ms = focusIn(list, day, utcOffsetMin, now - (Date.parse(today) - Date.parse(day)));
  return { you_ms, ghost: { day, ms, total_ms: focusIn(list, day, utcOffsetMin) }, split_ms: you_ms - ms };
}
