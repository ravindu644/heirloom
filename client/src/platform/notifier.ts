// The one way the app rings. The browser and the phone each implement it; screens never reach
// past it to a plugin, so "ring here" and the phone's exact alarm stay in one place.

/** What to ring and when. `at` is this device's own clock, in ms. The words come from the caller. */
export interface Ring {
  at: number;
  title: string;
  body: string;
}

export interface Notifier {
  /** Ring at `ring.at`, replacing whatever was planned. `null` cancels: paused, stopped, or nothing running. */
  plan(ring: Ring | null): void;
  /** Ask the person for whatever this platform needs to show a notification. True when it can. Call it from a tap. */
  allow(): Promise<boolean>;
}
