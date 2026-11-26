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
import { MOMENT_MS, isPaused } from './notifier.ts';
import type { Act, Actions, Call, Notifier, Paused, Ring } from './notifier.ts';
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
/** A called lap's notification: one at a time, beside the countdown's 7400 and 7401. */
export const CALL_ID = 7402;

/** The names of the channels in the phone's notification settings. The words come from the caller. */
export interface Channels {
  ring: string;
  countdown: string;
  /** Reminders, a habit's and a task's. Until it is named, the phone schedules none. */
  remind?: string;
}

/** One button on the countdown, and the run it acts on. */
export interface Button {
  act: Act;
  label: string;
  run: string | null;
}

/** The countdown plugin in android/app (CountdownPlugin.java). With `end` it counts down; without, it shows `text` standing still. */
export interface Countdown {
  show(options: { title: string; channel: string; end?: number; text?: string; actions?: Button[] }): Promise<void>;
  clear(): Promise<void>;
  /** A tap on a button, from ActionActivity. One made while the app was away arrives when this is called. */
  addListener(event: 'action', heard: (data: { act: string; run?: string | null }) => void): Promise<unknown>;
}

const ACTS: readonly string[] = ['pause', 'resume', 'stop'] satisfies Act[];
const buttons = (actions: Actions | undefined, acts: Act[]) => (actions ? { actions: acts.map((act) => ({ act, label: actions[act], run: actions.run })) } : {});

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
  let current: Ring | Paused | null = null;
  // The person's "ring here" for this phone. Off: no alarm, no countdown, no page bell.
  let here = true;
  // A phase that has already ended, or is ending now, rings nowhere. A paused one rings nowhere
  // either, but keeps its still notification.
  const pending = () => (!here || !current ? null : isPaused(current) || current.at - now() >= MOMENT_MS ? current : null);
  // What Android actually holds, which is less than `applied` while permission is missing.
  let live = 'null';
  // The last bell handed to Android: its id and time. Undefined until the first plan, which clears
  // both ids, since an alarm from the app's last life may be waiting for a timer since stopped.
  let given: { id: number; at: number; words: string } | null | undefined;
  const words = (ring: Ring) => JSON.stringify([ring.title, ring.body]);

  // Bridge calls are async and plans can come in a burst of sync messages. One at a time, in
  // order, so the last plan is the one left standing.
  let queue: Promise<unknown> = Promise.all([
    // Settings fixed at creation: Android keeps a channel's sound and importance once it exists, so
    // changing these means a new id. The bell is high importance so it shows on the lock screen and
    // makes its sound; the countdown is low so it never makes one.
    alarms.createChannel({ id: 'ring', name: channels.ring, importance: 4, visibility: 1, vibration: true }),
    alarms.createChannel({ id: 'countdown', name: channels.countdown, importance: 2, visibility: 1, vibration: false }),
    // Between the two: the default sound, no heads-up over whatever the person is doing. Creating a
    // channel that exists already updates its name (Android's createNotificationChannel), so a
    // renamed channel reaches phones that have the old name at the next start.
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

  const countdownFor = (ring: Ring, at: number) =>
    ring.during ? countdown.show({ title: ring.during, end: at, channel: 'countdown', ...buttons(ring.actions, ['pause', 'stop']) }) : countdown.clear();

  const apply = async (next: Ring | Paused | null) => {
    const ring = next && !isPaused(next) ? next : null;
    // The same bell with other words for the countdown (the task's line changed): the alarm is left
    // exactly as it is, and the countdown, silent on its own channel, is drawn again.
    if (ring && given && given.at === Math.round(ring.at) && given.words === words(ring) && given.at - now() >= MOMENT_MS) {
      live = JSON.stringify(ring);
      return countdownFor(ring, given.at);
    }
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
    if (isPaused(next)) {
      // Standing still: no bell, and a notification to resume from.
      page.plan(null);
      live = JSON.stringify(next);
      return countdown.show({ title: next.during, text: next.left, channel: 'countdown', ...buttons(next.actions, ['resume', 'stop']) });
    }
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
    given = { id, at, words: words(ring) };
    live = JSON.stringify(ring);
    await countdownFor(ring, at);
  };

  // Sets the pending bell if Android does not hold it yet, once the plans before this have run.
  const fill = () =>
    run(async () => {
      const planned = pending();
      if (JSON.stringify(planned) !== live) await apply(planned);
    });
  // Reminders, a habit's and a task's: one-shots for the next fourteen days, rebuilt on every change
  // and every time the app is in front, so today's is left out once the habit is done, and a task
  // done or deleted, which leaves the set, loses its alarm and leaves the shade. Exact alarms: as inexact
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

  // A called lap (protocol.md section 15): an exact alarm at its minute, on the reminders' channel
  // and path. Its tap opens the app, which starts the lap if this device is idle.
  // Undefined until main first says, so nothing is touched before it knows the rooms.
  let call: Call | null | undefined;
  // What Android was handed: the call's words and time, or null. Undefined until the first look,
  // which clears one left from the app's last life.
  let callGiven: { key: string; at: number } | null | undefined;
  const callNow = () =>
    run(async () => {
      if (call === undefined) return;
      let c = here && call && channels.remind && (await alarms.checkPermissions()).display === 'granted' ? call : null;
      const at = c && Math.round(c.at);
      // Its minute has come: Android has shown it, and a room message a moment later must not take
      // it out of the shade. One never handed over is not shown late.
      if (c && at! <= now()) {
        if (callGiven?.at === at) return;
        c = null;
      }
      // Nothing wanted after the held call's minute (the call is over, a minute on): it is Android's
      // and the person's now, so it is forgotten and left in the shade. Only one taken back before
      // its minute is taken off.
      if (!c && callGiven && callGiven.at <= now()) {
        callGiven = null;
        return;
      }
      const key = JSON.stringify(c && [at, c.title, c.body]);
      if (callGiven !== undefined && key === (callGiven?.key ?? 'null')) return;
      await alarms.cancel({ notifications: [{ id: CALL_ID }] });
      if (!c) await alarms.removeDeliveredNotificationsById({ ids: [CALL_ID] });
      else
        await alarms.schedule({
          notifications: [{ id: CALL_ID, title: c.title, body: c.body, channelId: 'remind', autoCancel: true, schedule: { at: new Date(at!), allowWhileIdle: true } }],
        });
      callGiven = c && { key, at: at! };
    });

  // Permission may have been given in Android's settings while the person was away; and days
  // further on come into the reminders' fourteen.
  onResume(() => {
    fill();
    remind();
    callNow();
  });

  const settle = () => {
    const planned = pending();
    const key = JSON.stringify(planned);
    if (key === applied) return;
    applied = key;
    run(() => apply(planned));
  };

  // A tap on the countdown's buttons reaches the page's own code, the one writer of the timer. A tap
  // that comes in before main.tsx listens (it opened the app) waits here for it.
  let hear: ((act: Act, run: string | null) => void) | undefined;
  const waiting: [Act, string | null][] = [];
  void countdown
    .addListener('action', ({ act, run = null }) => {
      if (!ACTS.includes(act)) return;
      if (hear) hear(act as Act, run);
      else waiting.push([act as Act, run]);
    })
    .catch(warn);

  return {
    onAction(heard) {
      hear = heard;
      for (const [act, run] of waiting.splice(0)) heard(act, run);
    },
    plan(ring) {
      current = ring;
      settle();
    },
    ringHere(on) {
      here = on;
      settle();
      remind();
      callNow();
    },
    reminders(set) {
      habits = set;
      remind();
    },
    call(next) {
      call = next;
      callNow();
    },
    // The phone's own alarm needs nothing from the account; a sign out stops the timer, which plans null.
    account() {},
    // The phone's alarm says its words itself, when it is planned.
    reword() {},
    async canRing() {
      // Refused is denied, never prompt: notifications switched off (Android 13 and later ask; before
      // that the person turns them off in settings), or exact alarms not allowed, which only Android
      // 12 can do (USE_EXACT_ALARM covers 13 and later). A bridge that fails is not a refusal.
      try {
        return (
          (await alarms.checkPermissions()).display !== 'denied' &&
          (await alarms.checkExactNotificationSetting()).exact_alarm !== 'denied'
        );
      } catch (error) {
        warn(error);
        return true;
      }
    },
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
        callNow();
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
