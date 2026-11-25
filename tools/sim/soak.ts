// Usage: node tools/sim/soak.ts --url http://127.0.0.1:18797 --invites C1,C2,C3,C4 --rss '<command printing VmRSS>' [--minutes 60] [--seed 20261125]
//
// The soak: 4 accounts of 5 devices, the real engine with Focus, Rooms and Habits on each, all
// four accounts in one room, for as long as asked. Every half second a seeded event: a field
// written (values unique, so each can be traced), a session row, a check-in, a timer action, a
// cheer, a device dropping off the network or coming back, going socketless, or restarting from
// its disk. VmRSS of the server is read every minute. At the end everyone comes back and settles,
// and it must hold, or the run fails: every device of an account holds the same cells as a fresh
// device of it (compared by hash), and every session, check-in and written field is there with a
// value some device wrote. Never point it at a server with real accounts on it.
import { exec } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs, promisify } from 'node:util';
import { createFocus } from '../../client/src/sync/focus.ts';
import { createHabits } from '../../client/src/sync/habits.ts';
import { createRooms } from '../../client/src/sync/rooms.ts';
import { converge, device, inStep, PASSWORD, restart, serverCells, sleep, stopAll, table, until } from '../../tests/sync/harness.ts';
import type { Device } from '../../tests/sync/harness.ts';

const { values: args } = parseArgs({
  options: { url: { type: 'string' }, invites: { type: 'string' }, rss: { type: 'string' }, minutes: { type: 'string', default: '60' }, seed: { type: 'string', default: '20261125' } },
});
const invites = (args.invites ?? '').split(',').filter(Boolean);
if (!args.url || invites.length !== 4 || !args.rss) throw new Error('usage: --url <server> --invites <4 codes> --rss <command>');
const remote = { url: args.url, invite: () => '' };
const sh = promisify(exec);
const seed = Number(args.seed);

// mulberry32, as the simulator: the same seed makes the same events.
let a = seed >>> 0;
const random = () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]!;
const schedule = (run: () => void, ms: number) => {
  const t = setTimeout(run, ms);
  return () => clearTimeout(t);
};
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

const rssMb = async () => Number((await sh(args.rss!)).stdout.match(/VmRSS:\s+(\d+)\s+kB/)?.[1]) / 1024;
const rss: number[] = [await rssMb()];
log(`VmRSS at start ${rss[0]!.toFixed(1)} MB`);

const names = invites.map((_, i) => `soak${seed % 10000}_${i}`);
for (const [i, invite] of invites.entries()) {
  const d = await device(remote);
  const res = await d.engine.register(invite, names[i]!, PASSWORD);
  if (!res.ok) throw new Error(`register: ${res.error}`);
  await d.engine.stop();
}

type App = { d: Device; account: number; focus: ReturnType<typeof createFocus>; rooms: ReturnType<typeof createRooms>; habits: ReturnType<typeof createHabits> };
let runs = 0;
let rowIds = 0;
const wire = (d: Device, account: number): App => ({
  d,
  account,
  focus: createFocus(d.engine, { utcOffsetMin: () => 0, runId: () => `run-${seed}-${++runs}`, schedule }),
  rooms: createRooms(d.engine, { schedule }),
  habits: createHabits(d.engine, { utcOffsetMin: () => 0, id: () => `h-${seed}-${++rowIds}`, schedule }),
});
const unwire = (app: App) => {
  app.focus.close();
  app.rooms.close();
  app.habits.close();
};

async function signIn(account: number): Promise<Device> {
  const d = await device(remote, { random });
  for (;;) {
    const res = await d.engine.signIn(names[account]!, PASSWORD);
    if (res.ok) return d;
    if (res.error !== 'slow_down') throw new Error(`sign in: ${res.error}`);
    await sleep((res.retry_after ?? 1) * 1000);
  }
}
const apps: App[] = [];
for (let i = 0; i < 20; i++) apps.push(wire(await signIn(i % 4), i % 4));
await until(() => apps.every((app) => inStep(app.d.engine)), 60000, 'not every device came up');

// One room of the four accounts, and one habit each.
const made = await apps[0]!.rooms.create('soak');
if (!made.ok) throw new Error(`create: ${made.error}`);
await until(() => !!apps[0]!.rooms.list.value[0]?.code, 10000, 'no room message');
for (const app of apps.slice(1, 4)) if (!(await app.rooms.join(apps[0]!.rooms.list.value[0]!.code)).ok) throw new Error('join');
const habitOf = apps.slice(0, 4).map((app) => app.habits.add('soak habit', 127, 3)!);

// What must be there at the end, per account.
const written = names.map(() => new Map<string, Set<string>>());
const sessions = names.map(() => new Set<string>());
const checkins = names.map(() => new Set<string>());
const counts: Record<string, number> = {};
const DATASETS = ['task', 'zz_future'];
const ROWS = ['r1', 'r2', 'r3', 'r4'];
const FIELDS = ['title', 'notes', 'order', 'zz_new'];

const end = Date.now() + Number(args.minutes) * 60000;
let nextSample = Date.now() + 60000;
for (let n = 0; Date.now() < end; n++) {
  const at = Math.floor(random() * apps.length);
  const app = apps[at]!;
  const roll = random();
  const kind =
    roll < 0.35 ? 'write' : roll < 0.45 ? 'session' : roll < 0.55 ? 'checkin' : roll < 0.65 ? 'timer' : roll < 0.7 ? 'cheer' : roll < 0.8 ? 'offline' : roll < 0.92 ? 'online' : roll < 0.96 ? 'socketless' : 'restart';
  counts[kind] = (counts[kind] ?? 0) + 1;
  switch (kind) {
    case 'write': {
      const [dataset, row, field] = [pick(DATASETS), pick(ROWS), pick(FIELDS)];
      const value = `a${app.account}:d${at}:${n}`;
      app.d.engine.write(dataset, row, { [field]: value });
      const key = `${dataset}/${row}/${field}`;
      const seen = written[app.account]!;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(JSON.stringify(value));
      break;
    }
    case 'session': {
      const id = `s-${seed}-${n}`;
      const ended = app.d.engine.now() - 60000;
      app.d.engine.write('session', id, { kind: 'work', task: null, started: ended - 1500000, ended, planned_ms: 1500000, paused_ms: 0, outcome: 'stopped', device: app.d.engine.device });
      sessions[app.account]!.add(id);
      break;
    }
    case 'checkin': {
      const id = app.habits.checkIn(habitOf[app.account]!);
      if (id) checkins[app.account]!.add(id);
      break;
    }
    case 'timer': {
      const s = app.focus.state.value;
      if (s.phase === 'idle') app.focus.start();
      else if (s.paused_at !== null) app.focus.resume();
      else if (random() < 0.5) app.focus.pause();
      else app.focus.stop();
      break;
    }
    case 'cheer': {
      const room = app.rooms.list.value[0];
      const other = room?.members.find((m) => !m.you && m.last && !m.last.cheered);
      if (room && other) app.rooms.cheer(room.id, other.id);
      break;
    }
    case 'offline':
      app.d.net.cut();
      break;
    case 'online':
      app.d.net.restore();
      app.d.engine.wake();
      break;
    case 'socketless':
      app.d.net.noSocket();
      break;
    case 'restart':
      unwire(app);
      apps[at] = wire(await restart(remote, app.d), app.account);
      break;
  }
  if (Date.now() >= nextSample) {
    nextSample += 60000;
    rss.push(await rssMb());
    log(`minute ${rss.length - 1}: VmRSS ${rss.at(-1)!.toFixed(1)} MB, ${n + 1} events, ${apps.filter((x) => !x.d.net.up).length} devices offline`);
  }
  await sleep(500);
}

// Everyone back, and settled.
for (const app of apps) {
  app.d.net.restore();
  app.d.engine.wake();
}
const failures: string[] = [];
for (let acct = 0; acct < 4; acct++) {
  const mine = apps.filter((app) => app.account === acct).map((app) => app.d);
  try {
    await converge(mine, 180000);
  } catch (err) {
    failures.push(`account ${acct}: ${(err as Error).message.split('\n')[0]}`);
    continue;
  }
  const held = table(await serverCells(remote, names[acct]!));
  const hash = (lines: string[]) => createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
  const server = hash(held);
  const devices = mine.map((d) => hash(table(d.engine.cells())));
  log(`account ${acct}: server ${server}, devices ${[...new Set(devices)].join(' ')}, ${held.length} cells`);
  if (devices.some((h) => h !== server)) failures.push(`account ${acct}: a device differs from the server`);
  const value = new Map(held.map((line) => [line.split(' ')[0]!, line.split(' ').slice(2).join(' ')]));
  for (const [key, values] of written[acct]!) {
    if (!value.has(key)) failures.push(`account ${acct}: ${key} was written and is missing`);
    else if (!values.has(value.get(key)!)) failures.push(`account ${acct}: ${key} = ${value.get(key)}, which no device of it wrote`);
  }
  for (const id of sessions[acct]!) if (!value.has(`session/${id}/outcome`)) failures.push(`account ${acct}: session ${id} is missing`);
  for (const id of checkins[acct]!) if (!value.has(`checkin/${id}/habit`)) failures.push(`account ${acct}: check-in ${id} is missing`);
  for (const line of held) if (/"a\d:/.test(line) && !line.includes(`"a${acct}:`)) failures.push(`account ${acct}: holds another account's cell ${line}`);
}
rss.push(await rssMb());

for (const app of apps) unwire(app);
await stopAll();
log(`events: ${JSON.stringify(counts)}; sessions ${sessions.map((s) => s.size).join('/')}, check-ins ${checkins.map((s) => s.size).join('/')}`);
log(`VmRSS MB: start ${rss[0]!.toFixed(1)}, max ${Math.max(...rss).toFixed(1)}, end ${rss.at(-1)!.toFixed(1)}; every minute: ${rss.map((x) => x.toFixed(1)).join(' ')}`);
if (failures.length) {
  log(`DIVERGED, seed ${seed}:\n  ${failures.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
log(`no divergence, seed ${seed}`);
process.exit(0);
