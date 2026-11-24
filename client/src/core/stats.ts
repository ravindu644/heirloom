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
  throw new Error('not built yet: stats, roadmap section 5');
}
