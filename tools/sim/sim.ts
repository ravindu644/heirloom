// Usage: node tools/sim/sim.ts [--seed 20261124] [--seeds 1] [--devices 5] [--accounts 2] [--steps 120]
//
// Many devices of a few accounts, the real engine against the real server, editing at random
// while their network comes and goes, their clocks jump and they restart from disk. Then everyone
// comes online and it must hold that:
//   1. every device of an account holds exactly what a fresh device of that account gets;
//   2. no device holds anything of another account;
//   3. nothing was lost: every field ever written exists, holding a value some device wrote;
//   4. every edit shows on its own device at once: it is newer than anything that device has seen.
// The seed picks the events, so a seed always makes the same list; the network decides the
// timing, so a run is a sample of the interleavings that list allows. On a failure it prints
// the seed and the shortest list it can find that still fails, then exits 1.
// --seeds N runs N seeds from --seed up; only the first failure is shrunk.
import { parseArgs } from 'node:util';
import { converge, device, network, PASSWORD, restart, serverHolds, sleep, startServer, stopAll, table, until } from '../../tests/sync/harness.ts';
import type { Device, Server } from '../../tests/sync/harness.ts';

const { values: args } = parseArgs({
  options: {
    seed: { type: 'string', default: '20261124' },
    seeds: { type: 'string', default: '1' },
    devices: { type: 'string', default: '5' },
    accounts: { type: 'string', default: '2' },
    steps: { type: 'string', default: '120' },
  },
});
// A signal skips the exit handlers that stop each trial's server and remove its directory.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => process.exit(130));

const DEVICES = Number(args.devices);
const ACCOUNTS = Number(args.accounts);
const MIN = 60000;

type Event =
  | { k: 'write'; d: number; dataset: string; row: string; field: string; value: string }
  | { k: 'offline' | 'online' | 'socketless' | 'restart'; d: number }
  | { k: 'clock'; d: number; ms: number }
  | { k: 'wait'; ms: number };

// mulberry32: small, seeded, and the same on every machine.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Few names, so devices collide often. `zz_future` and `zz_new` are a dataset and a field no
// schema knows: a newer build's data must pass through like any other.
const DATASETS = ['task', 'checkin', 'zz_future'];
const ROWS = ['r1', 'r2', 'r3'];
const FIELDS = ['title', 'deleted', 'order', 'zz_new'];
const accountOf = (d: number) => d % ACCOUNTS;
const username = (a: number) => `sim${a}`;

// Device 0 has a clock that jumps far ahead, device 1 one that falls behind, the rest drift a little.
// Not whole ms: a real device's corrected time has a fraction, from the averaged offset.
function clockFor(d: number, r: () => number) {
  if (d === 0) return (6 + r() * 6) * MIN;
  if (d === 1) return -(3 + r() * 9) * MIN;
  return (r() - 0.5) * 4000;
}

function events(seed: number, steps: number): Event[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const list: Event[] = [];
  for (let i = 0; i < steps; i++) {
    const d = Math.floor(r() * DEVICES);
    const roll = r();
    if (roll < 0.55) {
      list.push({ k: 'write', d, dataset: pick(DATASETS), row: pick(ROWS), field: pick(FIELDS), value: `a${accountOf(d)}:d${d}:${i}` });
    } else if (roll < 0.66) list.push({ k: 'offline', d });
    else if (roll < 0.78) list.push({ k: 'online', d });
    else if (roll < 0.82) list.push({ k: 'socketless', d });
    else if (roll < 0.87) list.push({ k: 'restart', d });
    else if (roll < 0.93) list.push({ k: 'clock', d, ms: clockFor(d, r) });
    else list.push({ k: 'wait', ms: 1 + Math.floor(r() * 30) });
  }
  return list;
}

// A screen is open on every dataset from the start, so what it shows is checked against what is held.
function watch(dev: Device) {
  for (const dataset of DATASETS) dev.engine.rows(dataset);
  return dev;
}

/** Runs one list on a fresh server. Null when everything held, else what broke. */
async function trial(seed: number, list: Event[], stats = { nacks: 0 }): Promise<string | null> {
  const server: Server = await startServer();
  try {
    return await play(server, seed, list, stats);
  } catch (err) {
    return `threw: ${(err as Error).stack}`;
  } finally {
    await stopAll();
    await server.stop();
  }
}

async function play(server: Server, seed: number, list: Event[], stats: { nacks: number }): Promise<string | null> {
  const devs: Device[] = [];
  for (let d = 0; d < DEVICES; d++) {
    // Seeded, so device ids (and the stamps that end in them) are the same on every run of a seed.
    const dev = await device(server, { random: rng(seed * 101 + d) });
    const a = accountOf(d);
    const res = d < ACCOUNTS ? await dev.engine.register(server.invite(), username(a), PASSWORD) : await dev.engine.signIn(username(a), PASSWORD);
    if (!res.ok) return `device ${d} could not sign in: ${res.error}`;
    watch(dev);
    devs.push(dev);
  }
  await until(() => devs.every((d) => d.engine.sync.value === 'in-step'), 10000, 'devices did not come up');

  // Every value each field of each account was ever given.
  const written = Array.from({ length: ACCOUNTS }, () => new Map<string, Set<string>>());
  for (const e of list) {
    const dev = 'd' in e ? devs[e.d]! : null;
    switch (e.k) {
      case 'write': {
        dev!.engine.write(e.dataset, e.row, { [e.field]: e.value });
        // An edit is stamped later than everything the device has seen (protocol section 2), so
        // it shows at once. If it does not, the person typed and nothing happened.
        const now = dev!.engine.rows(e.dataset).value.get(e.row)?.[e.field];
        if (now !== e.value) {
          return `4. device ${e.d}'s edit of ${e.dataset}/${e.row}/${e.field} to ${e.value} did not take: it holds ${dev!.engine.stamp(e.dataset, e.row, e.field)} ${JSON.stringify(now)}`;
        }
        const key = `${e.dataset}/${e.row}/${e.field}`;
        const seen = written[accountOf(e.d)]!;
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key)!.add(JSON.stringify(e.value));
        break;
      }
      case 'offline':
        dev!.net.cut();
        break;
      case 'online':
        dev!.net.restore();
        dev!.engine.wake();
        break;
      case 'socketless':
        dev!.net.noSocket();
        break;
      case 'restart':
        devs[e.d] = watch(await restart(server, dev!));
        break;
      case 'clock':
        dev!.skew.ms = e.ms;
        break;
      case 'wait':
        await sleep(e.ms);
        break;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  // Everyone online. A device left on POST stays there: that path must settle too.
  for (const dev of devs) {
    if (!dev.net.up) dev.net.restore();
    dev.engine.wake();
  }

  for (let a = 0; a < ACCOUNTS; a++) {
    const mine = devs.filter((_, d) => accountOf(d) === a);
    try {
      await converge(mine, 10000);
    } catch (err) {
      return `account ${a}: ${(err as Error).message}`;
    }
    const held = await serverHolds(server, username(a));
    const same = await until(() => mine.every((d) => JSON.stringify(table(d.engine.cells())) === JSON.stringify(held)), 3000, '').catch(() => null);
    if (same === null) {
      const d = mine.find((dev) => JSON.stringify(table(dev.engine.cells())) !== JSON.stringify(held))!;
      return `1. a device of account ${a} differs from the server:\n  server:\n    ${held.join('\n    ')}\n  device:\n    ${table(d.engine.cells()).join('\n    ')}`;
    }
    for (const line of held) {
      if (!line.split(' ').slice(2).join(' ').startsWith(`"a${a}:`)) return `2. account ${a} holds a cell it did not write: ${line}`;
    }
    const cells = new Map(held.map((line) => [line.split(' ')[0]!, line.split(' ').slice(2).join(' ')]));
    for (const [key, values] of written[a]!) {
      const value = cells.get(key);
      if (value === undefined) return `3. account ${a} lost ${key}: it was written, the server has nothing`;
      if (!values.has(value)) return `3. account ${a} holds ${key} = ${value}, which no device wrote`;
    }
  }
  stats.nacks += devs.flatMap((d) => d.net.frames).filter((f) => f.msg.type === 'nack' && f.msg.reason === 'clock').length;
  return null;
}

// Drops chunks of the list while it still fails: ddmin, with two minutes to spend, because a
// failing trial waits out the settle timeout and make check must still end.
async function shrink(seed: number, list: Event[]): Promise<Event[]> {
  const deadline = performance.now() + 120000;
  let n = 2;
  while (list.length > 1 && performance.now() < deadline) {
    const size = Math.ceil(list.length / n);
    let smaller = false;
    for (let i = 0; i < n && performance.now() < deadline; i++) {
      const candidate = [...list.slice(0, i * size), ...list.slice((i + 1) * size)];
      if (candidate.length && (await trial(seed, candidate))) {
        list = candidate;
        n = Math.max(n - 1, 2);
        smaller = true;
        break;
      }
    }
    if (!smaller) {
      if (n >= list.length) break;
      n = Math.min(list.length, n * 2);
    }
  }
  return list;
}

const first = Number(args.seed);
let failed = 0;
for (let seed = first; seed < first + Number(args.seeds); seed++) {
  const list = events(seed, Number(args.steps));
  const stats = { nacks: 0 };
  const start = performance.now();
  const broke = await trial(seed, list, stats);
  const ms = (performance.now() - start).toFixed(0);
  if (!broke) {
    console.log(`sim seed ${seed}: ${DEVICES} devices, ${ACCOUNTS} accounts, ${list.length} events, ${stats.nacks} clock nacks, held in ${ms} ms`);
    continue;
  }
  failed++;
  // One shrink is worth having; one per seed would turn a sweep into hours.
  if (failed > 1) {
    console.log(`sim seed ${seed}: FAILED in ${ms} ms: ${broke.split('\n')[0]}`);
    continue;
  }
  console.log(`sim seed ${seed}: FAILED in ${ms} ms\n${broke}\nshrinking...`);
  const small = await shrink(seed, list);
  // The network decides the timing, so give the short list a few chances to show it is real.
  let again: string | null = null;
  let runs = 0;
  while (!again && runs < 5) {
    runs++;
    again = await trial(seed, small);
  }
  console.log(`seed ${seed}, ${small.length} events (${again ? `failed again on re-run ${runs}` : 'did not fail again in 5 re-runs: timing'}):`);
  for (const e of small) console.log('  ' + JSON.stringify(e));
  if (again) console.log(again);
}
if (Number(args.seeds) > 1) console.log(`sim: ${Number(args.seeds) - failed} of ${args.seeds} seeds held`);
process.exit(failed ? 1 : 0);
