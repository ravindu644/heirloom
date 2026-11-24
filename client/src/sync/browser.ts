// The browser's side of everything the engine is handed. The only file under sync/ that touches
// a global, so the engine itself runs in Node unchanged.

import { idbStores } from '../store/idb.ts';
import { createEngine } from './engine.ts';
import type { Engine, Env } from './engine.ts';
import { createFocus } from './focus.ts';
import type { Focus } from './focus.ts';

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

/**
 * The app's engine and its Focus, made together: Focus is what closes a run another device
 * replaces, so it must be listening before the first message arrives.
 * `url` is the server when it is not the page's own origin, as in the phone app.
 */
export async function startApp(url?: string): Promise<{ engine: Engine; focus: Focus }> {
  const env = browserEnv(url);
  const engine = await createEngine(env);
  const focus = createFocus(engine, {
    // getTimezoneOffset counts minutes west of UTC; the contract counts east.
    utcOffsetMin: () => -new Date().getTimezoneOffset(),
    // Not randomUUID: that exists only on https and localhost, and the app must start over plain http on a LAN address too.
    runId: () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    schedule: env.schedule,
  });
  // A background tab's timers are throttled and a sleeping phone's do not run at all, so the
  // backoff may be far from done when the person is looking again.
  addEventListener('online', engine.wake);
  document.addEventListener('visibilitychange', () => document.hidden || engine.wake());
  return { engine, focus };
}
