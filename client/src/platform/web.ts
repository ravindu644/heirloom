// The browser's Notifier: the bell, and a notification when the tab is out of sight.
//
// What a page cannot do: ring from a closed tab, or from a laptop asleep. A hidden tab's timers are
// throttled too (Chrome lets one fire up to a minute late after five minutes hidden, and pauses
// timers while the machine sleeps). So one timer per plan, set from outside any timer callback so
// Chrome does not count it as a chain and throttle it harder, a fresh look whenever the tab comes
// back into view, and a lateness cut-off. The server's Web Push covers the closed tab and the
// sleeping one; push.ts keeps this browser subscribed.
//
// Who rings, push or page, so that a bell is never rung twice nor missed (the worker posts `rang`
// to every open window and shows the notification only when no window of the app is visible):
// - Visible: the page's timer is on time. It rings the bell; the worker shows nothing. If the push
//   comes first, `rang` arrives with nothing shown, and the page rings then. One bell.
// - Hidden, tab open: whichever is first. The worker's notification and the page's own share the
//   tag heirloom-ring, so one replaces the other quietly. `rang` with a notification shown forgets
//   the plan, so the throttled timer that fires later stays quiet.
// - Tab closed: the worker's notification alone.
// - Laptop asleep: nothing can ring. On waking, a push less than 60 s old (its TTL) is shown; the
//   page rings by itself if it looks first and the bell is under LATE_MS old.

import { MOMENT_MS } from './notifier.ts';
import type { Notifier, Ring } from './notifier.ts';
import { createPush } from './push.ts';
import { upcoming } from './reminders.ts';
import type { Reminder } from './reminders.ts';
import type { PushEnv } from './push.ts';
import { createBell } from './sound.ts';
import type { Bell } from './sound.ts';
/** A ring this late is still worth hearing: past it, the person has moved on. Covers the throttle. */
export const LATE_MS = 2 * 60_000;
/** A habit reminder this late is still worth showing. */
export const REMIND_LATE_MS = 60 * 60_000;

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
  /** Web Push, where the page has a service worker and a server to ask. */
  push?: PushEnv & {
    /** Runs `hear` with each message from the service worker. */
    onMessage(hear: (data: unknown) => void): void;
  };
}

/** The service worker's word that a push rang this run's end. `shown`: whether it showed the notification. */
interface Rang {
  t: 'rang';
  run: string;
  at: number;
  shown?: boolean;
}
const isRang = (m: unknown): m is Rang => typeof m === 'object' && m !== null && (m as Rang).t === 'rang';

export function createWebNotifier(env: WebEnv): Notifier {
  let planned: Ring | null = null;
  // The last plan given, kept while "ring here" is off, so switching it on plans it again.
  let wanted: Ring | null = null;
  let here = true;
  // Push waits until main has said both whether this device rings and who is signed in, so a
  // device with "ring here" off is never subscribed for a moment at load.
  let told = false;
  let signedIn = false;
  let cancel = () => {};
  const push = env.push && createPush(env.push);
  const granted = () => env.Notification?.permission === 'granted';
  const subscribe = () => void (told && here && signedIn && granted() && push?.subscribe());

  // Rings the plan now, then forgets it, so each plan rings at most once.
  const ring = () => {
    if (!planned) return;
    const { title, body, at } = planned;
    planned = null;
    cancel();
    if (env.now() - at > LATE_MS) return;
    env.bell();
    const N = env.Notification;
    // A visible page has the screen itself; a notification on top of it is noise.
    if (N?.permission === 'granted' && env.hidden()) {
      // Chrome on Android refuses the constructor outside a service worker; the bell already rang.
      try {
        new N(title, { body, tag: 'heirloom-ring' });
      } catch {}
    }
  };
  const look = () => {
    if (!planned || env.now() < planned.at) return false;
    ring();
    return true;
  };

  // A timer can fire early by the wall clock (the clock was set back), so it looks again first.
  const arm = () => {
    cancel();
    if (planned) cancel = env.schedule(() => look() || arm(), planned.at - env.now());
  };


  env.push?.onMessage((m) => {
    const p = planned?.push;
    if (!isRang(m) || !p || p.run !== m.run || p.at !== m.at) return;
    // A worker that does not say whether it showed one decided by whether a window was visible,
    // and this is the only window that rings.
    if (m.shown ?? env.hidden()) {
      planned = null;
      cancel();
    } else ring();
  });

  // Habit reminders. A page cannot schedule a notification for when it is closed, so this is the
  // honest minimum: while a tab is open, a notification at the reminder's time, if permitted and
  // the habit is not done. A closed tab reminds of nothing.
  let habits: Reminder[] = [];
  // Reminders due after this and up to now have been looked at.
  let since = env.now();
  let stopReminding = () => {};
  const remind = () => {
    stopReminding();
    const now = env.now();
    const ok = here && granted();
    // A throttled or sleeping tab may look long after: an hour late is still a reminder, more is not.
    for (const d of ok ? upcoming(habits, since, 2) : []) {
      if (d.at > now) break;
      if (now - d.at > REMIND_LATE_MS) continue;
      try {
        new env.Notification!(d.title, { body: d.body, tag: `heirloom-remind-${d.id}` });
      } catch {}
    }
    since = now;
    const [next] = ok ? upcoming(habits, now, 2, 1) : [];
    // A timer that fires early finds nothing due yet and is set again.
    stopReminding = next ? env.schedule(remind, next.at - now) : () => {};
  };
  env.onShow(() => {
    if (!look()) arm();
    remind();
  });

  const plan = (next: Ring | null) => {
    // A due ring that the throttle held back still rings before it is replaced.
    look();
    if (next && planned?.at === next.at) {
      planned = next;
      return;
    }
    planned = next && next.at - env.now() >= MOMENT_MS ? next : null;
    arm();
  };

  return {
    plan(next) {
      wanted = next;
      plan(here ? next : null);
    },
    async allow() {
      const N = env.Notification;
      if (!N || N.permission === 'denied') return false;
      const ok = N.permission === 'granted' || (await N.requestPermission()) === 'granted';
      if (ok) subscribe();
      return ok;
    },
    reminders(set) {
      habits = set;
      remind();
    },
    ringHere(on) {
      const first = !told;
      told = true;
      if (on === here) {
        // At start: the browser may hand out a different subscription, or the words may have changed.
        if (first) subscribe();
        return;
      }
      here = on;
      remind();
      if (on) {
        plan(wanted);
        subscribe();
      } else {
        // Not through plan(): a held-back bell must not ring at the moment the person says not here.
        planned = null;
        cancel();
        // Off from the start: it was unsubscribed when it was switched off.
        if (!first) void push?.unsubscribe(true);
      }
    },
    account(change) {
      signedIn = change === 'in';
      if (signedIn) subscribe();
      else void push?.unsubscribe(false);
    },
    reword: subscribe,
  };
}

/** setTimeout as the notifiers take it: a function that cancels. */
export function timer(run: () => void, ms: number): () => void {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
}

/** The bell in this page. The first tap or key anywhere unlocks it. */
function pageBell(): Bell {
  const bell = createBell(() => new AudioContext());
  // Every gesture, not just the first: unlock is cheap once running, and it revives a context the
  // system suspended. pointerup, not pointerdown: a touch's pointerdown does not count as a gesture.
  for (const type of ['pointerup', 'keydown']) addEventListener(type, bell.unlock, { capture: true, passive: true });
  return bell;
}

/** Runs `run` each time the page comes back into view: the browser's "the app is in front again". */
export function whenVisible(doc: Pick<Document, 'hidden' | 'addEventListener'>): (run: () => void) => void {
  return (run) => doc.addEventListener('visibilitychange', () => doc.hidden || run());
}

/** What the app hands the browser for Web Push. */
export interface PushFrom {
  request: PushEnv['request'];
  remembered: PushEnv['remembered'];
  remember: PushEnv['remember'];
  words: PushEnv['words'];
}

/** The page's push manager, once its service worker is active; none where nothing is registered. */
async function manager() {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!sw || typeof PushManager === 'undefined' || !(await sw.getRegistration())) return undefined;
  return (await sw.ready).pushManager;
}

/** The app's notifier in the browser. Without `from` it rings only while the page is open. */
export function webNotifier(from?: PushFrom): Notifier {
  return createWebNotifier({
    now: () => Date.now(),
    schedule: timer,
    hidden: () => document.hidden,
    onShow: whenVisible(document),
    bell: pageBell().play,
    Notification: typeof Notification === 'undefined' ? undefined : Notification,
    push: from && {
      ...from,
      manager,
      key: async () => ((await (await fetch('/api/push/key')).json()) as { key: string }).key,
      warn: (error) => console.warn('heirloom: push', error),
      onMessage: (hear) => navigator.serviceWorker?.addEventListener('message', (e) => hear(e.data)),
    },
  });
}
