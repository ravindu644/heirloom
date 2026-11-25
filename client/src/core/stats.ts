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

function byDay<T extends Span>(spans: readonly T[], utcOffsetMin: number): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const s of spans) {
    const day = localDay(s.started, utcOffsetMin);
    const list = days.get(day);
    if (list) list.push(s);
    else days.set(day, [s]);
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
    // A lap that was stopped is a lap, a short one.
    days[day] = { focus_ms: focus(list), laps: list.length };
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

/**
 * The set on screen: the fills of the laps of this set that have ended, oldest first. There are
 * `set_index` of them while a lap runs or the timer is idle, one more once the lap's bell has
 * gone and during a break: the last that many laps that started today, one set aside drawn
 * empty. Where fewer rows are held (a bell not yet written), the earliest are drawn full.
 */
export function setFills(sessions: readonly Session[], state: TimerState, now: number, utcOffsetMin: number): number[] {
  const { over, ends_at } = view(state, now);
  const shown = (s: Session) => (s.outcome === 'void' ? 0 : fill(s));
  // The lap whose bell has just gone is the last of them, and it is full: unless a row that
  // reaches the bell says otherwise (it was since set aside). A row from before the bell, left
  // by a stop that was taken back, says nothing of how it ended.
  const row = sessions.find((s) => s.id === state.run);
  const rung = state.phase === 'work' && over && ends_at !== null ? [row && row.ended >= ends_at ? shown(row) : 1] : [];
  const before = state.set_index + (state.phase === 'short' || state.phase === 'long' ? 1 : 0);
  const today = localDay(now, utcOffsetMin);
  // The run the timer is on is not one of those before it.
  const laps = sessions.filter((s) => s.kind === 'work' && s.id !== state.run && localDay(s.started, utcOffsetMin) === today).toSorted((a, b) => a.started - b.started);
  const held = before > 0 ? laps.slice(-before).map(shown) : [];
  return [...Array<number>(before - held.length).fill(1), ...held, ...rung];
}

/** The focus in these sessions with nothing after `upTo` counted: the counted ones, minutes two ran at once counted once. */
export const focusOf = (sessions: readonly Session[], upTo = Infinity): number => focus(sessions.filter(counts), upTo);

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
