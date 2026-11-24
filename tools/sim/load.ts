// Usage: node tools/sim/load.ts --url http://127.0.0.1:18797 --invites CODE1,CODE2,CODE3,CODE4 --rss '<command printing a VmRSS line>'
//
// Memory of a heirloomd under a small crowd: 4 accounts of 5 devices, the real engine with Focus
// and Rooms on each, all in one room. It measures the server's VmRSS (through --rss, run every
// half second) in each phase: idle, 20 sign-ins in one burst (argon2id is the peak), 20
// connected, a minute of ordinary pushing (a timer change every 2 s and a session row every 4 s
// across the group), and a minute after. Also the time a timer change takes from one device to
// another of the same account. Never point it at a server with real accounts on it.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { createFocus } from '../../client/src/sync/focus.ts';
import { createRooms } from '../../client/src/sync/rooms.ts';
import { device, inStep, PASSWORD, sleep, stopAll, until } from '../../tests/sync/harness.ts';
import type { Device } from '../../tests/sync/harness.ts';

const { values: args } = parseArgs({ options: { url: { type: 'string' }, invites: { type: 'string' }, rss: { type: 'string' } } });
const invites = (args.invites ?? '').split(',').filter(Boolean);
if (!args.url || invites.length !== 4 || !args.rss) throw new Error('usage: --url <server> --invites <4 codes> --rss <command>');
const remote = { url: args.url, invite: () => '' };
const sh = promisify(exec);

// Seeded: the same run of actions each time.
let seed = 20261124;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const schedule = (run: () => void, ms: number) => {
  const t = setTimeout(run, ms);
  return () => clearTimeout(t);
};

// Samples run the whole time; each lands in the phase that is current.
let phase = 'idle';
const seen = new Map<string, number[]>();
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    const out = (await sh(args.rss!)).stdout;
    const kb = Number(out.match(/VmRSS:\s+(\d+)\s+kB/)?.[1]);
    if (kb) seen.set(phase, [...(seen.get(phase) ?? []), kb]);
    await sleep(500);
  }
})();
const hold = async (name: string, ms: number) => {
  phase = name;
  await sleep(ms);
};

await hold('idle after start', 5000);

// Four accounts, registered one by one; those devices go away again.
phase = 'registering 4 accounts';
const names = invites.map((_, i) => `load${Date.now() % 100000}_${i}`);
for (const [i, invite] of invites.entries()) {
  const d = await device(remote);
  const res = await d.engine.register(invite, names[i]!, PASSWORD);
  if (!res.ok) throw new Error(`register: ${res.error}`);
  await d.engine.stop();
}

// The server hashes one password at a time and keeps a short line: past it, a sign-in is told
// slow_down with a Retry-After, and tries again then, as a person would.
phase = '20 sign-ins in a burst';
let toldToWait = 0;
const devices: Device[] = await Promise.all(
  Array.from({ length: 20 }, async (_, i) => {
    const d = await device(remote, { random });
    for (;;) {
      const res = await d.engine.signIn(names[i % 4]!, PASSWORD);
      if (res.ok) return d;
      if (res.error !== 'slow_down') throw new Error(`sign in: ${res.error}`);
      toldToWait++;
      await sleep((res.retry_after ?? 1) * 1000);
    }
  }),
);
console.log(`sign-ins told to slow down and tried again: ${toldToWait}`);
await until(() => devices.every((d) => inStep(d.engine)), 30000, 'not every device came up');
await hold('20 connected, idle', 10000);

let runs = 0;
const apps = devices.map((d) => ({
  d,
  focus: createFocus(d.engine, { utcOffsetMin: () => 0, runId: () => `run-${++runs}`, schedule }),
  rooms: createRooms(d.engine, { schedule }),
}));
const made = await apps[0]!.rooms.create('load');
if (!made.ok) throw new Error(`create: ${made.error}`);
await until(() => !!apps[0]!.rooms.list.value[0]?.code, 5000, 'no room message');
const code = apps[0]!.rooms.list.value[0]!.code;
for (const app of apps.slice(1, 4)) {
  const joined = await app.rooms.join(code);
  if (!joined.ok) throw new Error(`join: ${joined.error}`);
}
await until(() => apps.every((app) => app.rooms.list.value[0]?.members.length === 4), 10000, 'not every device sees the room of 4');
await hold('20 connected, in one room', 5000);

// A minute of ordinary use, and every 6 s one timer change timed from a device to its twin.
phase = 'a minute of pushing';
const trips: number[] = [];
const end = Date.now() + 60000;
for (let tick = 0; Date.now() < end; tick++) {
  const app = apps[Math.floor(random() * apps.length)]!;
  const state = app.focus.state.value;
  if (state.phase === 'idle') app.focus.start();
  else if (state.paused_at !== null) app.focus.resume();
  else if (random() < 0.5) app.focus.pause();
  else app.focus.stop();
  if (tick % 2 === 1) {
    const ended = app.d.engine.now();
    app.d.engine.write('session', `s-${tick}-${app.d.engine.device}`, { kind: 'work', task: null, started: ended - 1500000, ended, planned_ms: 1500000, paused_ms: 0, outcome: 'stopped', device: app.d.engine.device });
  }
  if (tick % 3 === 0) {
    // Device 0 and device 4 are the same account.
    const [from, to] = [apps[0]!, apps[4]!];
    const before = JSON.stringify(to.d.engine.timer.value);
    const start = performance.now();
    if (from.focus.state.value.phase === 'idle') from.focus.start();
    else from.focus.stop();
    await until(() => JSON.stringify(to.d.engine.timer.value) !== before, 5000, 'the timer change never arrived');
    trips.push(performance.now() - start);
  }
  await sleep(2000);
}

await hold('a minute after the load', 60000);
sampling = false;
await sampler;
for (const app of apps) {
  app.focus.close();
  app.rooms.close();
}
await stopAll();

const mb = (kb: number) => (kb / 1024).toFixed(1);
console.log('phase | samples | VmRSS max MB | VmRSS last MB');
for (const [name, kbs] of seen) console.log(`${name} | ${kbs.length} | ${mb(Math.max(...kbs))} | ${mb(kbs.at(-1)!)}`);
trips.sort((a, b) => a - b);
console.log(`timer change, device to device: ${trips.length} trips, median ${trips[Math.floor(trips.length / 2)]!.toFixed(0)} ms, max ${trips.at(-1)!.toFixed(0)} ms`);
process.exit(0);
