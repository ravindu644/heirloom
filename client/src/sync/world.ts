// Devices for tests: the real engine with Focus and Today on it, the memory store, a scripted
// wire and a clock that moves when told. Two devices are two engines; the test carries cells
// between them, as the server would.

import type { Cell } from '../core/merge.ts';
import { memoryStores } from '../store/memory.ts';
import type { OpenStore, Write } from '../store/store.ts';
import { createEngine } from './engine.ts';
import type { Engine } from './engine.ts';
import { fakeSockets, fakeTime } from './fakes.ts';
import { createFocus } from './focus.ts';
import { createProgress } from './progress.ts';
import { createToday } from './today.ts';
import type { Handlers, Push, Transport } from './transport.ts';

export const MIN = 60000;
export const LAP = 25 * MIN;
// Sri Lanka: T0 (04:30Z) is 10:00 there, and local midnight is 18:30Z.
export const OFFSET = 330;

export function world() {
  const time = fakeTime();
  let runs = 0;
  let ids = 0;
  // Set to 1 and every look at the clock finds it a millisecond later, as a real one may.
  // Every wait Focus asked the scheduler for.
  const waits: number[] = [];
  const drift = { ms: 0 };
  const now = () => {
    time.jump(drift.ms);
    return time.now();
  };

  async function device(name: string, options: { stores?: OpenStore; log?: Write[]; online?: boolean } = {}) {
    const stores = options.stores ?? memoryStores();
    const wires: { handlers: Handlers; sent: Push[]; running: boolean }[] = [];
    // Every write to the account's database, to see what shares a transaction.
    const logged: OpenStore = async (dbName) => {
      const store = await stores(dbName);
      return dbName === 'heirloom' ? store : { ...store, write: (write) => (options.log?.push(write), store.write(write)) };
    };
    const engine = await createEngine({
      url: 'https://heirloom.test',
      now,
      schedule: time.schedule,
      random: () => (name.charCodeAt(0) % 16) / 16,
      WebSocket: fakeSockets().FakeSocket,
      fetch: async (_url, init) => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ token: `token-${name}`, account: 'acct', username: JSON.parse(init.body).username }),
      }),
      openStore: logged,
      connect: (handlers) => {
        const wire = { handlers, sent: [] as Push[], running: false };
        wires.push(wire);
        const transport: Transport = {
          start: () => void (wire.running = true),
          stop: () => void (wire.running = false),
          send: (push) => void wire.sent.push(push),
          again: () => {},
          wake: () => {},
          offline: () => {},
        };
        return transport;
      },
    });
    if (!engine.account.value) await engine.signIn('ravi', 'correct horse');
    const wire = () => wires.at(-1)!;

    const focus = createFocus(engine, {
      utcOffsetMin: () => OFFSET,
      runId: () => `run-${++runs}`,
      schedule: (run, ms) => (waits.push(ms), time.schedule(run, ms)),
    });

    // Made when a test first asks for it, so tests of Focus alone see only Focus's timers.
    let today: ReturnType<typeof createToday> | undefined;
    let progress: ReturnType<typeof createProgress> | undefined;

    const d = {
      name,
      engine,
      focus,
      get today() {
        return (today ??= createToday(engine, { utcOffsetMin: () => OFFSET, id: () => `id-${++ids}`, schedule: time.schedule }));
      },
      get progress() {
        return (progress ??= createProgress(engine, { utcOffsetMin: () => OFFSET, schedule: time.schedule }));
      },
      close() {
        focus.close();
        today?.close();
        progress?.close();
      },
      stores,
      wire,
      online: false,
      // The server acks whatever was pushed, until nothing is waiting.
      async settle() {
        for (;;) {
          await engine.saved();
          const push = wire().sent.shift();
          if (!push) return;
          if (!d.online) continue;
          const from = wire().handlers.hello().cursor;
          wire().handlers.message({ type: 'ack', batch: push.batch, from, cursor: from + push.cells.length });
        }
      },
      async connect() {
        d.online = true;
        wire().handlers.message({ type: 'welcome', server_time: 0, head: wire().handlers.hello().cursor });
        await d.settle();
      },
      disconnect() {
        d.online = false;
        wire().handlers.down();
      },
      /** Cells from the server, in one frame. */
      receive: (cells: Cell[]) => wire().handlers.message({ type: 'cells', from: 0, to: 0, cells }),
      session: (run: string) => engine.rows('session').value.get(run),
      sessions: () => [...engine.rows('session').value.keys()],
    };
    if (options.online !== false) await d.connect();
    return d;
  }
  type Device = Awaited<ReturnType<typeof device>>;

  /** The same device after the app was killed and opened again. */
  const restart = async (d: Device, options: { online?: boolean; log?: Write[] } = {}) => {
    d.close();
    await d.engine.stop();
    return device(d.name, { stores: d.stores, ...options });
  };

  /** Everything each holds reaches the other, as it would through the server. */
  const exchange = (a: Device, b: Device) => {
    const [fromA, fromB] = [a.engine.cells(), b.engine.cells()];
    b.receive(fromA);
    a.receive(fromB);
  };

  const sorted = (engine: Engine) => engine.cells().toSorted((x, y) => (`${x.dataset}/${x.row}/${x.field}` < `${y.dataset}/${y.row}/${y.field}` ? -1 : 1));

  return { time, drift, waits, device, restart, exchange, sorted };
}
