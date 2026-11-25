import { effect, signal } from '@preact/signals-core';
import { render } from 'preact';
import { onFront, startPlatform } from './platform/index.ts';
import { serverChoice, startApp } from './sync/browser.ts';
import type { Focus } from './sync/focus.ts';
import { App, Elsewhere } from './ui/app.tsx';
import { FirstRun } from './ui/welcome.tsx';
import { result, ring } from './ui/strings.ts';

const root = document.getElementById('app')!;

// The phone app (`make apk`) is another origin from its server and asks which one. In a browser
// the server is the page's own and nothing asks.
const APP = !!import.meta.env.VITE_APP;

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
      // Asked for at each subscribe: the break lengths in them change in Settings.
      words: () => {
        const breaks = focus.lengths.peek();
        return {
          lap: laps.map(ring.lapDone),
          take: laps.map((n) => result.take(n === 4 ? breaks.long_ms : breaks.short_ms)),
          next: laps.map(ring.lapNext),
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
  // the lengths change, or a push would say "Take five" for a ten minute break.
  effect(() => {
    void focus.lengths.value;
    notifier.reword();
  });
  // A habit with a reminder time is reminded on this device on the days it is planned, until it
  // is checked in. A task with a time is reminded once, at that minute of its day, while it is
  // open. The notifier keeps what the phone holds equal to this one list.
  effect(() =>
    notifier.reminders([
      ...app.habits.list.value
        .filter((habit) => habit.remind)
        .map((habit) => ({ habit: habit.id, title: habit.title, body: ring.remindBody, time: habit.remind!, days: habit.days, doneToday: habit.today.done })),
      ...app.today.timed.value.map((task) => ({ habit: task.id, title: task.title, body: ring.taskBody(task.time), time: task.time, days: 127, day: task.day, doneToday: false })),
    ]),
  );

  // The ring is planned whenever the timer changes, on any device. The timer counts in server
  // time and the notifier in this device's own, so the end is moved across by the difference.
  effect(() => {
    const state = focus.state.value;
    const lengths = focus.lengths.value;
    // Also when the connection comes or goes: a welcome is when the device learns how far its
    // own clock is from the server's, and an alarm planned before that would ring that far off.
    void engine.sync.value;
    const view = focus.view();
    if (state.phase === 'idle' || view.ends_at === null) return notifier.plan(null);
    const at = view.ends_at - (engine.now() - Date.now());
    // The server names a bell by its run and its end in server time; the same pair lets the page
    // know a push it hears of is for the bell it has planned.
    const push = state.run === null ? undefined : { run: state.run, at: view.ends_at };
    const lap = state.set_index + 1;
    notifier.plan(
      state.phase === 'work'
        ? { at, title: ring.lapDone(lap), body: result.take(lap === 4 ? lengths.long_ms : lengths.short_ms), during: ring.lapRunning(lap), push }
        : { at, title: ring.breakOver, body: ring.lapNext(view.next.set_index + 1), during: ring.breakRunning(state.phase === 'long'), push },
    );
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
