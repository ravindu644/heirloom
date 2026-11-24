// The browser's Notifier: the bell, and a notification when the tab is out of sight.
//
// What a page cannot do: ring from a closed tab, or from a laptop asleep. A hidden tab's timers are
// throttled too (Chrome lets one fire up to a minute late after five minutes hidden, and pauses
// timers while the machine sleeps). So one timer per plan, set from outside any timer callback so
// Chrome does not count it as a chain and throttle it harder, a fresh look whenever the tab comes
// back into view, and a lateness cut-off. The server's Web Push (section 9) covers the closed tab.

import type { Notifier, Ring } from './notifier.ts';
import { createBell } from './sound.ts';

/** A plan closer than this to now is a phase already ending, such as a tap on finish: no bell. */
export const MOMENT_MS = 1000;
/** A ring this late is still worth hearing: past it, the person has moved on. Covers the throttle. */
export const LATE_MS = 2 * 60_000;

/** The parts of `Notification` used here, so a test can hand in its own. */
export interface NotificationApi {
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  new (title: string, options?: NotificationOptions): unknown;
}

export interface WebEnv {
  now(): number;
  schedule(run: () => void, ms: number): () => void;
  hidden(): boolean;
  /** Runs `look` each time the page comes back into view. */
  onShow(look: () => void): void;
  bell(): void;
  /** Missing where the browser has no notifications. */
  Notification?: NotificationApi;
}

export function createWebNotifier(env: WebEnv): Notifier {
  let planned: Ring | null = null;
  let cancel = () => {};

  // Rings the plan if it is due, then forgets it, so each plan rings at most once.
  const look = () => {
    if (!planned || env.now() < planned.at) return false;
    const { title, body, at } = planned;
    planned = null;
    cancel();
    if (env.now() - at > LATE_MS) return true;
    env.bell();
    const N = env.Notification;
    // A visible page has the screen itself; a notification on top of it is noise.
    if (N?.permission === 'granted' && env.hidden()) {
      // Chrome on Android refuses the constructor outside a service worker; the bell already rang.
      try {
        new N(title, { body, tag: 'heirloom-ring' });
      } catch {}
    }
    return true;
  };

  // A timer can fire early by the wall clock (the clock was set back), so it looks again first.
  const arm = () => {
    cancel();
    if (planned) cancel = env.schedule(() => look() || arm(), planned.at - env.now());
  };

  env.onShow(() => look() || arm());

  return {
    plan(ring) {
      // A due ring that the throttle held back still rings before it is replaced.
      look();
      if (ring && planned?.at === ring.at) {
        planned = ring;
        return;
      }
      planned = ring && ring.at - env.now() >= MOMENT_MS ? ring : null;
      arm();
    },
    async allow() {
      const N = env.Notification;
      if (!N || N.permission === 'denied') return false;
      return N.permission === 'granted' || (await N.requestPermission()) === 'granted';
    },
  };
}

/** The app's notifier in the browser. The first tap or key anywhere unlocks the bell. */
export function webNotifier(): Notifier {
  const bell = createBell(() => new AudioContext());
  // Every gesture, not just the first: unlock is cheap once running, and it revives a context the
  // system suspended. pointerup, not pointerdown: a touch's pointerdown does not count as a gesture.
  for (const type of ['pointerup', 'keydown']) addEventListener(type, bell.unlock, { capture: true, passive: true });
  return createWebNotifier({
    now: () => Date.now(),
    schedule: (run, ms) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
    hidden: () => document.hidden,
    onShow: (look) => document.addEventListener('visibilitychange', () => document.hidden || look()),
    bell: bell.play,
    Notification: typeof Notification === 'undefined' ? undefined : Notification,
  });
}
