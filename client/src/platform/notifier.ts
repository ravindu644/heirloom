// The one way the app rings. The browser and the phone each implement it; screens never reach
// past it to a plugin, so "ring here" and the phone's exact alarm stay in one place.

import type { Reminder } from './reminders.ts';

/** What to ring and when. `at` is this device's own clock, in ms. The words come from the caller. */
export interface Ring {
  at: number;
  title: string;
  body: string;
  /** The words for the phase while it runs, such as "Lap 2 of 4". The phone shows them over a live
   * countdown to `at`; the browser has the screen itself and ignores them. */
  during?: string;
  /** How the server's push names this bell: the timer's run and its `ends_at`, in server time.
   * The browser uses it to know the push has rung this very bell. */
  push?: { run: string; at: number };
  /** The countdown's buttons, worded by the caller. While it runs the phone shows Pause and Stop. */
  actions?: Actions;
}

/** A tap on one of the countdown's buttons. */
export type Act = 'pause' | 'resume' | 'stop';

/** The words on the countdown's buttons, and the timer's run they are drawn for. */
export interface Actions {
  pause: string;
  resume: string;
  stop: string;
  /** Comes back with a tap, so the app can drop one made on a notification for a run since replaced. */
  run: string | null;
}

/**
 * A lap or a break standing still: no bell. The phone keeps a notification with `during` over
 * `left` (the time left, as the caller words it, "12:34 left") and Resume and Stop.
 */
export interface Paused {
  paused: true;
  during: string;
  left: string;
  actions?: Actions;
}

export const isPaused = (plan: Ring | Paused | null): plan is Paused => plan !== null && 'paused' in plan;

/** A plan closer than this to now is a phase already ending, such as a tap on finish: no bell. */
export const MOMENT_MS = 1000;

export interface Notifier {
  /**
   * Ring at `ring.at`, replacing whatever was planned. `Paused` cancels the bell and keeps a still
   * notification to resume from; `null` cancels everything: stopped, or nothing running. A plan with
   * the same `at` and other words changes the words only: the alarm stays as it is.
   */
  plan(ring: Ring | Paused | null): void;
  /**
   * Hears the countdown's buttons. The phone delivers a tap made while the app was away, or that
   * opened it, as soon as this is called. The browser has no such buttons and never calls it.
   */
  onAction(heard: (act: Act, run: string | null) => void): void;
  /** Ask the person for whatever this platform needs to show a notification. True when it can. Call it from a tap. */
  allow(): Promise<boolean>;
  /** The person's "ring here" for this device. Off: nothing is planned, and no push comes here. Starts on. */
  ringHere(on: boolean): void;
  /** Who is signed in: `in` or `out`. Push to this browser waits until both this and `ringHere` have been said. */
  account(change: 'in' | 'out'): void;
  /** The words a push would say may have changed (the break lengths): sent again only if they differ. */
  reword(): void;
  /**
   * Whether a ring due now would be heard. Never asks. False only when the person has refused
   * (permission denied); not asked yet is not refused, so it is true.
   */
  canRing(): Promise<boolean>;
  /** Every habit reminder wanted, whole: what this device holds is made to match it and nothing else. */
  reminders(set: Reminder[]): void;
}
