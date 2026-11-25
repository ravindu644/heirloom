// The engine: one per device. It ties the clock, the merge, the outbox, the cursor, the store and
// the wire together, and shows the result as signals. The rules are contracts/protocol.md; what
// this file adds is the order things happen in, so that a crash at any point loses nothing:
//   a local edit is one store write: the cell, its outbox entry, the clock.
//   incoming cells are one store write: the cells kept, the cursor, the outbox entries they beat.
//   an outbox entry leaves on its ack, or when a higher stamp for its field arrives. Never else.

import { batch, computed, effect, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { ZERO, eventStamp, isStamp, see, stamp } from '../core/hlc.ts';
import type { Clock, Stamp } from '../core/hlc.ts';
import { applyCell, cellKey, newer, restamp } from '../core/merge.ts';
import type { Cell, Cells } from '../core/merge.ts';
import { IDLE, act, asTimer } from '../core/timer.ts';
import type { TimerAction, TimerState } from '../core/timer.ts';
import { StoreGone } from '../store/store.ts';
import type { OpenStore, Store, Write } from '../store/store.ts';
import { connect, health, postJson, smoothOffset } from './transport.ts';
import type { Connect, Handlers, Push, ServerMessage, Transport, Wire } from './transport.ts';

export interface Env extends Wire {
  openStore: OpenStore;
  /** Tests script the wire by replacing this. Left out, it is the real transport over `WebSocket` and `fetch`. */
  connect?: Connect;
  /**
   * The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. The server is told,
   * so it knows this person's "today" for rooms. Left out, it is told 0.
   */
  utcOffsetMin?: () => number;
  /**
   * The device's own word on whether it has a network at all (the browser's `navigator.onLine`).
   * False at a start means offline at once, without waiting for an attempt to fail. Left out, the
   * engine finds out by trying.
   */
  online?: () => boolean;
}

/**
 * offline: no path to the server, and that is known: an attempt has failed, or the device says
 * it has no network. syncing: connected and still catching up or with edits to send; or, for the
 * first moments after a start, still finding out whether there is a connection at all.
 * in-step: connected, nothing waiting either way. signed-out: no account, or the server refused the token.
 */
export type SyncState = 'offline' | 'syncing' | 'in-step' | 'signed-out';

/** A row as the UI reads it: its id and the newest value of each field. */
export type Row = { readonly id: string; readonly [field: string]: unknown };

export interface Account {
  account: string;
  username: string;
}

/** What the account may do on its server beyond using the app (protocol section 10). */
export type Role = 'member' | 'admin' | 'owner';

/**
 * `error` is a code from protocol section 10, or one of ours: `offline` (the server could not be
 * reached), `unsent` (sign out refused: edits are waiting and cannot be sent now), `unsaved` (sign
 * in refused: the account open now has unsent edits this device could not save, and leaving it
 * would drop them).
 */
export type AccountResult = { ok: true } | { ok: false; error: string; retry_after?: number };

export interface Engine {
  readonly sync: ReadonlySignal<SyncState>;
  /** Who is signed in on this device. Stays set when the server refuses the token: the data is still theirs. */
  readonly account: ReadonlySignal<Account | null>;
  /**
   * The signed-in account's role, as the server said it in its last `welcome`, kept on this device
   * between connections. `member` until the server has said otherwise, and when nobody is signed
   * in. It only chooses what to show: the server checks every call.
   */
  readonly role: ReadonlySignal<Role>;
  /**
   * Counts each time the server says the role: in a `welcome`, a POST reply or a `role` message.
   * It moves when the role said is the one already held too, which `role` cannot show: whatever
   * was refused for the role before may be asked again.
   */
  readonly roleSaid: ReadonlySignal<number>;
  /** How many edits are waiting to be sent. */
  readonly unsent: ReadonlySignal<number>;
  /** True while the store refuses writes: edits are held in memory and still sent, but closing the app now could lose them. */
  readonly unsaved: ReadonlySignal<boolean>;
  /** The timer cell, or idle before there is one. Feed it to core/timer.ts `view` with `now()`. */
  readonly timer: ReadonlySignal<TimerState>;
  /** This install's id. Made once, kept across sign outs. */
  readonly device: string;
  /** The server this device keeps step with: the address the app was started with. */
  readonly server: string;
  /** Server-corrected time in ms. Everything stamped or shown uses this, never the device's own clock. */
  now(): number;
  /** Every row of a dataset, by id. The same signal each call; it changes when any cell of the dataset does. */
  rows(dataset: string): ReadonlySignal<ReadonlyMap<string, Row>>;
  /**
   * Sets fields of a row. Shown at once, saved, then sent. Writes made in the same turn are saved as one transaction.
   * With `at`, every cell is stamped at that moment (core/hlc.ts `eventStamp`) and the clock is
   * left alone: for a row that must be the same whoever writes it and whenever (protocol section 11).
   * Such a cell is dropped where a newer one is already held. `counter` is for an event that
   * follows another of the same moment (protocol section 16); it is 0 otherwise.
   */
  write(dataset: string, row: string, fields: Record<string, unknown>, at?: number, counter?: number): void;
  /**
   * Takes cells that bring their own stamps, from a person's exported copy: each goes through the
   * ordinary merge, and those that were kept are saved and put in the outbox, as if this device
   * had just written them. Cells the server could not store are left out. Returns how many were kept.
   */
  merge(cells: readonly unknown[]): number;
  /** The stamp of the cell held for a field: when it was last written, and by which device. */
  stamp(dataset: string, row: string, field: string): Stamp | undefined;
  /** Applies a timer action at `now()` and writes the timer cell if it changed anything. */
  act(action: TimerAction): void;
  /** With an empty `invite`: the first account of a server that has none, its owner. */
  register(invite: string, username: string, password: string): Promise<AccountResult>;
  /** Whether the server has no account yet and the next one made owns it (`setup` in /healthz). False when it cannot be asked. */
  needsSetup(): Promise<boolean>;
  signIn(username: string, password: string): Promise<AccountResult>;
  signOut(): Promise<AccountResult>;
  /** Reconnect now: call it when the network returns or the app comes to the front. */
  wake(): void;
  /** Resolves when everything written so far is in the store. Rejects if the store refuses it. */
  saved(): Promise<void>;
  /**
   * Calls `listener` with each room message from the server (protocol section 15), over the
   * socket or in a POST reply. Returns a function that stops it.
   */
  onRoom(listener: (msg: RoomMessage) => void): () => void;
  /**
   * One request to the server on behalf of whoever is signed in: the token and device are put
   * in. The same time limit and codes as the account calls; `offline` when it cannot be asked.
   */
  request(path: string, body: object): Promise<{ ok: true; data: any } | { ok: false; error: string; retry_after?: number }>;
  /**
   * A value kept on this device and never sent: what `keep` last put under `name`. By default
   * it belongs to the signed-in account. With `'device'` it belongs to the install, whoever is
   * signed in or nobody: it outlives a sign out.
   */
  kept(name: string, scope?: 'account' | 'device'): unknown;
  /** An account's value is saved with whatever else is being written and goes with its database at sign out. A device's goes into the install's own store. */
  keep(name: string, value: unknown, scope?: 'account' | 'device'): void;
  /** Every cell held, for tests and the simulator to compare devices. */
  cells(): Cell[];
  /** Saves what is pending, closes the wire and the stores. Rejects, after closing, if unsent edits could not be saved. */
  stop(): Promise<void>;
}

/** One room as the server sees it now, or (`rooms`) the ids of every room the account is in. */
export type RoomMessage = Extract<ServerMessage, { type: 'room' | 'rooms' }>;

interface Session extends Account {
  token: string;
}

// One signed-in account's working state. Everything here is also in its store, except what is
// only true for this connection.
interface Replica {
  session: Session;
  store: Store;
  cells: Cells;
  outbox: Set<string>;
  clock: Clock;
  cursor: number;
  transport: Transport;
  // This connection only:
  head: number;
  flight: { id: string; cells: [key: string, stamp: Stamp][] } | null;
  parked: Set<string>;
  oneByOne: boolean;
  // Saving:
  // Values kept for the facades (`keep`), each under its own name in the store's meta.
  local: Map<string, unknown>;
  // The UTC offset the server was last told.
  zone: number;
  pending: Write | null;
  saving: Promise<void> | null;
}

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const CELL_BYTES = 16 * 1024;
const PUSH_CELLS = 500;
// The server takes frames up to 1 MB. This leaves room for the envelope.
const PUSH_BYTES = 900 * 1024;
const SAVE_RETRY_MS = 5000;
const SIGN_OUT_WAIT_MS = 10000;
// How long the server has to answer an account call. Signing out does not need its answer at
// all, so it waits less: the next sign in queues behind it.
const ASK_MS = 20000;
const LOGOUT_MS = 5000;
// A `slow_down` asking for this many seconds or fewer is waited out; a longer one is the lock, and is answered.
const SLOW_WAIT_S = 2;
const SLOW_TRIES = 3;
export const INSTALL_DB = 'heirloom';
// What `keep` stores sits in the meta beside the clock and the cursor, under this prefix.
const LOCAL = 'local.';

const bytes = (cell: Cell) => new TextEncoder().encode(JSON.stringify(cell)).length;
const isCell = (c: any): c is Cell =>
  c && [c.stamp, c.dataset, c.row, c.field].every((part) => typeof part === 'string') && 'value' in c;

// Two writes as one transaction, `first` applied first.
const join = (first: Write | null, then: Write): Write => ({
  cells: [...(first?.cells ?? []), ...(then.cells ?? [])],
  outbox: [...(first?.outbox ?? []), ...(then.outbox ?? [])],
  meta: { ...first?.meta, ...then.meta },
});

// Anything this build does not know is a member: it only chooses what to show.
const asRole = (said: unknown): Role => (said === 'admin' || said === 'owner' ? said : 'member');

const fold = (rows: Map<string, Row>, cell: Cell) =>
  rows.set(cell.row, { ...rows.get(cell.row), [cell.field]: cell.value, id: cell.row });

/** Opens this install's storage and, if someone is signed in, their data. Ready to read when it resolves. */
export async function createEngine(env: Env): Promise<Engine> {
  const install = await env.openStore(INSTALL_DB);
  const saved = (await install.load()).meta;
  let device = saved.device as string | undefined;
  if (!device) {
    device = Array.from({ length: 16 }, () => Math.floor(env.random() * 16).toString(16)).join('');
    await install.write({ meta: { device } });
  }
  const me = device;
  // Values kept for this install, whoever is signed in (`keep` with 'device').
  const mine = new Map<string, unknown>(Object.entries(saved).flatMap(([name, value]) => (name.startsWith(LOCAL) ? [[name.slice(LOCAL.length), value]] : [])));

  let db: Replica | null = null;
  let offset: number | null = null;
  let batches = 0;
  let turn: Promise<unknown> = Promise.resolve();

  const account = signal<Account | null>(null);
  // What the server last said of the open account. Nobody signed in is a member, whatever is held.
  const said = signal<Role>('member');
  const role = computed<Role>(() => (account.value ? said.value : 'member'));
  const roleSaid = signal(0);
  // The server names the open account's role.
  const hear = (named: unknown) =>
    batch(() => {
      roleSaid.value++;
      if (asRole(named) === said.peek()) return;
      said.value = asRole(named);
      // Kept, so the right things are on screen at the next start, before any connection.
      install.write({ meta: { role: said.peek() } }).catch(() => {});
    });
  const connected = signal(false);
  const caughtUp = signal(false);
  const refused = signal(false);
  // An attempt to reach the server has ended, either way, since this account was opened.
  const tried = signal(false);
  const unsent = signal(0);
  const unsaved = signal(false);
  const sets = new Map<string, Signal<ReadonlyMap<string, Row>>>();
  const roomListeners = new Set<(msg: RoomMessage) => void>();
  const zone = () => env.utcOffsetMin?.() ?? 0;

  const sync = computed<SyncState>(() => {
    if (!account.value || refused.value) return 'signed-out';
    // Not yet tried is not offline: nothing is said that is not so. The first attempt ends within
    // the hello's time limit at the latest, and then it is one or the other.
    if (!connected.value) return tried.value ? 'offline' : 'syncing';
    return caughtUp.value && unsent.value === 0 ? 'in-step' : 'syncing';
  });

  // Whole ms: the smoothed offset is a fraction, and this number goes into timer states and session rows, whose schemas say integer.
  const now = () => Math.round(env.now() + (offset ?? 0));

  function rows(dataset: string): Signal<ReadonlyMap<string, Row>> {
    let set = sets.get(dataset);
    if (!set) sets.set(dataset, (set = signal(build(dataset))));
    return set;
  }

  function build(dataset: string): ReadonlyMap<string, Row> {
    const map = new Map<string, Row>();
    for (const cell of db?.cells.values() ?? []) if (cell.dataset === dataset) fold(map, cell);
    return map;
  }

  // Only datasets someone has asked for have a signal. The rest are built when they are.
  function show(changed: Cell[]) {
    const next = new Map<string, Map<string, Row>>();
    for (const cell of changed) {
      const set = sets.get(cell.dataset);
      if (!set) continue;
      let map = next.get(cell.dataset);
      if (!map) next.set(cell.dataset, (map = new Map(set.peek())));
      fold(map, cell);
    }
    batch(() => {
      for (const [dataset, map] of next) sets.get(dataset)!.value = map;
      unsent.value = db?.outbox.size ?? 0;
    });
  }

  const timer = computed<TimerState>(() => {
    return asTimer(rows('timer').value.get('current')?.state) ?? IDLE;
  });

  // Writes made while one is being saved ride together in the next. That is the batching, and it
  // is also what makes two writes in one turn a single transaction.
  function save(r: Replica, write: Write) {
    r.pending = join(r.pending, { ...write, meta: { ...write.meta, clock: r.clock, cursor: r.cursor, offset } });
    r.saving ??= Promise.resolve().then(() => flush(r));
  }

  async function flush(r: Replica) {
    while (r.pending) {
      const write = r.pending;
      r.pending = null;
      try {
        await r.store.write(write);
        if (db === r) unsaved.value = false;
      } catch (err) {
        if (err instanceof StoreGone) {
          // Signed out in another tab, and the database deleted with it.
          if (r.outbox.size) {
            // But this tab holds edits the server never got, a lap perhaps. They are written
            // back into a database of the same name, they and nothing else, with the cursor at 0
            // so the rest is asked for again. The token is dead by now, so this ends as a
            // `bye` does: signed out with the unsent work kept, sent when the person signs in.
            try {
              r.store = await env.openStore(`${INSTALL_DB}-${r.session.account}`);
              r.cursor = 0;
              const unsentCells = [...r.outbox].map((key) => r.cells.get(key)!);
              r.pending = {
                cells: unsentCells,
                outbox: [...r.outbox].map((key) => [key, true]),
                meta: { ...Object.fromEntries([...r.local].map(([name, value]) => [LOCAL + name, value])), clock: r.clock, cursor: 0, offset },
              };
              continue;
            } catch {
              // No store to be had. The edits stay in memory and the ordinary retry below goes on asking.
            }
          } else {
            // Nothing to write and nobody to write for: this engine is signed out too.
            r.pending = null;
            if (db === r) {
              detach(r);
              account.value = null;
            }
            break;
          }
        }
        if (db === r) unsaved.value = true;
        // Not saved, so not forgotten: it goes back in front of whatever came since and is tried
        // again. Meanwhile it is still pushed, because the server is the other safe place.
        r.pending = join(write, r.pending ?? {});
        env.schedule(() => {
          if (db === r && r.pending) r.saving ??= flush(r);
        }, SAVE_RETRY_MS);
        break;
      }
    }
    r.saving = null;
    if (db === r) pump();
  }

  // Waits until nothing is left to save. False when the store refused: the edits are still in
  // `pending`, in memory only. A failed write is tried once more here before saying so.
  async function settle(r: Replica): Promise<boolean> {
    while (r.saving || r.pending) {
      await (r.saving ??= flush(r));
      if (r.pending && !r.saving) return false;
    }
    return true;
  }

  // Lets go of the account in one turn, so no write can land between a check made just before
  // this and whatever the caller does next.
  function detach(r: Replica) {
    r.transport.stop();
    db = null;
    batch(() => {
      for (const set of sets.values()) set.value = new Map();
      connected.value = caughtUp.value = unsaved.value = false;
      unsent.value = 0;
    });
  }

  // Sends the next batch, one at a time. It waits for the save in progress: a cell the server has
  // and this device forgot in a crash could be stamped a second time with other content.
  function pump() {
    const r = db;
    if (!r || r.saving || r.flight || !connected.peek() || !caughtUp.peek()) return;
    const waiting = [...r.outbox]
      .filter((key) => !r.parked.has(key))
      .map((key) => r.cells.get(key)!)
      .sort((a, b) => (newer(b.stamp, a.stamp) ? -1 : 1));
    const cells: Cell[] = [];
    let size = 0;
    for (const cell of waiting) {
      size += bytes(cell);
      if (cells.length && (cells.length >= (r.oneByOne ? 1 : PUSH_CELLS) || size > PUSH_BYTES)) break;
      cells.push(cell);
    }
    if (!cells.length) return;
    const push: Push = { type: 'push', batch: (++batches).toString(36), cells };
    r.flight = { id: push.batch, cells: cells.map((cell) => [cellKey(cell), cell.stamp]) };
    r.transport.send(push);
  }

  function receive(r: Replica, msg: ServerMessage) {
    if (db !== r) return;
    switch (msg.type) {
      case 'welcome':
        // A new conversation: whatever was in the air on the old one is sent again.
        r.flight = null;
        r.oneByOne = false;
        r.head = msg.head;
        if (msg.head < r.cursor) {
          // The server knows less than we were sent: it was restored from an older copy and may
          // have lost any cell. It will send everything from 0, and it gets everything we hold.
          // Pushing a cell it still has is harmless.
          r.cursor = 0;
          for (const key of r.cells.keys()) r.outbox.add(key);
          save(r, { outbox: [...r.cells.keys()].map((key) => [key, true]) });
          unsent.value = r.outbox.size;
        }
        // The welcome names the account's rooms. An older server names none: that is "not said",
        // not "none". Said before anyone hears there is a connection, so nothing waiting for a
        // room that is gone is sent into it.
        if (Array.isArray(msg.rooms)) {
          const rooms = msg.rooms.filter((id) => typeof id === 'string');
          roomListeners.forEach((listener) => listener({ type: 'rooms', rooms }));
        }
        if (msg.role !== null) hear(msg.role);
        batch(() => {
          connected.value = true;
          tried.value = true;
          caughtUp.value = r.cursor >= r.head;
        });
        return pump();

      case 'cells': {
        if (msg.from > r.cursor) {
          // Cells between our cursor and this frame never reached us. Ask again from the cursor.
          caughtUp.value = false;
          return r.transport.again();
        }
        const kept: Cell[] = [];
        const beaten: Write['outbox'] = [];
        for (const cell of msg.cells.filter(isCell)) {
          r.clock = see(r.clock, cell.stamp);
          if (!applyCell(r.cells, cell)) continue;
          kept.push(cell);
          // Another device wrote this field later. The server keeps theirs, so ours has nowhere to go.
          if (r.outbox.delete(cellKey(cell))) beaten.push([cellKey(cell), false]);
        }
        r.cursor = Math.max(r.cursor, msg.to);
        save(r, { cells: kept, outbox: beaten });
        show(kept);
        if (r.cursor >= r.head) caughtUp.value = true;
        return pump();
      }

      case 'ack': {
        const flight = r.flight;
        if (flight?.id !== msg.batch) return;
        r.flight = null;
        // Only what was in the batch: a field edited again since is a newer cell and still waits.
        const sent = flight.cells.filter(([key, stamp]) => r.cells.get(key)?.stamp === stamp && r.outbox.delete(key));
        // Our cursor at the ack's `from` means the numbers up to `cursor` are this batch and nothing else.
        if (r.cursor === msg.from) r.cursor = msg.cursor;
        save(r, { outbox: sent.map(([key]) => [key, false]) });
        unsent.value = r.outbox.size;
        return pump();
      }

      case 'nack': {
        const flight = r.flight;
        if (flight?.id !== msg.batch) return;
        r.flight = null;
        if (msg.reason === 'clock') {
          offset = msg.server_time - env.now();
          const fresh = restamp(r.cells, r.outbox, now(), me);
          r.clock = fresh.clock;
          save(r, { cells: fresh.cells });
        } else if (flight.cells.length > 1) {
          // The server would not take something in the batch. One cell a push finds which.
          r.oneByOne = true;
        } else {
          // This one cell cannot be stored by this server. It stays in the store and the outbox,
          // is tried again at the next start, and no longer blocks the cells behind it.
          r.parked.add(flight.cells[0]![0]);
          // Found. The rest can go together again.
          r.oneByOne = false;
        }
        return pump();
      }

      case 'role':
        return hear(msg.role);

      case 'room':
      case 'rooms':
        return roomListeners.forEach((listener) => listener(msg));

      case 'bye':
        if (msg.reason !== 'token') return;
        r.transport.stop();
        return batch(() => {
          connected.value = false;
          refused.value = true;
        });
    }
  }

  async function open(session: Session, held: Role = 'member') {
    const store = await env.openStore(`${INSTALL_DB}-${session.account}`);
    const snap = await store.load();
    const cells: Cells = new Map();
    for (const cell of snap.cells) applyCell(cells, cell);
    const handlers: Handlers = {
      hello: () => ({ token: session.token, device: me, cursor: r.cursor, utc_offset_min: (r.zone = zone()) }),
      message: (msg) => receive(r, msg),
      down: () => {
        if (db !== r) return;
        batch(() => {
          connected.value = false;
          tried.value = true;
          caughtUp.value = false;
        });
      },
      failed: () => {
        if (db === r) tried.value = true;
      },
      time: (sample) => {
        offset = smoothOffset(offset, sample);
        // The person travelled, or summer time began: the server must hear the new offset, and
        // a hello is what carries it. This runs at every pong, so within one ping of the change.
        if (db === r && zone() !== r.zone) r.transport.again();
      },
    };
    const r: Replica = {
      session,
      store,
      cells,
      outbox: new Set(snap.outbox.filter((key) => cells.has(key))),
      clock: (snap.meta.clock as Clock | undefined) ?? ZERO,
      cursor: (snap.meta.cursor as number | undefined) ?? 0,
      transport: (env.connect ?? ((h) => connect(env, h)))(handlers),
      head: 0,
      flight: null,
      parked: new Set(),
      oneByOne: false,
      local: new Map(Object.entries(snap.meta).flatMap(([name, value]) => (name.startsWith(LOCAL) ? [[name.slice(LOCAL.length), value]] : []))),
      zone: zone(),
      pending: null,
      saving: null,
    };
    offset = (snap.meta.offset as number | null | undefined) ?? offset;
    db = r;
    batch(() => {
      for (const [dataset, set] of sets) set.value = build(dataset);
      account.value = { account: session.account, username: session.username };
      said.value = held;
      refused.value = false;
      // A device that says it has no network is offline now, not after a socket has failed to say so.
      tried.value = env.online?.() === false;
      unsent.value = r.outbox.size;
    });
    r.transport.start();
  }

  // Callers that must not lose what the store refused ask `settle` first and decide.
  async function close() {
    const r = db;
    if (!r) return;
    r.transport.stop();
    await settle(r);
    if (db !== r) return;
    detach(r);
    r.store.close();
  }

  async function ask(path: string, body: object, ms = ASK_MS): Promise<{ ok: true; data: any } | { ok: false; error: string; retry_after?: number }> {
    try {
      const res = await postJson(env, env.url + path, body, ms);
      if (res.ok) return { ok: true, data: res.data ?? {} };
      const wait = Number(res.headers.get('retry-after'));
      return { ok: false, error: res.data?.error ?? `http_${res.status}`, ...(wait > 0 && { retry_after: wait }) };
    } catch {
      return { ok: false, error: 'offline' };
    }
  }

  // Account calls run one after another: two taps on sign in must not open two replicas.
  function inTurn<T>(run: () => Promise<T>): Promise<T> {
    const result = turn.then(run, run);
    turn = result.catch(() => {});
    return result;
  }

  const enter = (path: string, body: object) =>
    inTurn<AccountResult>(async () => {
      // Before the server is asked: a new token for this device would cut the open account's socket.
      const here = db;
      if (here && !(await settle(here)) && here.outbox.size) return { ok: false, error: 'unsaved' };
      let reply = await ask(path, { ...body, device: me });
      // `slow_down` with a wait of a second or two is the server's hashing line being full, not
      // a lock for wrong passwords: nothing the person did, so they are not told. The wait is
      // sat out and the call made again, three times at most.
      for (let tries = 0; tries < SLOW_TRIES && !reply.ok && reply.error === 'slow_down' && (reply.retry_after ?? Infinity) <= SLOW_WAIT_S; tries++) {
        const wait = reply.retry_after! * 1000;
        await new Promise<void>((done) => env.schedule(done, wait));
        reply = await ask(path, { ...body, device: me });
      }
      if (!reply.ok) return reply;
      const { token, account: id, username } = reply.data;
      // Unsent work of whoever was here stays in their own database until they sign in again.
      await close();
      const session: Session = { token, account: id, username };
      // The role goes with the session it was said of: this one is a member until its own welcome.
      await install.write({ meta: { session, role: null } });
      await open(session);
      return { ok: true };
    });

  // Resolves when the outbox is empty, the connection drops, or the wait runs out.
  const drained = () =>
    new Promise<void>((resolve) => {
      let stop = () => {};
      const done = () => {
        cancel();
        stop();
        resolve();
      };
      const cancel = env.schedule(done, SIGN_OUT_WAIT_MS);
      stop = effect(() => {
        if (unsent.value === 0 || sync.value !== 'syncing') queueMicrotask(done);
      });
    });

  const engine: Engine = {
    sync,
    account,
    unsent,
    role,
    roleSaid,
    unsaved,
    timer,
    device: me,
    server: env.url,
    now,
    rows,

    stamp: (dataset, row, field) => db?.cells.get(cellKey({ dataset, row, field }))?.stamp,

    write(dataset, row, fields, at, counter) {
      const r = db;
      if (!r) throw new Error('write before sign in: there is no account to write to');
      const made: Cell[] = [];
      let clock = r.clock;
      // Read once: the cells of one write are then stamps one after another, whatever the
      // millisecond does meanwhile, and a reader can tell two fields were written together.
      const moment = at === undefined ? now() : at;
      for (const [field, given] of Object.entries(fields)) {
        // Checked here, before anything changes: the server would refuse it, and a cell the
        // server refuses would sit in the outbox for good.
        if (![dataset, row, field].every((name) => NAME.test(name))) {
          throw new Error(`bad name in ${dataset}/${row}/${field}: 1 to 64 of A-Z a-z 0-9 _ -`);
        }
        const json = JSON.stringify(given);
        if (json === undefined) throw new Error(`${dataset}/${row}/${field}: write null to clear a field`);
        // An event stamp says when the thing happened, not when it is written down: the clock is not asked and does not move.
        const next = at === undefined ? stamp(clock, moment, me) : { clock, stamp: eventStamp(at, me, counter) };
        clock = next.clock;
        // Through JSON and back: what is held here is exactly what the server will get, and the
        // caller changing its object afterwards changes nothing.
        const cell = { stamp: next.stamp, dataset, row, field, value: JSON.parse(json) };
        if (bytes(cell) > CELL_BYTES) throw new Error(`${dataset}/${row}/${field} is over 16 KB`);
        made.push(cell);
      }
      r.clock = clock;
      // A stamp from the clock is always the newest. An event stamp may not be: then the newer cell stands and there is nothing to send.
      const kept = made.filter((cell) => applyCell(r.cells, cell));
      if (!kept.length) return;
      for (const cell of kept) r.outbox.add(cellKey(cell));
      save(r, { cells: kept, outbox: kept.map((cell) => [cellKey(cell), true]) });
      show(kept);
    },

    act(action) {
      const state = timer.peek();
      const next = act(state, action, now());
      if (next !== state) engine.write('timer', 'current', { state: next });
    },

    register: (invite, username, password) => enter('/api/register', { invite, username, password }),
    signIn: (username, password) => enter('/api/login', { username, password }),
    needsSetup: () => health(env, env.url).then((answer) => answer?.setup === true, () => false),

    signOut: () =>
      inTurn<AccountResult>(async () => {
        const r = db;
        if (!r) return { ok: true };
        // Signing out with edits unsent would be a way to lose a lap. Give them a moment to go, then refuse.
        if (r.outbox.size) await drained();
        // A save in progress may be the ack that empties the outbox, or an edit that fills it again.
        await settle(r);
        if (db !== r) return { ok: true };
        if (r.outbox.size) return { ok: false, error: 'unsent' };
        // No await between that check and here: from this line no write can be made, so none can
        // be deleted with the database. The token is still good until the server is told, so a
        // refusal above leaves the person properly signed in.
        // The account goes in the same turn as its rows: the screen never shows a name over nothing.
        batch(() => {
          detach(r);
          account.value = null;
        });
        // Best effort: offline with nothing to send, the device still signs out. The token is forgotten here either way.
        await ask('/api/logout', { token: r.session.token }, LOGOUT_MS);
        await install.write({ meta: { session: null } });
        // Everything here is on the server. Left on a shared laptop it would be the next person's to read.
        await r.store.destroy();
        return { ok: true };
      }),

    wake: () => db?.transport.wake(),

    onRoom(listener) {
      roomListeners.add(listener);
      return () => void roomListeners.delete(listener);
    },

    async request(path, body) {
      const r = db;
      if (!r) return { ok: false, error: 'offline' };
      const answer = await ask(path, { ...body, token: r.session.token, device: me });
      return answer;
    },

    merge(cells) {
      const r = db;
      if (!r) return 0;
      const kept: Cell[] = [];
      for (const cell of cells) {
        // What the server would refuse must not get as far as the outbox: it would sit there for good.
        if (!isCell(cell) || !isStamp(cell.stamp) || ![cell.dataset, cell.row, cell.field].every((name) => NAME.test(name)) || cell.value === undefined) continue;
        const { stamp: stamped, dataset, row, field, value } = cell;
        const own: Cell = { stamp: stamped, dataset, row, field, value };
        if (bytes(own) > CELL_BYTES) continue;
        r.clock = see(r.clock, own.stamp);
        if (!applyCell(r.cells, own)) continue;
        r.outbox.add(cellKey(own));
        kept.push(own);
      }
      if (kept.length) {
        save(r, { cells: kept, outbox: kept.map((cell) => [cellKey(cell), true]) });
        show(kept);
      }
      return kept.length;
    },

    kept: (name, scope) => (scope === 'device' ? mine.get(name) : db?.local.get(name)),

    keep(name, value, scope) {
      if (scope === 'device') {
        mine.set(name, value);
        // The install's store is written on its own. If it refuses, the value holds until the app closes.
        return void install.write({ meta: { [LOCAL + name]: value } }).catch(() => {});
      }
      const r = db;
      if (!r) return;
      r.local.set(name, value);
      save(r, { meta: { [LOCAL + name]: value } });
    },

    async saved() {
      if (db && !(await settle(db))) throw new Error('the store refused the write: it is held in memory only');
    },

    cells: () => [...(db?.cells.values() ?? [])],

    stop: () =>
      inTurn(async () => {
        // Closing is all that is left to do when the app goes away, so it closes either way. But
        // edits that were neither sent nor saved are gone with it, and that is not done quietly.
        const r = db;
        const lost = r && !(await settle(r)) ? r.outbox.size : 0;
        if (r && db === r) {
          detach(r);
          r.store.close();
        }
        install.close();
        if (lost) throw new Error(`closed with ${lost} unsent edits the store refused to save`);
      }),
  };

  if (saved.session) await open(saved.session as Session, asRole(saved.role));
  return engine;
}
