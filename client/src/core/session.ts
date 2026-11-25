// When a run of the timer becomes a session row, and who may write it: contracts/protocol.md section 11.

import { stampDevice } from './hlc.ts';
import type { Stamp } from './hlc.ts';
import type { Session } from './stats.ts';
import { FLOOR_MS, view } from './timer.ts';
import type { TimerState } from './timer.ts';

/** What ended the run. `replaced`: another device's run took the timer while this one was open. */
export type End = 'bell' | 'stop' | 'replaced';

export interface Closed {
  /** The run id, which is the row id. */
  id: string;
  row: Omit<Session, 'id' | 'note'>;
  /**
   * For a bell's row, when the timer cell was last written: every cell is stamped there
   * (`eventStamp`), so the row is the same whoever writes it and whenever, and anything a person
   * did to the run since is newer. Null for ordinary stamps from the clock.
   */
  stamp_at: number | null;
}

/** The moment and the writer of a close. */
export interface Closing {
  now: number;
  device: string;
  /** The time in the timer cell's stamp. */
  written: number;
  /** A rang row for this run is already held: it reached a bell once, and was then extended. */
  rang?: boolean;
}

/** The row a run leaves when it ends this way, or null when it leaves none. */
export function closeRun(state: TimerState, end: End, { now, device, written, rang = false }: Closing): Closed | null {
  if (state.phase === 'idle' || state.run === null || state.started === null) return null;
  const { over, ends_at } = view(state, now);
  if (end === 'bell' && !over) return null;
  const ended = over && ends_at !== null ? ends_at : (state.paused_at ?? now);
  // A run ended before its bell within its first minute of running leaves nothing, a lap as a
  // break: a start taken back is not a lap of the day. A run that reached a bell is kept, however short.
  if (!over && !rang && ended - state.started - state.paused_ms < FLOOR_MS) return null;
  return {
    id: state.run,
    // Only the row of a bell that has just gone is the bell's own. A stop during an extension is a person's edit.
    stamp_at: over ? written : null,
    row: {
      kind: state.phase,
      task: state.task,
      started: state.started,
      ended,
      planned_ms: state.planned_ms,
      paused_ms: state.paused_ms,
      // A stop after a bell is not a stop: the lap rang, and stays one that did.
      outcome: over || rang ? 'rang' : 'stopped',
      device,
    },
  };
}

/**
 * Whether this device writes the rang row of a run it sees over. Never twice. In step with the
 * server it knows nobody stopped the run elsewhere; offline it writes only for a timer it wrote
 * last itself, because another device's lap may have been stopped where it was running.
 */
export function mayWriteBell(timerStamp: Stamp, device: string, inStep: boolean, hasRow: boolean): boolean {
  return !hasRow && (inStep || stampDevice(timerStamp) === device);
}
