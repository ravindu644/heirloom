// What the session rows and the timer add up to right now. Focus and Today both show these
// numbers on one screen, so they are worked out in one place.

import { computed } from '@preact/signals-core';
import { stampMs } from '../core/hlc.ts';
import { localDay, race } from '../core/stats.ts';
import type { Race, Session } from '../core/stats.ts';
import { view } from '../core/timer.ts';
import type { TimerState } from '../core/timer.ts';
import type { Engine, Row } from './engine.ts';

const DAY_MS = 86400000;
const LENGTHS = { work_ms: 1500000, short_ms: 300000, long_ms: 900000 };

/** The lengths a lap and the breaks get: the settings row's, or the default where it has none a timer could use. */
export function lapLengths(settings: Row | undefined): typeof LENGTHS {
  const length = (name: keyof typeof LENGTHS) => {
    const value = settings?.[name];
    // A day is the schema's maximum.
    return typeof value === 'number' && Number.isInteger(value) && value >= 1000 && value <= DAY_MS ? value : LENGTHS[name];
  };
  return { work_ms: length('work_ms'), short_ms: length('short_ms'), long_ms: length('long_ms') };
}

// A row still arriving cell by cell, or one from a build that writes something else, is not counted yet.
const isSession = (row: Record<string, unknown>) =>
  ['started', 'ended', 'paused_ms'].every((field) => typeof row[field] === 'number') &&
  ['kind', 'outcome', 'device'].every((field) => typeof row[field] === 'string');

export function createCounts(engine: Pick<Engine, 'timer' | 'now' | 'rows' | 'stamp'>, utcOffsetMin: () => number) {
  const state = engine.timer;
  const rows = engine.rows('session');
  const sessions = computed(() => [...rows.value.values()].filter(isSession) as unknown as Session[]);
  const timerStamp = () => engine.stamp('timer', 'current', 'state');
  const today = (ms: number) => localDay(ms, utcOffsetMin());

  // The row held for a run was written no earlier than the timer cell that shows the run. A row
  // from before is about a run that has since gone on: a stop that was undone.
  function current(run: string, written: number): boolean {
    const stamp = engine.stamp('session', run, 'ended');
    return stamp !== undefined && stampMs(stamp) >= written;
  }

  // A row already tells this run's story up to this bell. A row that ends earlier does not: the
  // lap was extended after it rang, or went on here after another device stopped it.
  function covered(run: string, endsAt: number, written: number): boolean {
    const ended = rows.peek().get(run)?.ended;
    return typeof ended === 'number' && ended >= endsAt && current(run, written);
  }

  const rangOnce = (s: TimerState) => s.run !== null && rows.peek().get(s.run)?.outcome === 'rang';

  // The sessions as the timer's own run would have them read: a row that ends before the run
  // has got to (see `covered`) would hide the lap in progress.
  function live(s: TimerState, now: number): Session[] {
    const end = s.paused_at ?? Math.min(now, view(s, now).ends_at ?? now);
    return sessions.value.filter((row) => !(row.id === s.run && row.ended < end));
  }

  /** Laps that rang on `day`, by rows alone. */
  const lapsOn = (day: string): number =>
    sessions.value.filter((row) => row.kind === 'work' && row.outcome === 'rang' && today(row.started) === day).length;

  return {
    rows,
    sessions,
    timerStamp,
    today,
    current,
    covered,
    rangOnce,
    live,

    /** You against the ghost at the engine's now, the lap in progress included. */
    race(): Race {
      const now = engine.now();
      return race(live(state.value, now), state.value, now, utcOffsetMin());
    },

    lapsOn,

    /** Laps that rang today, and the lap whose bell has gone but whose row is not written yet. */
    lapsToday(): number {
      const s = state.value;
      const now = engine.now();
      const day = today(now);
      const laps = lapsOn(day);
      // As the race does: a lap whose bell has gone counts before its row is written, which may
      // be a while on a device that is offline with another device's timer.
      const { over, ends_at } = view(s, now);
      const stamp = timerStamp();
      if (s.phase !== 'work' || !over || s.run === null || s.started === null || ends_at === null || !stamp) return laps;
      // Not twice: a rang row is in the count already, and a row that covers this bell has the last word on it.
      return today(s.started) !== day || rangOnce(s) || covered(s.run, ends_at, stampMs(stamp)) ? laps : laps + 1;
    },
  };
}
