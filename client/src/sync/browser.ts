// The browser's side of everything the engine is handed. The only file under sync/ that touches
// a global, so the engine itself runs in Node unchanged.

import { idbStores } from '../store/idb.ts';
import { createEngine } from './engine.ts';
import type { Engine, Env } from './engine.ts';

export function browserEnv(url: string = location.origin): Env {
  return {
    url,
    now: () => Date.now(),
    schedule: (run, ms) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
    random: Math.random,
    WebSocket,
    fetch: (input, init) => fetch(input, init),
    openStore: idbStores(),
  };
}

/** The app's engine. `url` is the server when it is not the page's own origin, as in the phone app. */
export async function startEngine(url?: string): Promise<Engine> {
  const engine = await createEngine(browserEnv(url));
  // A background tab's timers are throttled and a sleeping phone's do not run at all, so the
  // backoff may be far from done when the person is looking again.
  addEventListener('online', engine.wake);
  document.addEventListener('visibilitychange', () => document.hidden || engine.wake());
  return engine;
}
