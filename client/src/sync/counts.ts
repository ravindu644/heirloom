// What the session rows and the timer add up to right now. Focus and Today both show these
// numbers on one screen, so they are worked out in one place.

import { computed } from '@preact/signals-core';
import { stampMs } from '../core/hlc.ts';
import { isLength, isMoment } from '../core/real.ts';
import { fill, focusOf, localDay, race } from '../core/stats.ts';
import type { Race, Session } from '../core/stats.ts';
import { view } from '../core/timer.ts';
import type { TimerState } from '../core/timer.ts';
import type { Engine, Row } from './engine.ts';

const DAY_MS = 86400000;
const LENGTHS = { work_ms: 1500000, short_ms: 300000, long_ms: 900000 };

/**
 * The longest lap that is offered, in settings and on a task: 360 minutes, the user's hard
 * limit. A longer one that a row already holds (another client) is read and run as it is.
 */
export const LAP_MAX_MS = 360 * 60000;

/**
 * The lengths a lap and the breaks get from a row, each by itself: the row's where it holds a
 * length a timer could use, else `otherwise`. A settings row falls back to the defaults, a task
 * row to the account's.
 */
export function lapLengths(row: Row | undefined, otherwise: typeof LENGTHS = LENGTHS): typeof LENGTHS {
  const length = (name: keyof typeof LENGTHS) => (isLength(row?.[name]) ? (row![name] as number) : otherwise[name]);
  return { work_ms: length('work_ms'), short_ms: length('short_ms'), long_ms: length('long_ms') };
}

// A row still arriving cell by cell, or one from a build that writes something else, is not counted yet.
// Its times must be real ones too: every count walks the days from the first session, and a row
// stamped by a dead clock, or holding a number no date can be, would bury or break them all.
const isSession = (row: Record<string, unknown>) =>
  isMoment(row.started) &&
  isMoment(row.ended) &&
  ['paused_ms', 'planned_ms'].every((field) => typeof row[field] === 'number' && Number.isFinite(row[field]) && (row[field] as number) >= 0) &&
  ['kind', 'outcome', 'device'].every((field) => typeof row[field] === 'string') &&
  (row.task === null || row.task === undefined || typeof row.task === 'string');

export function createCounts(engine: Pick<Engine, 'timer' | 'now' | 'rows' | 'stamp'>, utcOffsetMin: () => number) {
  const state = engine.timer;
  const rows = engine.rows('session');
  const sessions = computed(() => [...rows.value.values()].filter(isSession) as unknown as Session[]);
  const timerStamp = () => engine.stamp('timer', 'current', 'state');
  const today = (ms: number) => localDay(ms, utcOffsetMin());

  // Every session under the local day it started on, and the days newest first. Worked out once
  // per change of a session row, so a number asked for on every tick reads two days of sessions
  // and not two years.
  // ponytail: grouped at the UTC offset of that moment. After a change of time zone it is right
  // again at the next session row or the next start; watch the offset if that ever matters.
  const byDay = computed(() => {
    const days = new Map<string, Session[]>();
    for (const session of sessions.value) {
      const day = today(session.started);
      const list = days.get(day);
      if (list) list.push(session);
      else days.set(day, [session]);
    }
    return days;
  });
  const newestFirst = computed(() => [...byDay.value.keys()].sort().reverse());

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

  // The row held for the timer's run tells the run up to where it has got to. One that does not
  // is from a stop that was taken back, or from a bell the lap was extended past: the run is
  // still open, and that row is not yet a lap of its own.
  function told(s: TimerState, now: number): boolean {
    const stamp = timerStamp();
    return s.run !== null && stamp !== undefined && covered(s.run, s.paused_at ?? Math.min(now, view(s, now).ends_at ?? now), stampMs(stamp));
  }

  // Whether a row is read while the timer is as it is. The run's own row is, when it tells the
  // run up to here, and when it rang: a lap that reached its bell stays a lap while an extension
  // runs on. A stopped row the run has gone on past is not: that lap has not ended.
  const stands = (row: Session, s: TimerState, tells: boolean) => row.id !== s.run || tells || row.outcome === 'rang';

  // The sessions as the timer's own run would have them read.
  function live(s: TimerState, now: number): Session[] {
    const tells = told(s, now);
    return sessions.value.filter((row) => stands(row, s, tells));
  }

  /**
   * The lap in progress as its row would read if it were written this instant: counted like any
   * row, a lap once its bell has gone. Null when no lap is on, or when a row already tells it
   * up to here. Its id is the run's, so it takes the place of a row the run has outgrown.
   */
  function open(now: number): Session | null {
    const s = state.value;
    if (s.phase !== 'work' || s.run === null || s.started === null) return null;
    const { over, ends_at } = view(s, now);
    const ended = s.paused_at ?? Math.min(now, ends_at ?? now);
    const held = rows.value.get(s.run)?.ended;
    if (typeof held === 'number' && held >= ended) return null;
    return { id: s.run, kind: 'work', task: s.task, started: s.started, ended, planned_ms: s.planned_ms, paused_ms: s.paused_ms, outcome: over ? 'rang' : 'stopped', device: '' };
  }

  /**
   * What the lap in progress has run that no row holds yet, in ms: what a total made of rows
   * lacks, here or on the server. 0 when no lap is on or a row tells it up to here.
   */
  function unwritten(now: number): number {
    const lap = open(now);
    const held = lap && rows.value.get(lap.id)?.ended;
    const ran = (ended: number) => ended - lap!.started - lap!.paused_ms;
    return lap ? Math.max(0, ran(lap.ended) - (typeof held === 'number' ? Math.max(0, ran(held)) : 0)) : 0;
  }

  const counted = (row: Session) => row.kind === 'work' && row.outcome !== 'void';
  /** The laps of `day`, rang or stopped, by rows alone. */
  const lapsOn = (day: string): number => (byDay.value.get(day) ?? []).filter(counted).length;

  /**
   * One fill per lap of today, oldest first: every counted row, and the lap whose bell has gone
   * before its row is written, which may be a while on a device that is offline with another
   * device's timer. The lap in progress is not one yet.
   */
  function fillsToday(): number[] {
    const s = state.value;
    const now = engine.now();
    const day = today(now);
    const rowTells = told(s, now);
    const fills = (byDay.value.get(day) ?? [])
      .filter((row) => counted(row) && stands(row, s, rowTells))
      .sort((a, b) => a.started - b.started)
      .map(fill);
    // Not twice: a row that tells the run up to this bell has the last word on it, set aside or
    // not, and a row of an earlier bell of the same lap is this lap already.
    if (s.phase === 'work' && s.started !== null && view(s, now).over && !rowTells && !rangOnce(s) && today(s.started) === day) fills.push(1);
    return fills;
  }

  /**
   * How full the lap in progress is, when it is not yet one of today's laps: null when no lap is
   * on, when its bell has gone or it rang once already (then it is in `fillsToday`), or when it
   * began on an earlier day and so is that day's.
   */
  function fillOpen(): number | null {
    const s = state.value;
    const now = engine.now();
    const { over, left_ms } = view(s, now);
    if (s.phase !== 'work' || s.started === null || over || rangOnce(s) || today(s.started) !== today(now)) return null;
    return s.planned_ms > 0 ? Math.min(1, Math.max(0, (s.planned_ms - left_ms) / s.planned_ms)) : 0;
  }

  return {
    rows,
    sessions,
    byDay,
    timerStamp,
    today,
    current,
    covered,
    rangOnce,
    live,
    open,
    unwritten,

    /** You against the ghost at the engine's now, the lap in progress included. */
    race(): Race {
      const s = state.value;
      const now = engine.now();
      const day = today(now);
      const days = byDay.value;
      // The race itself picks the ghost: the same weekday last week if it has focus, else the
      // latest day before today that has. It is handed those two days and nothing more, and
      // from them it makes the same choice.
      const lastWeek = today(now - 7 * DAY_MS);
      const ghost = focusOf(days.get(lastWeek) ?? []) > 0 ? lastWeek : newestFirst.value.find((d) => d < day && focusOf(days.get(d)!) > 0);
      const two = [...(days.get(day) ?? []), ...((ghost && days.get(ghost)) || [])];
      // A row that ends before the run has got to (see `covered`) would hide the lap in progress.
      const end = s.paused_at ?? Math.min(now, view(s, now).ends_at ?? now);
      return race(two.filter((row) => !(row.id === s.run && row.ended < end)), s, now, utcOffsetMin());
    },

    lapsOn,
    fillsToday,
    fillOpen,
    /** Today's laps: as many as there are fills. */
    lapsToday: (): number => fillsToday().length,
  };
}
