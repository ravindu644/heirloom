import { computed, effect, signal } from '@preact/signals-core';
import { render } from 'preact';
import { onFront, startPlatform } from './platform/index.ts';
import { isPaused } from './platform/notifier.ts';
import { serverChoice, startApp } from './sync/browser.ts';
import type { Focus } from './sync/focus.ts';
import { App, Elsewhere } from './ui/app.tsx';
import { FirstRun } from './ui/welcome.tsx';
import { planFor } from './plan.ts';
import { result, ring } from './ui/strings.ts';

const root = document.getElementById('app')!;

// The phone app (`make apk`) is another origin from its server and asks which one. In a browser
// the server is the page's own and nothing asks.
const APP = !!import.meta.env.VITE_APP;

// A bell that moves by less than this is the same bell: well inside the two seconds a bell may be late.
const STEADY_MS = 500;

async function start() {
  // A build may come with an address filled in; once one is kept, that is the one.
  const server = APP ? await serverChoice(import.meta.env.VITE_SERVER_URL || undefined) : undefined;
  // No server yet: nothing to start. Choosing one starts the app again on it.
  if (server && !server.address) return render(<FirstRun choice={server} />, root);
  const app = await startApp(server?.address ?? undefined);
  const { engine, focus, settings } = app;
  // The phone's WebView says it is visible right through screen off, so the browser's own
  // "visible again" never fires there. The platform knows when the app is really in front again:
  // reconnect then, and let everything that depends on the day look at the clock.
  // Whether the device lets a bell through at all. Looked at again whenever the app comes to
  // the front: the way to change it is in the device's own settings, outside the app.
  const ringBlocked = signal(false);
  let lookAtBell = () => {};
  onFront(() => {
    engine.wake();
    for (const part of [app.today, app.progress, app.habits]) part.wake();
    lookAtBell();
  });
  // The browser's notifier, or the phone's exact alarm and countdown when this is the phone app.
  // In a browser it also asks the server to push at a bell, for a tab that is closed or out of
  // sight, with the words to say: the server holds no copy of its own (protocol.md section 17).
  const laps = [1, 2, 3, 4];
  const notifier = await startPlatform(
    { ring: ring.bellChannel, countdown: ring.countdownChannel, remind: ring.remindChannel },
    {
      request: (path, body) => engine.request(path, body),
      remembered: () => engine.kept('push'),
      remember: (sent) => engine.keep('push', sent),
      // Asked for at each subscribe: the break lengths in them change in Settings, and with the task.
      words: () => {
        const breaks = focus.lengthsFor(focus.state.peek().task);
        return {
          lap: laps.map(() => ring.lapDone),
          take: laps.map((n) => result.take(n === 4 ? breaks.long_ms : breaks.short_ms)),
          next: laps.map(() => ring.lapNext),
          break: ring.breakOver,
        };
      },
    },
  );
  lookAtBell = () => void notifier.canRing().then((can) => (ringBlocked.value = !can));
  lookAtBell();
  // Asking is the moment it can turn to refused, so the answer is looked at straight after.
  const allow = () => void notifier.allow().then(lookAtBell);
  // "Ring here" is this device's own switch; and the notifier is told who is signed in, so a
  // sign out stops this browser being pushed to.
  effect(() => notifier.ringHere(settings.ringHere.value));
  effect(() => notifier.account(engine.account.value ? 'in' : 'out'));
  // A closed tab's bell is worded by the server from what it was last sent: send again when
  // the lengths change, in Settings or with the task the lap is on, or a push would say
  // "Take five" for a ten minute break.
  // Read as one string: the lengths are worked out from every task row, and a title typed in
  // a sheet must not send the words again at each letter.
  const breaks = computed(() => Object.values(focus.lengthsFor(focus.state.value.task)).join());
  effect(() => {
    void breaks.value;
    notifier.reword();
  });
  // A habit is reminded on this device at each of its times on the days it is planned: the first
  // time until the first check-in of the day, the second until the second, and so on. A task
  // with a time is reminded once, at that minute of its day, while it is open. The notifier
  // keeps what the phone holds equal to this one list.
  effect(() =>
    notifier.reminders([
      ...app.habits.list.value.flatMap((habit) =>
        habit.reminds.map((time, place) => ({ habit: `${habit.id}#${place}`, title: habit.title, body: ring.remindBody, time, days: habit.days, doneToday: habit.today.count > place })),
      ),
      ...app.today.timed.value.map((task) => ({ habit: task.id, title: task.title, body: ring.taskBody(task.time), time: task.time, days: 127, day: task.day, doneToday: false })),
    ]),
  );

  // A lap still running from before midnight is none of today's laps.
  const day = (at: number) => new Date(at).toDateString();
  const begunToday = (started: number | null) => started === null || day(started - (engine.now() - Date.now())) === day(Date.now());
  let held = { bell: '', at: 0 };
  // The ring is planned whenever the timer changes, on any device, and whenever the line beside
  // the countdown would read differently: the task's title, its laps, its estimate. What is
  // planned is worked out in plan.ts.
  effect(() => {
    const state = focus.state.value;
    // Also when the connection comes or goes: a welcome is when the device learns how far its
    // own clock is from the server's, and an alarm planned before that would ring that far off.
    void engine.sync.value;
    const on = state.phase !== 'work' ? undefined : [...app.today.list.value, ...app.today.upcoming.value].find((task) => task.id === state.task);
    // The timer counts in server time and the notifier in this device's own.
    const view = focus.view();
    // The lap in progress is one more than today's, unless it has rung and runs on: then it is already among them.
    const fig = app.today.figures();
    const plan = planFor({ state, view, on, today: begunToday(state.started) ? fig.laps + (fig.open === null ? 0 : 1) : 0, lengths: focus.lengthsFor(state.task), ahead: engine.now() - Date.now() });
    // The distance to the server's clock is smoothed at every ping, so the same bell works out
    // a few ms apart from one run of this to the next. An alarm is not set again for that.
    if (plan && !isPaused(plan)) {
      const bell = `${state.run} ${view.ends_at}`;
      if (held.bell === bell && Math.abs(plan.at - held.at) < STEADY_MS) plan.at = held.at;
      else held = { bell, at: plan.at };
    }
    notifier.plan(plan);
  });
  // The countdown's buttons do what the same buttons on Focus do: this page stays the one
  // writer of the timer, and a tap made while the app was away is done when it is back.
  // A button of a notification left over from an earlier run does nothing.
  notifier.onAction((act, run) => {
    if (run !== focus.state.peek().run) return;
    if (act === 'pause') focus.pause();
    else if (act === 'resume') focus.resume();
    else focus.stop();
  });

  // Permission to notify is asked for at the first start, from the tap, when it is plain what
  // it is for. Nowhere earlier: a prompt on the sign-in screen would be a stranger asking.
  const asking: Focus = {
    ...focus,
    start: (task) => (allow(), focus.start(task)),
    skipBreak: (task) => (allow(), focus.skipBreak(task)),
  };

  // Someone who only keeps habits never starts a lap, so the tap that sets a reminder asks too.
  // The phone app's WebView is not trusted to save a file; Settings sends that to the browser.
  render(<App {...app} focus={asking} onReminderSet={allow} canSave={!APP} server={server} ringBlocked={ringBlocked} />, root);
}

// The built app in a browser keeps itself for a time with no connection (vite.config.ts writes
// the worker). Not under `make dev`, and not in the phone app, which carries its own files.
if (import.meta.env.PROD && !APP && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}

// One tab at a time. Two tabs of one browser share the device id and the database, and would
// each stamp edits from their own copy of the clock. The first tab holds this lock for as long
// as it lives; a second shows where heirloom is and takes over when the first closes.
// Without the Locks API (plain http on a LAN address) there is no way to tell, so it just starts.
if (navigator.locks) {
  void navigator.locks.request('heirloom', { ifAvailable: true }, (lock) => {
    if (lock) return start().then(() => new Promise<never>(() => {}));
    render(<Elsewhere />, root);
    return navigator.locks.request('heirloom', () => location.reload());
  });
} else {
  void start();
}
