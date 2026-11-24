// What the sync scenarios and the simulator share: a device that is the real engine in Node, with
// a network that can be cut, against the real server from ../server.ts.
import { createEngine } from '../../client/src/sync/engine.ts';
import type { Engine } from '../../client/src/sync/engine.ts';
import type { Cell } from '../../client/src/core/merge.ts';
import { memoryStores } from '../../client/src/store/memory.ts';
import type { OpenStore } from '../../client/src/store/store.ts';
import { sleep } from '../server.ts';
import type { Remote } from '../server.ts';

export { sleep, startServer } from '../server.ts';
export type { Remote, Server } from '../server.ts';

/** Polls until `ok()` holds. On timeout it throws `what`, or what `what()` says then. */
export async function until(ok: () => boolean, ms: number, what: string | (() => string)): Promise<number> {
  const start = performance.now();
  while (!ok()) {
    if (performance.now() - start > ms) throw new Error(typeof what === 'string' ? what : what());
    await sleep(5);
  }
  return performance.now() - start;
}

/**
 * One device's link to the server. `frames` logs every frame both ways, newest last, so a test can
 * prove a nack came or a push went once. Cut, a socket is closed and frames still in the air are
 * dropped, as a real network drop would.
 */
export function network() {
  let socketUp = true;
  let httpUp = true;
  const open = new Set<WebSocket>();
  const frames: { dir: 'in' | 'out'; msg: any }[] = [];
  class Sock extends WebSocket {
    constructor(url: string) {
      if (!socketUp) throw new Error('offline');
      super(url);
      open.add(this);
      this.addEventListener('close', () => open.delete(this));
      this.addEventListener('message', (e) => frames.push({ dir: 'in', msg: JSON.parse(String(e.data)) }));
    }
    override send(data: string) {
      // A socket that is closing drops what it is given, so that never went anywhere.
      if (this.readyState === WebSocket.OPEN) frames.push({ dir: 'out', msg: JSON.parse(data) });
      super.send(data);
    }
  }
  const dropSockets = () => {
    for (const s of open) s.close();
    open.clear();
  };
  return {
    frames,
    WebSocket: Sock,
    async fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }) {
      if (!httpUp) throw new TypeError('offline');
      if (url.includes('/api/rooms/')) frames.push({ dir: 'out', msg: { type: 'request', path: new URL(url).pathname, ...JSON.parse(init.body) } });
      if (url.endsWith('/api/sync')) frames.push({ dir: 'out', msg: { type: 'post', ...JSON.parse(init.body) } });
      const res = await fetch(url, init);
      // The reply was lost on the way back. The server may well have stored the push.
      if (!httpUp) throw new TypeError('offline');
      if (!url.endsWith('/api/sync') || !res.ok) return res;
      const body = await res.json();
      frames.push({ dir: 'in', msg: { type: 'reply', ...body } });
      return { ok: true, status: res.status, headers: res.headers, json: async () => body };
    },
    cut() {
      socketUp = httpUp = false;
      dropSockets();
    },
    /** Only the socket is refused: a proxy that will not pass a WebSocket. POST takes over. */
    noSocket() {
      socketUp = false;
      httpUp = true;
      dropSockets();
    },
    restore() {
      socketUp = httpUp = true;
    },
    get up() {
      return httpUp;
    },
  };
}
export type Network = ReturnType<typeof network>;

export interface Device {
  engine: Engine;
  net: Network;
  disk: OpenStore;
  /** ms added to the real clock. Change it to set the device's clock wrong. */
  skew: { ms: number };
}

// Every engine still running. A test that fails halfway leaves its devices up, and their
// reconnect timers would keep the test process alive for good.
const running = new Set<Engine>();
export const stopAll = () => Promise.all([...running].map((e) => e.stop()));

/** A device: give it the disk and network of one that stopped, and it is that device after a restart. */
export async function device(
  server: Remote,
  opts: { disk?: OpenStore; net?: Network; skew?: { ms: number }; random?: () => number; utcOffsetMin?: number } = {},
): Promise<Device> {
  const disk = opts.disk ?? memoryStores();
  const net = opts.net ?? network();
  const skew = opts.skew ?? { ms: 0 };
  const engine = await createEngine({
    url: server.url,
    now: () => Date.now() + skew.ms,
    schedule: (run, ms) => {
      const t = setTimeout(run, ms);
      return () => clearTimeout(t);
    },
    random: opts.random ?? Math.random,
    WebSocket: net.WebSocket,
    fetch: net.fetch,
    openStore: disk,
    utcOffsetMin: () => opts.utcOffsetMin ?? 0,
  });
  running.add(engine);
  const stop = engine.stop;
  engine.stop = () => (running.delete(engine), stop());
  return { engine, net, disk, skew };
}

export async function restart(server: Remote, d: Device, opts: { utcOffsetMin?: number } = {}): Promise<Device> {
  await d.engine.stop();
  return device(server, { ...d, ...opts });
}

export const PASSWORD = 'correct horse battery';

/** A new account on its own first device. */
export async function account(server: Remote, username: string, opts: Parameters<typeof device>[1] = {}) {
  const d = await device(server, opts);
  const res = await d.engine.register(server.invite(), username, PASSWORD);
  if (!res.ok) throw new Error(`register ${username}: ${res.error}`);
  return d;
}

/** Another device of an account. */
export async function signedIn(server: Remote, username: string, opts: Parameters<typeof device>[1] = {}) {
  const d = await device(server, opts);
  const res = await d.engine.signIn(username, PASSWORD);
  if (!res.ok) throw new Error(`sign in ${username}: ${res.error}`);
  return d;
}

export const inStep = (e: Engine) => e.sync.value === 'in-step' && e.unsent.value === 0;

/** Every cell, one line each, sorted by dataset, row, field: stamp and value both count. */
export const table = (cells: Cell[]) =>
  cells
    .map((c) => `${c.dataset}/${c.row}/${c.field} ${c.stamp} ${JSON.stringify(c.value)}`)
    .sort();

/** What the server holds for an account: what a brand new device gets after catching up from 0. */
export async function serverCells(server: Remote, username: string): Promise<Cell[]> {
  const fresh = await signedIn(server, username);
  try {
    await until(() => inStep(fresh.engine), 10000, `a fresh device of ${username} did not catch up`);
    return fresh.engine.cells();
  } finally {
    await fresh.engine.stop();
  }
}

export const serverHolds = async (server: Remote, username: string) => table(await serverCells(server, username));

/** The server's rows of one dataset, by id, each with its fields' newest values. */
export async function serverRows(server: Remote, username: string, dataset: string): Promise<Map<string, Record<string, unknown>>> {
  const rows = new Map<string, Record<string, unknown>>();
  for (const c of await serverCells(server, username)) {
    if (c.dataset === dataset) rows.set(c.row, { ...rows.get(c.row), id: c.row, [c.field]: c.value });
  }
  return rows;
}

/** The rows a screen would show, as `dataset/row/field value` lines, for the datasets the device holds. */
export function shown(e: Engine): string[] {
  const lines: string[] = [];
  for (const dataset of new Set(e.cells().map((c) => c.dataset))) {
    for (const [id, row] of e.rows(dataset).value) {
      for (const [field, value] of Object.entries(row)) if (field !== 'id') lines.push(`${dataset}/${id}/${field} ${JSON.stringify(value)}`);
    }
  }
  return lines.sort();
}
const held = (e: Engine) => table(e.cells()).map((line) => line.replace(/ \S+/, ''));

/** Waits until every device is in step, they all hold the same cells, and each shows what it holds. */
export async function converge(devices: Device[], ms = 10000): Promise<number> {
  const same = () => {
    const first = JSON.stringify(table(devices[0]!.engine.cells()));
    return devices.every(
      (d) => inStep(d.engine) && JSON.stringify(table(d.engine.cells())) === first && JSON.stringify(shown(d.engine)) === JSON.stringify(held(d.engine)),
    );
  };
  return until(same, ms, () =>
    'devices did not converge:\n' +
    devices
      .map((d, i) => {
        const wrong = shown(d.engine).filter((line) => !held(d.engine).includes(line));
        return `device ${i} ${d.engine.sync.value}, ${d.engine.unsent.value} unsent:\n  ${table(d.engine.cells()).join('\n  ')}` +
          (wrong.length ? `\n  shows what it does not hold:\n  ${wrong.join('\n  ')}` : '');
      })
      .join('\n'),
  );
}

export const offline = (d: Device) => d.net.cut();
export function online(d: Device) {
  d.net.restore();
  d.engine.wake();
}
