import './old-browsers.ts';
import { computed, effect, signal, untracked } from '@preact/signals-core';
import { render } from 'preact';
import { onFront, setNight, startPlatform } from './platform/index.ts';
import { heldTaps, isPaused } from './platform/notifier.ts';
import { serverChoice, startApp } from './sync/browser.ts';
import type { Focus } from './sync/focus.ts';
import { App, Elsewhere } from './ui/app.tsx';
import { FirstRun } from './ui/welcome.tsx';
import { planFor } from './plan.ts';
import { clock, result, ring, room } from './ui/strings.ts';
import { applyTheme, keptTheme } from './ui/theme.ts';

const root = document.getElementById('app')!;
// The theme this device picked, before anything is drawn: a reload or a cold start never shows the
// other one for a frame while the engine loads. The engine's kept choice takes over once it is up.
applyTheme(keptTheme());
setNight(keptTheme());

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
  // The phone app: whether Android may stop heirloom in the background. Settings offers the way out,
  // and the answer changes only in Android's own screen, so it is looked at on the way back.
  const mayStop = signal(false);
  let lookAtBackground = () => {};
  onFront(() => {
    engine.wake();
    for (const part of [app.today, app.progress, app.habits]) part.wake();
    lookAtBell();
    lookAtBackground();
  });
  // The browser's notifier, or the phone's exact alarm and countdown when this is the phone app.
  // In a browser it also asks the server to push at a bell, for a tab that is closed or out of
  // sight, with the words to say: the server holds no copy of its own (protocol.md section 17).
  const laps = [1, 2, 3, 4];
  // The bell's words by the lap's place in its set, for a bell rung where this page is not: a
  // closed tab's push, or the phone's background service.
  const bellWords = () => {
    const breaks = focus.lengthsFor(focus.state.peek().task);
    return {
      lap: laps.map(() => ring.lapDone),
      take: laps.map((n) => result.take(n === 4 ? breaks.long_ms : breaks.short_ms)),
      next: laps.map(() => ring.lapNext),
      break: ring.breakOver,
    };
  };
  // The bell's first answer by the lap's place in its set: the fourth earns the long break.
  const answerBreaks = () => {
    const breaks = focus.lengthsFor(focus.state.peek().task);
    return laps.map((n) => ring.answerBreak(n === 4 ? breaks.long_ms : breaks.short_ms));
  };
  const notifier = await startPlatform(
    { countdown: ring.countdownChannel, remind: ring.remindChannel },
    {
      request: (path, body) => engine.request(path, body),
      remembered: () => engine.kept('push'),
      remember: (sent) => engine.keep('push', sent),
      // Asked for at each subscribe: the break lengths in them change in Settings, and with the task.
      words: bellWords,
    },
  );
  lookAtBell = () => void notifier.canRing().then((can) => (ringBlocked.value = !can));
  lookAtBell();
  lookAtBackground = () => void notifier.background().then((b) => (mayStop.value = !b.unrestricted));
  lookAtBackground();
  // Asking is the moment it can turn to refused, so the answer is looked at straight after.
  const allow = () => void notifier.allow().then(lookAtBell);
  // "Ring here" is this device's own switch; and the notifier is told who is signed in, so a
  // sign out stops this browser being pushed to.
  effect(() => notifier.ringHere(settings.ringHere.value));
  // The page, the browser's bar and, in the phone app, Android's own night mode and status bar.
  effect(() => {
    const theme = settings.theme.value;
    applyTheme(theme);
    setNight(theme);
  });
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
  // The phone's background service keeps step as this device, with the words it says things in
  // while the page is not there (ARCHITECTURE section 6). Sent again when any of it changes; a
  // sign-out sends null, which stops it and wipes what it held.
  effect(() => {
    const link = engine.link.value;
    const on = settings.keepInStep.value && settings.ringHere.value;
    const ringing = { sound: settings.all.value.sound, vibrate: settings.vibrate.value, silent: settings.ringOnSilent.value };
    void breaks.value;
    notifier.keep(
      link && {
        ...link,
        cursor: engine.cursor(),
        on,
        ringing,
        auto: { break: settings.all.value.auto_break, work: settings.all.value.auto_work },
        words: {
          bell: bellWords(),
          during: { work: ring.lapElsewhere, short: ring.breakRunning(false), long: ring.breakRunning(true) },
          actions: { pause: ring.pause, resume: ring.resume, stop: ring.stop, done: ring.breakStop },
          answer: { break: answerBreaks(), next: ring.startNext, rest: ring.breakStop },
          // The service fills in the time left, as the clock reads it.
          left: ring.paused(0).replace(clock(0), '{t}'),
          note: { title: ring.noteTitle, body: ring.noteBody },
          call: { title: ring.calledTitle, body: ring.calledBody, in: room.imIn, out: room.imOut, youre: ring.youreIn, unreached: ring.unreached },
          starts: { title: ring.callTitle, body: ring.callBody('{room}'), with: ring.callBody('{room}', '{name}') },
          keeping: ring.keeping,
          channels: { keep: ring.keepChannel, rooms: ring.roomsChannel, bell: ring.bellChannel },
        },
      },
    );
  });
  // A habit is reminded on this device at each of its times on the days it is planned: the first
  // time until the first check-in of the day, the second until the second, and so on. A task
  // with a time is reminded once, at that minute of its day, while it is open. The notifier
  // keeps what the phone holds equal to this one list.
  effect(() =>
    notifier.reminders([
      ...app.habits.list.value.flatMap((habit) =>
        habit.reminds.map((time, place) => ({ habit: `${habit.id}#${place}`, title: habit.title, body: ring.remindBody, time, days: habit.days, doneToday: habit.today.rounds[place]?.checkin != null })),
      ),
      ...app.today.timed.value.map((task) => ({ habit: task.id, title: task.title, body: ring.taskBody(task.time), time: task.time, days: 127, day: task.day, doneToday: false })),
    ]),
  );

  let held = { bell: '', at: 0 };
  // The ring is planned whenever the timer changes, on any device, and whenever the line beside
  // the countdown would read differently: the task's title, its laps, its estimate. What is
  // planned is worked out in plan.ts.
  effect(() => {
    const state = focus.state.value;
    // The cell's stamp goes with it: the phone keeps the newer of this and what its service hears.
    const stamp = focus.stamp.value;
    // Also when the connection comes or goes: a welcome is when the device learns how far its
    // own clock is from the server's, and an alarm planned before that would ring that far off.
    void engine.sync.value;
    const on = state.phase !== 'work' ? undefined : [...app.today.list.value, ...app.today.upcoming.value].find((task) => task.id === state.task);
    // The timer counts in server time and the notifier in this device's own.
    const view = focus.view();
    // The lap in progress is one more than today's, unless it has rung and runs on: then it is
    // already among them. Begun before midnight it is still today's, the day it will end on; one
    // that rang before midnight and runs on is yesterday's, and still a lap, never the 0th.
    const fig = app.today.figures();
    const plan = planFor({ state, view, on, today: Math.max(1, fig.laps + (fig.open === null ? 0 : 1)), lengths: focus.lengthsFor(state.task), ahead: engine.now() - Date.now() });
    // The distance to the server's clock is smoothed at every ping, so the same bell works out
    // a few ms apart from one run of this to the next. An alarm is not set again for that.
    if (plan && !isPaused(plan)) {
      // The bell's answers (DESIGN.md): the break this lap earned or the next lap, and done for now.
      // With an automatic start the next phase begins by itself at the bell: only "Done for now",
      // which stops it (heldTaps matches the run that follows).
      const lengths = focus.lengthsFor(state.task);
      const set = settings.all.value;
      const auto = state.phase === 'work' ? set.auto_break : state.phase === 'short' && set.auto_work;
      const first = state.phase === 'work' ? { act: 'break' as const, label: ring.answerBreak(view.next.phase === 'long' ? lengths.long_ms : lengths.short_ms) } : { act: 'next' as const, label: ring.startNext };
      plan.answers = [...(auto ? [] : [first]), { act: 'rest', label: ring.breakStop }];
      const bell = `${state.run} ${view.ends_at}`;
      if (held.bell === bell && Math.abs(plan.at - held.at) < STEADY_MS) plan.at = held.at;
      else held = { bell, at: plan.at };
    }
    notifier.plan(plan, { stamp, state });
  });
  // A called lap you are in rings at its minute, on the phone too (protocol section 15, Start
  // together): the soonest one, in this device's time. The lap itself is started by sync.
  effect(() => {
    const next = app.rooms.calledIn.value[0];
    const me = engine.account.value?.username;
    notifier.call(next ? { id: next.call, room: next.room, at: next.at - (engine.now() - Date.now()), title: ring.callTitle, body: ring.callBody(next.name, next.by === me ? undefined : next.by) } : null);
  });

  // Each room message as it is heard, so the phone takes off a called lap's notification and alarm
  // once the call is taken back or over, whichever feeder heard it first.
  engine.onRoom((msg) => msg.type === 'room' && notifier.room(msg));

  // The countdown's buttons do what the same buttons on Focus do: this page stays the one
  // writer of the timer, and a tap made while the app was away is done when it is back.
  // A tap on a countdown the phone's service drew while the app was closed may be for a run this
  // page has not heard of yet: it waits until the page has caught up (platform/notifier.ts).
  const taps = heldTaps(
    () => focus.state.peek().run,
    () => engine.sync.peek() === 'in-step',
    // The bell's answers do what Focus's buttons at the bell do: the break it earned, the next lap
    // on Today's next task, or done for now.
    (act) => {
      if (act === 'pause') focus.pause();
      else if (act === 'resume') focus.resume();
      else if (act === 'break') focus.start();
      else if (act === 'next') focus.start(app.today.next.peek()?.id ?? null);
      else focus.stop();
    },
  );
  notifier.onAction(taps.tap);
  effect(() => {
    void focus.state.value;
    void engine.sync.value;
    // The act writes the timer, which this effect reads: done outside it.
    untracked(taps.look);
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
  render(<App {...app} focus={asking} onReminderSet={allow} canSave={!APP} server={server} ringBlocked={ringBlocked} mayStop={mayStop} letRun={() => notifier.askUnrestricted()} preview={(sound) => notifier.preview(sound)} />, root);
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
