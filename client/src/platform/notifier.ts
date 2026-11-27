// The one way the app rings. The browser and the phone each implement it; screens never reach
// past it to a plugin, so "ring here" and the phone's exact alarm stay in one place.

import type { TimerState } from '../core/timer.ts';
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

/** A called lap this account is in (protocol.md section 15, Start together): a notification at
 * `at`, this device's own clock, in ms, that it starts. The words come from the caller. */
export interface Call {
  /** The call's id: the page and the phone's background service may each say the same call. */
  id: string;
  at: number;
  title: string;
  body: string;
}

/** The timer cell a plan was made from: its stamp (null with no cell yet) and its value. The phone
 * keeps the newer of this and what its background service hears; the browser ignores it. */
export interface Timer {
  stamp: string | null;
  state: TimerState;
}

/**
 * The words the phone's background service says things with when the page is not there to
 * (ARCHITECTURE section 6). Templates fill `{t}`, `{room}`, `{name}`, `{text}` and `{time}`.
 */
export interface Words {
  /** The bell, by the lap's place in its set (0 to 3): as the push words of a closed tab. */
  bell: { lap: string[]; take: string[]; next: string[]; break: string };
  /** Over the countdown of a lap started elsewhere, before the app has its task. */
  during: { work: string; short: string; long: string };
  /** The countdown's buttons; `done` ends a break. */
  actions: { pause: string; resume: string; stop: string; done: string };
  /** A paused phase: "Paused, {t} left". */
  left: string;
  note: { title: string; body: string };
  /** A new call from someone else. */
  call: { title: string; body: string };
  /** The alarm of a call you are in: `body` for your own call, `with` for someone else's. */
  starts: { title: string; body: string; with: string };
  /** The service's own notification. */
  keeping: string;
  channels: { keep: string; rooms: string };
}

/** What the phone's background service needs to keep step. `on`: its switch and Ring here, together. */
export interface Keep {
  server: string;
  account: string;
  token: string;
  device: string;
  cursor: number;
  on: boolean;
  words: Words;
}

/** A plan closer than this to now is a phase already ending, such as a tap on finish: no bell. */
export const MOMENT_MS = 1000;

export interface Notifier {
  /**
   * Ring at `ring.at`, replacing whatever was planned. `Paused` cancels the bell and keeps a still
   * notification to resume from; `null` cancels everything: stopped, or nothing running. A plan with
   * the same `at` and other words changes the words only: the alarm stays as it is. `timer` is the
   * cell it was made from, for the phone.
   */
  plan(ring: Ring | Paused | null, timer?: Timer): void;
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
  /**
   * The called lap this account is in, or null: out of it, taken back, or the call over. One at a
   * time; a new one replaces the last. A call whose time has passed sets nothing, and the same call
   * given again after its time leaves its notification where it is.
   */
  call(next: Call | null): void;
  /** Who the phone's background service keeps step as, and with what words; null signed out. The browser has none. */
  keep(link: Keep | null): void;
  /** Whether the platform may stop heirloom in the background to save battery. The browser: never asks, always true. */
  background(): Promise<{ unrestricted: boolean }>;
  /** Opens the platform's own request to let heirloom run unrestricted. Call it from a tap. */
  askUnrestricted(): void;
}

/**
 * The countdown's taps, done for the run their button was drawn for. A tap for a run the page does
 * not hold may be for a lap the phone's service drew while the app was closed, which the page has
 * not caught up to yet: it waits until the page has caught up, and is done then if the run is the
 * timer's, else dropped (a notification left over from an earlier run). Call `look` whenever the
 * timer or the catching up changes.
 */
export function heldTaps(run: () => string | null, caughtUp: () => boolean, act: (act: Act) => void) {
  let waiting: [Act, string | null] | null = null;
  const look = () => {
    if (!waiting) return;
    const [a, r] = waiting;
    if (r === run()) {
      waiting = null;
      act(a);
    } else if (caughtUp()) waiting = null;
  };
  return {
    tap(a: Act, r: string | null) {
      waiting = [a, r];
      look();
    },
    look,
  };
}
