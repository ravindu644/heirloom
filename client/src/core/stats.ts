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

/** The local day, `2026-11-24`, that `ms` falls in for someone `utcOffsetMin` minutes east of UTC. */
export const localDay = (ms: number, utcOffsetMin: number): string =>
  new Date(ms + utcOffsetMin * 60000).toISOString().slice(0, 10);

function byDay<T extends Span>(spans: readonly T[], utcOffsetMin: number): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const s of spans) {
    const day = localDay(s.started, utcOffsetMin);
    days.set(day, [...(days.get(day) ?? []), s]);
  }
  return days;
}

// The length of the union, with nothing after `upTo` counted: walk the laps by start and add
// only what reaches past everything before.
function focus(spans: readonly Span[], upTo = Infinity): number {
  let total = 0;
  let reach = -Infinity;
  for (const s of spans.toSorted((a, b) => from(a) - from(b))) {
    const end = Math.min(s.ended, upTo);
    total += Math.max(0, end - Math.max(reach, from(s)));
    reach = Math.max(reach, end);
  }
  return total;
}

/** `utcOffsetMin` is the viewer's offset from UTC in minutes, 330 for Sri Lanka. */
export function stats(sessions: readonly Session[], utcOffsetMin: number): Stats {
  const counted = sessions.filter(counts);
  const days: Stats['days'] = {};
  for (const [day, list] of byDay(counted, utcOffsetMin)) {
    days[day] = { focus_ms: focus(list), laps: list.filter((s) => s.outcome === 'rang').length };
  }

  // ponytail: every pair is compared. Sort by start and sweep if a history ever makes this slow.
  const overlaps: [string, string][] = [];
  for (const a of counted) {
    for (const b of counted) {
      // More than an instant: back to back on two devices is not an overlap.
      const shared = Math.min(a.ended, b.ended) - Math.max(from(a), from(b));
      if (a.id < b.id && a.device !== b.device && shared > 0) overlaps.push([a.id, b.id]);
    }
  }
  return { days, overlaps: overlaps.sort((x, y) => (x[0] !== y[0] ? (x[0] < y[0] ? -1 : 1) : x[1] < y[1] ? -1 : 1)) };
}

/** Today so far against the same stretch of a past day. `state` is the timer, for the lap in progress. */
export function race(sessions: readonly Session[], state: TimerState, now: number, utcOffsetMin: number): Race {
  const past = byDay(sessions.filter(counts), utcOffsetMin);
  const today = localDay(now, utcOffsetMin);

  // A lap with no row yet runs to now, to its pause, or to its bell. It joins today's union like
  // any lap, so the number does not jump when its row is written.
  const spans: Span[] = [...(past.get(today) ?? [])];
  if (state.phase === 'work' && state.started !== null && !sessions.some((s) => s.id === state.run)) {
    const ended = state.paused_at ?? Math.min(now, view(state, now).ends_at ?? now);
    const open = { started: state.started, paused_ms: state.paused_ms, ended };
    if (localDay(open.started, utcOffsetMin) === today) spans.push(open);
  }
  const you_ms = focus(spans, now);

  const has = (day: string) => focus(past.get(day) ?? []) > 0;
  const lastWeek = localDay(now - 7 * DAY_MS, utcOffsetMin);
  const day = has(lastWeek) ? lastWeek : [...past.keys()].filter((d) => d < today && has(d)).sort().at(-1);
  if (!day) return { you_ms, ghost: null, split_ms: null };

  const list = past.get(day) ?? [];
  // The same time of day, that many whole days ago.
  const ms = focus(list, now - (Date.parse(today) - Date.parse(day)));
  return { you_ms, ghost: { day, ms, total_ms: focus(list) }, split_ms: you_ms - ms };
}
