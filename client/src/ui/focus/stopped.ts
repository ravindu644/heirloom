import { localDay } from '../../core/stats.ts';
import type { Focus } from '../../sync/focus.ts';
import * as s from '../strings.ts';

/** The local day a moment falls on. */
export const dayOf = (now: number) => localDay(now, -new Date(now).getTimezoneOffset());

export type Stop = NonNullable<Focus['lastStop']['value']>;

/**
 * What a stop did, in one line, from the core's record of it, wherever the stop was made: Focus
 * says it, and so does Today's bar after a tick that ended a lap. `laps` is today's count after
 * the stop, in which a counted lap is the last. `rang`: the lap's bell had gone, so nothing was
 * cut short and the line says which lap the timer rests after.
 */
export function stopSaid(stop: Stop, laps: number, now: number, rang = false): string {
  // A lap begun before midnight is yesterday's and has no number today: 0 says that.
  const lap = stop.phase === 'work' && dayOf(stop.started) !== dayOf(now) ? 0 : laps;
  if (stop.phase !== 'work' || rang) return s.focus.stoppedAfter(lap);
  // A start taken back is in no count, so it is never numbered.
  return stop.counted ? s.focus.stopped(lap, stop.ran_ms) : s.focus.takenBack;
}
