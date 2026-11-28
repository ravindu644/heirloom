// The phone's Notifier. The bell, the countdown and a called lap are drawn by the native side
// (android/.../Shade.java), which the background service feeds too: this hands it the timer as
// the page knows it, with its words, and Android does the rest with the screen off. Reminders, a
// habit's and a task's, stay with the notifications plugin.

import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { LocalNotificationsPlugin } from '@capacitor/local-notifications';
import type { TimerState } from '../core/timer.ts';
import type { Theme } from '../sync/settings.ts';
import { MOMENT_MS, isPaused } from './notifier.ts';
import type { Act, Call, Keep, Notifier, Paused, Ring, Timer } from './notifier.ts';
import { AHEAD_DAYS, MAX_DUE, isReminderId, upcoming } from './reminders.ts';
import type { Reminder } from './reminders.ts';
import { bellOnDemand } from './sound.ts';
import { createWebNotifier, timer } from './web.ts';

/** The ids the notifications plugin held the bell (two, in turn) and a called lap under, before the native side drew them. */
export const OLD_IDS = [1, 2, 7402];

/** The names of the channels in the phone's notification settings. The words come from the caller. */
export interface Channels {
  countdown: string;
  /** Reminders, a habit's and a task's. Until it is named, the phone schedules none. */
  remind?: string;
}

/** The Countdown plugin in android/app (CountdownPlugin.java): the page's way to the native drawer. ARCHITECTURE section 6. */
export interface Countdown {
  /** Answers whether Android will ring it: false with notifications or exact alarms refused. */
  /** `off`: Ring here is off, so even a bell already due is taken back. */
  plan(options: { stamp: string | null; state: TimerState | null; ring: Ring | Paused | null; off: boolean }): Promise<{ rings: boolean }>;
  call(options: Call | null): Promise<void>;
  keep(options: Keep | null): Promise<void>;
  background(): Promise<{ unrestricted: boolean }>;
  askUnrestricted(): Promise<void>;
  /** A room message the page heard live: Shade.ended. */
  room(options: { type: 'room'; room: string }): Promise<void>;
  /** One bell from Settings, played by the phone as a notification sounds. */
  preview(options: { sound: string }): Promise<void>;
  /** A tap on a button, from ActionActivity. One made while the app was away arrives when this is called. */
  addListener(event: 'action', heard: (data: { act: string; run?: string | null }) => void): Promise<unknown>;
}

const ACTS: readonly string[] = ['pause', 'resume', 'stop', 'break', 'next', 'rest'] satisfies Act[];

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
  /** True the first time this build starts: the old build's alarms with the notifications plugin are cancelled, once. */
  moved: boolean;
}

export function createCapacitorNotifier({ alarms, countdown, now, channels, warn, page, onResume, moved }: PhoneEnv): Notifier {
  let current: Ring | Paused | null = null;
  let timer: Timer | undefined;
  // The person's "ring here" for this phone. Off: no alarm, no countdown, no page bell.
  let here = true;
  // Undefined until the first plan, so the first always goes through.
  let applied: string | undefined;

  // Bridge calls are async and plans can come in a burst of sync messages. One at a time, in
  // order, so the last plan is the one left standing.
  let queue: Promise<unknown> = Promise.all([
    // Settings fixed at creation: Android keeps a channel's sound and importance once it exists, so
    // changing these means a new id. The countdown is low so it never makes a sound; the native side
    // posts on it. The bell's channel is the native side's own (Shade.channels): it plays the bell itself.
    alarms.createChannel({ id: 'countdown', name: channels.countdown, importance: 2, visibility: 1, vibration: false }),
    // Between the two: the default sound, no heads-up over whatever the person is doing. Creating a
    // channel that exists already updates its name (Android's createNotificationChannel), so a
    // renamed channel reaches phones that have the old name at the next start.
    channels.remind && alarms.createChannel({ id: 'remind', name: channels.remind, importance: 3, visibility: 1, vibration: true }),
    // The bell and the call the old build left with the notifications plugin would ring beside the
    // native ones, for a timer perhaps stopped since. Before anything native is planned.
    moved && alarms.cancel({ notifications: OLD_IDS.map((id) => ({ id })) }),
  ]).catch(warn);
  const run = (step: () => Promise<unknown>) => {
    queue = queue.then(step).catch(warn);
  };

  // Sends the plan as it stands. The native side keeps the newer timer of this and its service's.
  const send = () => {
    const ring = here ? current : null;
    const sent = { stamp: timer?.stamp ?? null, state: timer?.state ?? null, ring: ring && !isPaused(ring) ? { ...ring, at: Math.round(ring.at) } : ring, off: !here };
    run(async () => {
      // A bridge that fails rings nothing: the page does.
      const rings = await countdown.plan(sent).then(
        (answer) => answer.rings,
        (error) => (warn(error), false),
      );
      // Android cannot ring it: the page does, if it is on screen at the bell. In the background
      // there is nothing honest to do; allow() and coming back to the app try Android again.
      page.plan(rings || !ring || isPaused(ring) || ring.at - now() < MOMENT_MS ? null : ring);
    });
  };
  const settle = () => {
    const key = JSON.stringify([here && current, timer]);
    if (key === applied) return;
    applied = key;
    send();
  };

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

  // A called lap you are in (protocol.md section 15): the native side sets its alarm. Undefined
  // until main first says, so nothing is touched before it knows the rooms.
  let call: Call | null | undefined;
  let called: string | undefined;
  const callNow = (again = false) => {
    if (call === undefined) return;
    const next = here && call ? { ...call, at: Math.round(call.at) } : null;
    const key = JSON.stringify(next);
    if (key === called && !again) return;
    called = key;
    run(() => countdown.call(next));
  };

  // What the background service needs. Sent again only when it differs; a send may wipe the
  // native side (a new account), so the plan and the call go again after it.
  let kept: string | undefined;

  // Permission may have been given in Android's settings while the person was away; and days
  // further on come into the reminders' fourteen.
  onResume(() => {
    send();
    remind();
    callNow(true);
  });

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
    plan(ring, cell) {
      current = ring;
      timer = cell;
      settle();
    },
    ringHere(on) {
      here = on;
      settle();
      remind();
      callNow();
    },
    keep(link) {
      const key = JSON.stringify(link && { ...link, cursor: 0 });
      if (key === kept) return;
      kept = key;
      run(() => countdown.keep(link));
      send();
      callNow(true);
    },
    async background() {
      try {
        return await countdown.background();
      } catch (error) {
        warn(error);
        return { unrestricted: true };
      }
    },
    askUnrestricted() {
      run(() => countdown.askUnrestricted());
    },
    room(msg) {
      run(() => countdown.room(msg));
    },
    preview(sound) {
      void countdown.preview({ sound }).catch(warn);
    },
    reminders(set) {
      habits = set;
      remind();
    },
    call(next) {
      call = next;
      callNow();
    },
    // The account reaches the native side through keep().
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
        send();
        remind();
        callNow(true);
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

// The page's own calls to the plugin, beside the Notifier's. Registered once: Capacitor warns on a second.
interface CountdownPlugin extends Countdown {
  addListener(event: 'action', heard: (data: { act: string; run?: string | null }) => void): Promise<unknown>;
  addListener(event: 'open', heard: () => void): Promise<unknown>;
  night(options: { theme: Theme }): Promise<void>;
}
let registered: CountdownPlugin | undefined;
const plugin = (): CountdownPlugin => (registered ??= registerPlugin<CountdownPlugin>('Countdown'));

let told: Theme | undefined;
/** Settings' "Light or dark" for the native parts: the bars' icons and the activity (MainActivity.night). */
export function setNight(theme: Theme): void {
  if (theme === told) return;
  told = theme;
  plugin().night({ theme }).catch((error: unknown) => {
    // An older app without the method: the bars follow the system, as before.
    told = undefined;
    console.warn('heirloom: night', error);
  });
}

/** The phone's notifier, on the real plugins. */
export function capacitorNotifier(channels: Channels): Notifier {
  // Only for a bell Android cannot give: Capacitor's WebView plays audio without a gesture.
  const bell = bellOnDemand(() => new AudioContext(), timer);
  const countdown = plugin();
  // A room's note or call in the shade opens the Room.
  void countdown.addListener('open', () => (location.hash = '#/room'));
  return createCapacitorNotifier({
    alarms: LocalNotifications,
    countdown,
    moved: once('heirloom.native-drawer'),
    now: () => Date.now(),
    channels,
    warn: (error) => console.warn('heirloom: notifier', error),
    page: createWebNotifier({
      now: () => Date.now(),
      schedule: timer,
      hidden: () => document.hidden,
      onShow: onFront,
      // Out of sight, the page stays quiet: see send.
      bell: () => document.hidden || bell(),
    }),
    // Permission may have been given in Android's settings: 'resume' fires on the way back.
    onResume: onFront,
  });
}

// True the first time it is asked on this install, and never again. Storage that cannot be read
// says true every start: cancelling ids nothing holds is harmless.
function once(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
  } catch {
    // Nothing kept: asked again next start.
  }
  return true;
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
