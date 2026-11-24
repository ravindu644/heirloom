// The browser's side of everything the engine is handed. The only file under sync/ that touches
// a global, so the engine itself runs in Node unchanged.

import { idbStores } from '../store/idb.ts';
import { createEngine } from './engine.ts';
import type { Engine, Env } from './engine.ts';
import { createFocus } from './focus.ts';
import type { Focus } from './focus.ts';
import { createHabits } from './habits.ts';
import type { Habits } from './habits.ts';
import { createProgress } from './progress.ts';
import type { Progress } from './progress.ts';
import { createRooms } from './rooms.ts';
import type { Rooms } from './rooms.ts';
import { createSettings } from './settings.ts';
import type { Settings } from './settings.ts';
import { createToday } from './today.ts';
import type { Today } from './today.ts';
import { connect } from './transport.ts';
import type { Transport } from './transport.ts';

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
    // getTimezoneOffset counts minutes west of UTC; the contract counts east.
    utcOffsetMin: () => -new Date().getTimezoneOffset(),
  };
}

/**
 * The app's engine and its Focus, made together: Focus is what closes a run another device
 * replaces, so it must be listening before the first message arrives.
 * `url` is the server when it is not the page's own origin, as in the phone app.
 */
export async function startApp(url?: string): Promise<{ engine: Engine; focus: Focus; today: Today; progress: Progress; habits: Habits; rooms: Rooms; settings: Settings }> {
  const env = browserEnv(url);
  // The wire is made here, so the browser's own word that the network is gone can reach it.
  let wire: Transport | undefined;
  env.connect = (handlers) => (wire = connect(env, handlers));
  const engine = await createEngine(env);
  const utcOffsetMin = env.utcOffsetMin!;
  // Not randomUUID: that exists only on https and localhost, and the app must start over plain http on a LAN address too.
  const id = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  // Focus asks for the top of today's list when a lap starts by itself; Today is made after it,
  // so the question is put through a function and neither knows the other.
  let today: Today | undefined;
  const focus = createFocus(engine, { utcOffsetMin, runId: id, schedule: env.schedule, topTask: () => today?.list.peek()[0]?.id ?? null });
  const made = (today = createToday(engine, { utcOffsetMin, id, schedule: env.schedule }));
  const progress = createProgress(engine, { utcOffsetMin, schedule: env.schedule });
  const habits = createHabits(engine, { utcOffsetMin, id, schedule: env.schedule });
  const rooms = createRooms(engine, { schedule: env.schedule });
  const settings = createSettings(engine, { utcOffsetMin });
  // What the clock may have passed while nothing ran: the connection, and the day.
  const wake = () => {
    engine.wake();
    made.wake();
    progress.wake();
    habits.wake();
  };
  // A background tab's timers are throttled and a sleeping phone's do not run at all, so the
  // backoff may be far from done when the person is looking again.
  addEventListener('online', wake);
  // Without this a network that vanished is only found by a ping, most of a minute later.
  addEventListener('offline', () => wire?.offline());
  // And a laptop that slept over midnight must not go on showing yesterday until a late timer fires.
  document.addEventListener('visibilitychange', () => document.hidden || wake());
  return { engine, focus, today: made, progress, habits, rooms, settings };
}
