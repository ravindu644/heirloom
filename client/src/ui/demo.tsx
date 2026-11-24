// The entry of client/demo.html, which is not part of the build: App with a made-up engine and
// timer, in the state the query string names, so every state can be seen and photographed with no
// server. /demo.html lists them. The timer math is the real core/timer.ts; only the data is made
// up, and the buttons work. Its own few words are for us, so they are not in strings.ts.

import { render } from 'preact';
import { signal } from '@preact/signals';
import { IDLE, act, view } from '../core/timer.ts';
import type { Phase, TimerState } from '../core/timer.ts';
import type { AccountResult, Engine, Row, SyncState } from '../sync/engine.ts';
import { EXTEND_MS } from '../sync/focus.ts';
import type { Focus } from '../sync/focus.ts';
import { App, Elsewhere } from './app.tsx';

const MIN = 60000;
const LENGTHS = { work_ms: 25 * MIN, short_ms: 5 * MIN, long_ms: 15 * MIN };
const LONG_TITLE =
  'K&R 5.1 to 5.5: pointers and arrays, then exercise 5-3 (strcat with pointers), then read why a[i] is the same as *(a+i) until it finally stops feeling like a trick';

interface Scene {
  about: string;
  /** The time on the wall, on Tuesday 24 November 2026. */
  at?: [hour: number, minute: number];
  /** The timer: the phase, which lap of the set (0 to 3), time left, and whether it is paused. `left` of 0 is over. */
  run?: { phase: Phase; lap: number; left: number; paused?: boolean; task?: string };
  /** Idle, with this lap next. */
  next?: number;
  /** Focus today before the run in progress, and laps that rang. */
  you?: number;
  laps?: number;
  /** Last Tuesday up to now, and its whole day. Left out: no ghost. */
  ghost?: [ms: number, total: number];
  sync?: SyncState;
  unsent?: number;
  unsaved?: boolean;
  /** The timer was last touched on an earlier day. */
  newDay?: boolean;
  /** The demo taps the button whose words start like this, once: for what only shows after a tap. */
  tap?: string;
  /** A second tab: no app at all. */
  elsewhere?: boolean;
  signedOut?: boolean;
}

const lap2 = { phase: 'work', lap: 1, left: 18 * MIN + 42000 } as const;
const tuesday: [number, number] = [150 * MIN, 200 * MIN];

const SCENES: Record<string, Scene> = {
  'signed-out': { about: 'Nobody is signed in', signedOut: true },
  idle: { about: 'The morning, before the first lap', at: [9, 5], next: 0, ghost: [5 * MIN, 200 * MIN] },
  'first-day': { about: 'No ghost yet: lap 1 of the first day', run: { phase: 'work', lap: 0, left: 21 * MIN + 7000 } },
  'running-behind': { about: 'Lap 2 running, 19 minutes behind the ghost', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday },
  'running-ahead': { about: 'Lap 2 running, 6 minutes ahead', run: lap2, you: 150 * MIN, laps: 6, ghost: tuesday },
  paused: { about: 'Lap 2, paused', run: { ...lap2, paused: true }, you: 125 * MIN, laps: 5, ghost: tuesday },
  'lap-level': { about: 'Lap 2 just over, level', run: { ...lap2, left: 0 }, you: 125 * MIN, laps: 5, ghost: tuesday },
  'lap-ahead': { about: 'Lap 2 just over, 6 minutes ahead', run: { ...lap2, left: 0 }, you: 131 * MIN, laps: 5, ghost: tuesday },
  'lap-behind': { about: 'Lap 2 just over, 19 minutes behind', run: { ...lap2, left: 0 }, you: 106 * MIN, laps: 4, ghost: tuesday },
  'lap-first-day': { about: 'Lap 1 just over, no ghost yet', run: { phase: 'work', lap: 0, left: 0 } },
  'set-done': { about: 'The fourth lap just over: a set', run: { phase: 'work', lap: 3, left: 0 }, you: 175 * MIN, laps: 7, ghost: tuesday },
  break: { about: 'A short break running', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday },
  'break-over': { about: 'A short break that is over', run: { phase: 'short', lap: 1, left: 0 }, you: 150 * MIN, laps: 6, ghost: tuesday },
  'long-break': { about: 'The long break running', run: { phase: 'long', lap: 3, left: 11 * MIN + 5000 }, you: 200 * MIN, laps: 8, ghost: tuesday },
  offline: { about: 'No connection, 3 edits unsent', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, sync: 'offline', unsent: 3 },
  'next-day': { about: 'Opened the morning after a lap that rang last night', at: [9, 5], run: { ...lap2, left: 0 }, ghost: [5 * MIN, 200 * MIN], newDay: true },
  unsaved: { about: 'The store is refusing writes', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, unsaved: true },
  refused: { about: 'The server signed this device out', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, sync: 'signed-out' },
  'long-title': { about: 'A lap on the longest task title', run: { ...lap2, task: 'long' }, you: 125 * MIN, laps: 5, ghost: tuesday },
  'undo-stop': { about: 'Just stopped: the sentence, and Undo for ten seconds', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, tap: 'Stop' },
  'undo-aside': { about: 'Just set aside, with Undo', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, tap: 'Set aside' },
  elsewhere: { about: 'A second tab of the same browser', elsewhere: true },
  'lap-live': { about: 'Three seconds before the bell: watch the lap-done moment', run: { ...lap2, left: 3000 }, you: 106 * MIN, laps: 4, ghost: tuesday },
  'set-live': { about: 'Three seconds before the bell of lap 4: watch the set-done moment', run: { phase: 'work', lap: 3, left: 3000 }, you: 175 * MIN, laps: 7, ghost: tuesday },
};

function stage(scene: Scene): { engine: Engine; focus: Focus } {
  const [hour, minute] = scene.at ?? [16, 40];
  const opened = Date.now();
  const start = new Date(2026, 10, 24, hour, minute, 18).getTime();
  const now = () => start + Date.now() - opened;

  const run = scene.run;
  const planned = run ? LENGTHS[`${run.phase}_ms`] : 0;
  const state = signal<TimerState>(
    run
      ? {
          phase: run.phase,
          run: 'demo-0',
          task: run.task ?? null,
          // "Over" opened five seconds after the bell, so it is a result found, not one watched.
          started: start - (planned - run.left) - (run.left === 0 ? 5000 : 0) - (run.paused ? 2 * MIN : 0),
          paused_at: run.paused ? start - 2 * MIN : null,
          paused_ms: 0,
          planned_ms: planned,
          set_index: run.lap,
        }
      : { ...IDLE, set_index: scene.next ?? 0 },
  );
  let you = scene.you ?? 0;
  let laps = scene.laps ?? 0;
  let runs = 0;

  const ran = () => {
    const s = state.value;
    return s.started === null ? 0 : Math.min(s.planned_ms, (s.paused_at ?? now()) - s.started - s.paused_ms);
  };
  const over = () => view(state.value, now()).over;
  const lapOpen = () => state.value.phase === 'work';
  // What the real one does when a run ends: a lap that rang counts, a stop keeps a minute or more.
  const close = (keep: boolean) => {
    if (!lapOpen() || !keep) return;
    if (over()) laps++;
    if (over() || ran() >= MIN) you += ran();
  };
  const begin = (phase: Phase) => {
    state.value = act(state.value, { do: 'start', phase, run: `demo-${++runs}`, task: null, planned_ms: LENGTHS[`${phase}_ms`] }, now());
  };

  // Ten seconds to take a stop or a set aside back, as the real one gives.
  const undoable = signal(false);
  let before: { state: TimerState; you: number; laps: number } | null = null;
  const end = (keep: boolean) => {
    before = { state: state.value, you, laps };
    close(keep);
    state.value = act(state.value, { do: 'stop' }, now());
    undoable.value = true;
    setTimeout(() => (undoable.value = false), 10000);
  };

  const focus: Focus = {
    state,
    lengths: signal(LENGTHS),
    view() {
      const v = view(state.value, now());
      // What the real one does on a new day: the next thing is lap one, whatever came before.
      return scene.newDay && state.value.run === 'demo-0' ? { ...v, next: { phase: 'work', set_index: 0 } } : v;
    },
    ran,
    race() {
      // Yesterday's lap is not today's focus.
      const you_ms = you + (lapOpen() && !(scene.newDay && state.value.run === 'demo-0') ? ran() : 0);
      const ghost = scene.ghost ? { day: '2026-11-17', ms: scene.ghost[0], total_ms: scene.ghost[1] } : null;
      return { you_ms, ghost, split_ms: ghost ? you_ms - ghost.ms : null };
    },
    lapsToday: () => laps + (lapOpen() && over() ? 1 : 0),
    start() {
      const next = view(state.value, now()).next.phase;
      close(true);
      begin(next);
    },
    skipBreak() {
      close(true);
      begin('work');
    },
    pause: () => void (state.value = act(state.value, { do: 'pause' }, now())),
    resume: () => void (state.value = act(state.value, { do: 'resume' }, now())),
    extend: () => void (state.value = act(state.value, { do: 'extend', ms: EXTEND_MS }, now())),
    stop: () => end(true),
    setAside: () => end(false),
    undoable,
    undo() {
      if (!before) return;
      ({ you, laps } = before);
      state.value = before.state;
      undoable.value = false;
    },
  };

  const account = signal(scene.signedOut ? null : { account: 'demo', username: 'ravi' });
  const sync = signal<SyncState>(scene.sync ?? (scene.signedOut ? 'signed-out' : 'in-step'));
  const unsent = signal(scene.unsent ?? 0);
  const tasks = signal<ReadonlyMap<string, Row>>(new Map([['long', { id: 'long', title: LONG_TITLE }]]));
  const none = signal<ReadonlyMap<string, Row>>(new Map());
  // The demo's server. A password that is an error's code gets that error, so each sentence can
  // be read: taken, invite, credentials, slow_down, bad_request, offline, server.
  const answer = async (username: string, password: string): Promise<AccountResult> => {
    await new Promise((done) => setTimeout(done, 400));
    if (/^[a-z_]+$/.test(password)) return { ok: false, error: password, retry_after: 720 };
    account.value = { account: 'demo', username };
    sync.value = 'in-step';
    return { ok: true };
  };
  const engine: Engine = {
    sync,
    account,
    unsent,
    unsaved: signal(scene.unsaved ?? false),
    timer: state,
    device: 'demo',
    now,
    rows: (dataset) => (dataset === 'task' ? tasks : none),
    write() {},
    stamp: () => undefined,
    act() {},
    register: (_invite, username, password) => answer(username, password),
    signIn: answer,
    async signOut() {
      if (sync.value === 'offline' && unsent.value > 0) return { ok: false, error: 'unsent' };
      account.value = null;
      return { ok: true };
    },
    wake() {},
    saved: async () => {},
    cells: () => [],
    stop: async () => {},
  };
  return { engine, focus };
}

const name = new URLSearchParams(location.search).get('state');
const scene = name ? SCENES[name] : undefined;
render(
  scene?.elsewhere ? (
    <Elsewhere />
  ) : scene ? (
    <App {...stage(scene)} />
  ) : (
    <main style="padding: var(--layout-gutter); display: grid; gap: var(--space-sm)">
      <h1>heirloom, every state</h1>
      {Object.entries(SCENES).map(([id, { about }]) => (
        <a key={id} href={`?state=${id}`} style="text-decoration: underline">
          {id}: {about}
        </a>
      ))}
    </main>
  ),
  document.getElementById('app')!,
);
// After the first paint, as a person would: the screen has settled before anyone can tap.
if (scene?.tap) setTimeout(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.startsWith(scene.tap!))?.click(), 100);
