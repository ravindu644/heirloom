// Totals from sessions: contracts/protocol.md section 7.

import type { Phase } from './timer.ts';

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

/** `utcOffsetMin` is the viewer's offset from UTC in minutes, 330 for Sri Lanka. */
export function stats(sessions: readonly Session[], utcOffsetMin: number): Stats {
  const counted = sessions.filter((s) => s.kind === 'work' && s.outcome !== 'void');
  const from = (s: Session) => s.started + s.paused_ms;

  const byDay = new Map<string, Session[]>();
  for (const s of counted) {
    const day = new Date(s.started + utcOffsetMin * 60000).toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const days: Stats['days'] = {};
  for (const [day, list] of byDay) {
    // The union: walk the laps by start and count only what reaches past everything before.
    let focus_ms = 0;
    let reach = -Infinity;
    for (const s of list.toSorted((a, b) => from(a) - from(b))) {
      focus_ms += Math.max(0, s.ended - Math.max(reach, from(s)));
      reach = Math.max(reach, s.ended);
    }
    days[day] = { focus_ms, laps: list.filter((s) => s.outcome === 'rang').length };
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
