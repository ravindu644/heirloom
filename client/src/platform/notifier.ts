// The one way the app rings. The browser and the phone each implement it; screens never reach
// past it to a plugin, so "ring here" and the phone's exact alarm stay in one place.

/** What to ring and when. `at` is this device's own clock, in ms. The words come from the caller. */
export interface Ring {
  at: number;
  title: string;
  body: string;
  /** The words for the phase while it runs, such as "Lap 2 of 4". The phone shows them over a live
   * countdown to `at`; the browser has the screen itself and ignores them. */
  during?: string;
}

/** A plan closer than this to now is a phase already ending, such as a tap on finish: no bell. */
export const MOMENT_MS = 1000;

export interface Notifier {
  /** Ring at `ring.at`, replacing whatever was planned. `null` cancels: paused, stopped, or nothing running. */
  plan(ring: Ring | null): void;
  /** Ask the person for whatever this platform needs to show a notification. True when it can. Call it from a tap. */
  allow(): Promise<boolean>;
}
