import { effect } from '@preact/signals-core';
import { render } from 'preact';
import { startPlatform } from './platform/index.ts';
import { startApp } from './sync/browser.ts';
import type { Focus } from './sync/focus.ts';
import { App, Elsewhere } from './ui/app.tsx';
import { result, ring } from './ui/strings.ts';

const root = document.getElementById('app')!;

async function start() {
  // The phone app is another origin, built knowing its server. In a browser the server is the page's own.
  const { engine, focus } = await startApp(import.meta.env.VITE_SERVER_URL || undefined);
  // The browser's notifier, or the phone's exact alarm and countdown when this is the phone app.
  const notifier = await startPlatform({ ring: ring.bellChannel, countdown: ring.countdownChannel });

  // The ring is planned whenever the timer changes, on any device. The timer counts in server
  // time and the notifier in this device's own, so the end is moved across by the difference.
  effect(() => {
    const state = focus.state.value;
    const lengths = focus.lengths.value;
    const view = focus.view();
    if (state.phase === 'idle' || view.ends_at === null) return notifier.plan(null);
    const at = view.ends_at - (engine.now() - Date.now());
    const lap = state.set_index + 1;
    notifier.plan(
      state.phase === 'work'
        ? { at, title: ring.lapDone(lap), body: result.take(lap === 4 ? lengths.long_ms : lengths.short_ms), during: ring.lapRunning(lap) }
        : { at, title: ring.breakOver, body: ring.lapNext(view.next.set_index + 1), during: ring.breakRunning(state.phase === 'long') },
    );
  });

  // Permission to notify is asked for at the first start, from the tap, when it is plain what
  // it is for. Nowhere earlier: a prompt on the sign-in screen would be a stranger asking.
  const asking: Focus = {
    ...focus,
    start: (task) => (void notifier.allow(), focus.start(task)),
    skipBreak: (task) => (void notifier.allow(), focus.skipBreak(task)),
  };

  render(<App engine={engine} focus={asking} />, root);
}

// The built app in a browser keeps itself for a time with no connection (vite.config.ts writes
// the worker). Not under `make dev`, and not in the phone app, which carries its own files.
if (import.meta.env.PROD && !import.meta.env.VITE_SERVER_URL && 'serviceWorker' in navigator) {
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
