// Stamps and the device clock: contracts/protocol.md section 2.
// Nothing else in the client makes a stamp, so a fix to the clock rule lands here once.

/** `2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718`. Compared as a plain string. */
export type Stamp = string;

/** The highest stamp this device has made or seen. Plain data, so the store saves it in the same write as the cells. */
export interface Clock {
  readonly ms: number;
  readonly counter: number;
}

export const ZERO: Clock = { ms: 0, counter: 0 };

const MAX_AHEAD_MS = 300000;

const read = (stamp: Stamp): Clock => ({
  ms: Date.parse(stamp.slice(0, 24)),
  counter: parseInt(stamp.slice(25, 29), 16),
});

const write = (clock: Clock, device: string): Stamp =>
  `${new Date(clock.ms).toISOString()}-${clock.counter.toString(16).padStart(4, '0')}-${device}`;

/** Stamps one edit at `now` (server-corrected ms). Keep the returned clock, or the next stamp can repeat this one. */
export function stamp(clock: Clock, now: number, device: string): { clock: Clock; stamp: Stamp } {
  let next = now > clock.ms ? { ms: now, counter: 0 } : { ms: clock.ms, counter: clock.counter + 1 };
  if (next.counter > 0xffff) next = { ms: next.ms + 1, counter: 0 };
  return { clock: next, stamp: write(next, device) };
}

/** The clock after seeing a stamp from anywhere, so the next edit is later than it. */
export function see(clock: Clock, seen: Stamp): Clock {
  const s = read(seen);
  // A stamp that does not parse must not reach the clock: one NaN there and no edit could be stamped again.
  if (Number.isNaN(s.ms) || Number.isNaN(s.counter)) return clock;
  return s.ms > clock.ms || (s.ms === clock.ms && s.counter > clock.counter) ? s : clock;
}

/**
 * The stamp of something that happened at a known moment, whenever it is written down: the bell
 * of a lap (protocol section 11). Counter 0, and no clock is read or moved.
 */
export const eventStamp = (ms: number, device: string): Stamp => write({ ms, counter: 0 }, device);

/** When a stamp was made, in ms. */
export const stampMs = (stamp: Stamp): number => read(stamp).ms;

/** The device that made a stamp. */
export const stampDevice = (stamp: Stamp): string => stamp.slice(30);

/** The server's drift check: false when the stamp's time is more than five minutes past `serverTime`. */
export function acceptable(stamp: Stamp, serverTime: number): boolean {
  return read(stamp).ms - serverTime <= MAX_AHEAD_MS;
}
