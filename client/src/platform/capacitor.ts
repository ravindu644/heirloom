// The phone's Notifier: an exact alarm that rings and vibrates with the screen off, and a live
// countdown in the shade while the phase runs. Both are Android's own work once handed over, so
// nothing of ours needs to be running when the bell is due.
//
// What it cannot do: hear about a timer started on another device while heirloom is closed here.
// There is no push service in v1; the phone rings for timers it has seen.

import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import { MOMENT_MS } from './notifier.ts';
import type { Notifier, Ring } from './notifier.ts';
import { AHEAD_DAYS, MAX_DUE, isReminderId, upcoming } from './reminders.ts';
import type { Reminder } from './reminders.ts';
import { bellOnDemand } from './sound.ts';
import { createWebNotifier, timer } from './web.ts';

/**
 * The bell's two ids. A new plan takes the old one's place on the same id, unless the old one's
 * time has come: then the new bell goes on the other id, so a bell Android delivers a little late
 * (deep Doze) still rings even though the break after it is already planned.
 */
export const RING_ID = 1;
const otherId = (id: number) => (id === RING_ID ? RING_ID + 1 : RING_ID);

/** The names of the channels in the phone's notification settings. The words come from the caller. */
export interface Channels {
  ring: string;
  countdown: string;
  /** Habit reminders. Until it is named, the phone schedules none. */
  remind?: string;
}

/** The countdown plugin in android/app (CountdownPlugin.java). */
export interface Countdown {
  show(options: { title: string; end: number; channel: string }): Promise<void>;
  clear(): Promise<void>;
}

export type Alarms = Pick<
  LocalNotificationsPlugin,
  | 'createChannel'
  | 'schedule'
  | 'cancel'
  | 'getPending'
  | 'removeDeliveredNotificationsById'
  | 'checkPermissions'
  | 'requestPermissions'
  | 'checkExactNotificationSetting'
>;

export interface PhoneEnv {
  alarms: Alarms;
  countdown: Countdown;
  now(): number;
  channels: Channels;
  /** Where a failed bridge call is reported. Nothing is thrown into the timer's effect. */
  warn(error: unknown): void;
  /** The bell in the page, for when Android may not ring: a web notifier whose bell sounds only in view. */
  page: Notifier;
  /** Runs `run` each time the app comes back to the foreground. */
  onResume(run: () => void): void;
}

export function createCapacitorNotifier({ alarms, countdown, now, channels, warn, page, onResume }: PhoneEnv): Notifier {
  // Anything but a plan's JSON, so the first plan always runs: an alarm left from the app's last
  // life must be cancelled when the timer it was for has since been stopped.
  let applied: string | undefined;
  let current: Ring | null = null;
  // The person's "ring here" for this phone. Off: no alarm, no countdown, no page bell.
  let here = true;
  // A phase that has already ended, or is ending now, rings nowhere.
  const pending = () => (here && current && current.at - now() >= MOMENT_MS ? current : null);
  // What Android actually holds, which is less than `applied` while permission is missing.
  let live = 'null';
  // The last bell handed to Android: its id and time. Undefined until the first plan, which clears
  // both ids, since an alarm from the app's last life may be waiting for a timer since stopped.
  let given: { id: number; at: number } | null | undefined;

  // Bridge calls are async and plans can come in a burst of sync messages. One at a time, in
  // order, so the last plan is the one left standing.
  let queue: Promise<unknown> = Promise.all([
    // Settings fixed at creation: Android keeps a channel's sound and importance once it exists, so
    // changing these means a new id. The bell is high importance so it shows on the lock screen and
    // makes its sound; the countdown is low so it never makes one.
    alarms.createChannel({ id: 'ring', name: channels.ring, importance: 4, visibility: 1, vibration: true }),
    alarms.createChannel({ id: 'countdown', name: channels.countdown, importance: 2, visibility: 1, vibration: false }),
    // Between the two: the default sound, no heads-up over whatever the person is doing.
    channels.remind && alarms.createChannel({ id: 'remind', name: channels.remind, importance: 3, visibility: 1, vibration: true }),
  ]).catch(warn);
  const run = (step: () => Promise<unknown>) => {
    queue = queue.then(step).catch(warn);
  };

  // Without both, the plugin would ask for them itself: the notification prompt, or the exact
  // alarm settings screen. A plan comes from a sync message as often as from a tap, so it never asks.
  const can = async () =>
    (await alarms.checkPermissions()).display === 'granted' &&
    (await alarms.checkExactNotificationSetting()).exact_alarm === 'granted';

  const apply = async (ring: Ring | null) => {
    // At the bell the timer stops running and plans null, a moment before Android may deliver the
    // alarm (in deep Doze it was late, and this cancel used to kill it). A bell whose time has come
    // is Android's from then on: it is left alone, and its id is reused two plans later, which also
    // clears it from the shade. Only switching "ring here" off still takes it back.
    let id = RING_ID;
    if (given === undefined) {
      await alarms.cancel({ notifications: [{ id: RING_ID }, { id: otherId(RING_ID) }] });
      given = null;
    } else if (given && (given.at - now() >= MOMENT_MS || !here)) {
      await alarms.cancel({ notifications: [{ id: given.id }] });
      id = given.id;
      given = null;
    } else if (given) id = otherId(given.id);
    live = 'null';
    if (!ring || !(await can())) {
      // Without permission Android rings nothing, so the page does, if it is on screen at the bell.
      // In the background there is nothing honest to do: no notification, and a page out of sight
      // cannot be counted on to run. allow() and coming back to the app try the alarm again.
      page.plan(ring);
      return countdown.clear();
    }
    // The notification's own sound is the bell; the page must not ring a second one.
    page.plan(null);
    // Whole ms: the native side reads the end as a long, and a fraction would read as nothing.
    const at = Math.round(ring.at);
    await alarms.schedule({
      notifications: [
        {
          id,
          title: ring.title,
          body: ring.body,
          channelId: 'ring',
          autoCancel: true,
          // allowWhileIdle is what makes the plugin use setExactAndAllowWhileIdle with RTC_WAKEUP.
          // Without it the alarm is a plain RTC one, which waits for the screen to come on.
          schedule: { at: new Date(at), allowWhileIdle: true },
        },
      ],
    });
    given = { id, at };
    live = JSON.stringify(ring);
    await (ring.during ? countdown.show({ title: ring.during, end: at, channel: 'countdown' }) : countdown.clear());
  };

  // Sets the pending bell if Android does not hold it yet, once the plans before this have run.
  const fill = () =>
    run(async () => {
      const planned = pending();
      if (JSON.stringify(planned) !== live) await apply(planned);
    });
  // Habit reminders: one-shots for the next fourteen days, rebuilt on every change and every time
  // the app is in front, so today's is left out once the habit is done. Exact alarms: as inexact
  // ones the Samsung delivered them at the very end of their window, up to an hour late. A few a
  // day are nothing beside the exact allowance. Without the exact permission the plugin falls back
  // to inexact by itself.
  let habits: Reminder[] = [];
  const remind = () =>
    run(async () => {
      const ok = here && !!channels.remind && (await alarms.checkPermissions()).display === 'granted';
      // From the start of today: a reminder whose time has passed today is still ours while the
      // habit is not done, whether Android has shown it yet or not. Yesterday's are not ours.
      const today = new Date(now()).setHours(0, 0, 0, 0);
      const want = ok ? upcoming(habits, now(), AHEAD_DAYS, MAX_DUE, today - 1) : [];
      // What Android holds, read back each time: a reminder from an earlier life of the app, or one
      // whose habit is gone, is found by its id range and cancelled.
      const held = new Map<number, string>();
      for (const n of (await alarms.getPending()).notifications) {
        const sig = (n.extra as { sig?: unknown } | undefined)?.sig;
        if (isReminderId(n.id) && typeof sig === 'string' && JSON.parse(sig)[1] >= today) held.set(n.id, sig);
      }
      const keep = new Set(want.filter((d) => held.get(d.id) === d.sig).map((d) => d.id));
      const stale = [...held.keys()].filter((id) => !keep.has(id));
      // Never one in the past: the plugin would show it at once.
      const fresh = want.filter((d) => !keep.has(d.id) && d.at > now());
      if (stale.length) {
        await alarms.cancel({ notifications: stale.map((id) => ({ id })) });
        // Cancel only stops what is still to come; one already shown leaves the shade this way.
        await alarms.removeDeliveredNotificationsById({ ids: stale });
      }
      if (fresh.length)
        await alarms.schedule({
          notifications: fresh.map((d) => ({
            id: d.id,
            title: d.title,
            body: d.body,
            channelId: 'remind',
            autoCancel: true,
            extra: { sig: d.sig },
            schedule: { at: new Date(d.at), allowWhileIdle: true },
          })),
        });
    });

  // Permission may have been given in Android's settings while the person was away; and days
  // further on come into the reminders' fourteen.
  onResume(() => {
    fill();
    remind();
  });

  const settle = () => {
    const planned = pending();
    const key = JSON.stringify(planned);
    if (key === applied) return;
    applied = key;
    run(() => apply(planned));
  };

  return {
    plan(ring) {
      current = ring;
      settle();
    },
    ringHere(on) {
      here = on;
      settle();
      remind();
    },
    reminders(set) {
      habits = set;
      remind();
    },
    // The phone's own alarm needs nothing from the account; a sign out stops the timer, which plans null.
    account() {},
    // The phone's alarm says its words itself, when it is planned.
    reword() {},
    async allow() {
      // main.tsx calls this as `void notifier.allow()`: a bridge failure is a no, not an unhandled rejection.
      const ok = await (async () =>
        (await alarms.requestPermissions()).display === 'granted' &&
        (await alarms.checkExactNotificationSetting()).exact_alarm === 'granted')().catch((error) => (warn(error), false));
      // The start that asked also planned its bell, likely while the prompt was up and nothing
      // could be scheduled.
      if (ok) {
        fill();
        remind();
      }
      return ok;
    },
  };
}

/**
 * The phone's "the app is in front again": Capacitor's 'resume', from the activity's onResume. It
 * fires on coming back from another app, from Android's settings, and on unlocking with heirloom on
 * top; only after a pause, so never at the first start. Nothing fires when the screen comes on over
 * the lock screen: the activity stays stopped behind it, and the page reports `visible` throughout,
 * so `visibilitychange` never fires on the phone at all (seen in the device run).
 */
export function whenResumed(app: { addListener(event: 'resume', run: () => void): unknown }): (run: () => void) => void {
  return (run) => void app.addListener('resume', run);
}

export const onFront = whenResumed(App);

/** The phone's notifier, on the real plugins. */
export function capacitorNotifier(channels: Channels): Notifier {
  // Only for a bell Android cannot give: Capacitor's WebView plays audio without a gesture.
  const bell = bellOnDemand(() => new AudioContext(), timer);
  return createCapacitorNotifier({
    alarms: LocalNotifications,
    countdown: registerPlugin<Countdown>('Countdown'),
    now: () => Date.now(),
    channels,
    warn: (error) => console.warn('heirloom: notifier', error),
    page: createWebNotifier({
      now: () => Date.now(),
      schedule: timer,
      hidden: () => document.hidden,
      onShow: onFront,
      // Out of sight, the page stays quiet: see apply.
      bell: () => document.hidden || bell(),
    }),
    // Permission may have been given in Android's settings: 'resume' fires on the way back.
    onResume: onFront,
  });
}

/**
 * The hardware back button. From Focus, the home screen, it leaves the app as Android does at the
 * root of any app: to the background, still alive, so its socket keeps the timer current a while
 * longer. Anywhere else it goes back through the hash history, and to Focus when there is none.
 */
export function backButton(): void {
  void App.addListener('backButton', ({ canGoBack }) => {
    if (['', '#', '#/', '#/focus'].includes(location.hash)) void App.minimizeApp();
    else if (canGoBack) history.back();
    else location.hash = '#/focus';
  });
}
