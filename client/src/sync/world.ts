// Devices for tests: the real engine with Focus and Today on it, the memory store, a scripted
// wire and a clock that moves when told. Two devices are two engines; the test carries cells
// between them, as the server would.

import type { Cell } from '../core/merge.ts';
import { memoryStores } from '../store/memory.ts';
import type { OpenStore, Write } from '../store/store.ts';
import { createAdmins } from './admins.ts';
import { createEngine } from './engine.ts';
import type { Engine } from './engine.ts';
import { fakeSockets, fakeTime } from './fakes.ts';
import { createFocus } from './focus.ts';
import { createHabits } from './habits.ts';
import { createInvites } from './invites.ts';
import { createProgress } from './progress.ts';
import { createRooms } from './rooms.ts';
import { createSettings } from './settings.ts';
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
  // The device's offset from UTC. A test that travels changes it.
  const zone = { min: OFFSET };
  // The server's side of every request that is not an account call. A test sets `reply` to play it;
  // left alone it answers 200 and an empty object.
  type Answer = { status: number; body: object; retryAfter?: string } | 'unreachable';
  const server = {
    requests: [] as { path: string; body: any; from: string }[],
    reply: null as null | ((path: string, body: any) => Answer | Promise<Answer>),
  };
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
    const wires: { handlers: Handlers; sent: Push[]; running: boolean; agains: number }[] = [];
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
      fetch: async (url, init) => {
        const path = new URL(url).pathname;
        // /healthz is a GET and has no body. It is the test's to answer, as every call but the account's is.
        const body = JSON.parse(init.body ?? 'null');
        let answer: Answer = { status: 200, body: { token: `token-${name}`, account: body?.username === 'ravi' ? 'acct' : `acct-${body?.username}`, username: body?.username } };
        if (!['/api/login', '/api/register', '/api/logout'].includes(path)) {
          server.requests.push({ path, body, from: name });
          answer = (await server.reply?.(path, body)) ?? { status: 200, body: {} };
        }
        if (answer === 'unreachable') throw new TypeError('fetch failed');
        const { status, body: reply, retryAfter } = answer;
        return { ok: status === 200, status, headers: { get: () => retryAfter ?? null }, json: async () => reply };
      },
      openStore: logged,
      utcOffsetMin: () => zone.min,
      connect: (handlers) => {
        const wire = { handlers, sent: [] as Push[], running: false, agains: 0 };
        wires.push(wire);
        const transport: Transport = {
          start: () => void (wire.running = true),
          stop: () => void (wire.running = false),
          send: (push) => void wire.sent.push(push),
          again: () => void wire.agains++,
          wake: () => {},
          offline: () => {},
        };
        return transport;
      },
    });
    if (!engine.account.value) await engine.signIn('ravi', 'correct horse');
    const wire = () => wires.at(-1)!;

    // Made when a test first asks for it, so tests of Focus alone see only Focus's timers.
    let today: ReturnType<typeof createToday> | undefined;
    const focus = createFocus(engine, {
      utcOffsetMin: () => OFFSET,
      runId: () => `run-${++runs}`,
      schedule: (run, ms) => (waits.push(ms), time.schedule(run, ms)),
      // As startApp wires it: the top of today's list, asked for when a lap starts by itself.
      topTask: () => today?.list.peek()[0]?.id ?? null,
    });

    let progress: ReturnType<typeof createProgress> | undefined;
    let habits: ReturnType<typeof createHabits> | undefined;
    let rooms: ReturnType<typeof createRooms> | undefined;
    let settings: ReturnType<typeof createSettings> | undefined;
    let invites: ReturnType<typeof createInvites> | undefined;
    let admins: ReturnType<typeof createAdmins> | undefined;

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
      get habits() {
        return (habits ??= createHabits(engine, { utcOffsetMin: () => OFFSET, id: () => `id-${++ids}`, schedule: time.schedule }));
      },
      get rooms() {
        return (rooms ??= createRooms(engine, { schedule: time.schedule }));
      },
      get settings() {
        return (settings ??= createSettings(engine, { utcOffsetMin: () => OFFSET }));
      },
      get invites() {
        return (invites ??= createInvites(engine));
      },
      get admins() {
        return (admins ??= createAdmins(engine));
      },
      close() {
        invites?.close();
        admins?.close();
        focus.close();
        today?.close();
        progress?.close();
        habits?.close();
        rooms?.close();
        settings?.close();
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
      /** The server's welcome. A `role` is said in it; none is an older server, whose accounts are members. */
      async connect(role?: string) {
        d.online = true;
        wire().handlers.message({ type: 'welcome', server_time: 0, head: wire().handlers.hello().cursor, ...(role && { role }) });
        await d.settle();
      },
      /** The owner changed this account's role while it was connected. */
      role: (role: string) => wire().handlers.message({ type: 'role', role }),
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
    // A device that starts with no server to be had: its first attempt has failed, so it knows it is offline.
    else wire().handlers.failed();
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

  return { time, drift, waits, zone, server, device, restart, exchange, sorted };
}
