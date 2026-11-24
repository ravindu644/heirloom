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

/** Stamps one edit at `now` (server-corrected ms). Keep the returned clock, or the next stamp can repeat this one. */
export function stamp(clock: Clock, now: number, device: string): { clock: Clock; stamp: Stamp } {
  throw new Error('not built yet: stamp, roadmap section 1');
}

/** The clock after seeing a stamp from anywhere, so the next edit is later than it. */
export function see(clock: Clock, seen: Stamp): Clock {
  throw new Error('not built yet: see, roadmap section 1');
}

/** The server's drift check: false when the stamp's time is more than five minutes past `serverTime`. */
export function acceptable(stamp: Stamp, serverTime: number): boolean {
  throw new Error('not built yet: acceptable, roadmap section 1');
}
