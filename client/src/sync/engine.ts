// The engine: one per device. It ties the clock, the merge, the outbox, the cursor, the store and
// the wire together, and shows the result as signals. The rules are contracts/protocol.md; what
// this file adds is the order things happen in, so that a crash at any point loses nothing:
//   a local edit is one store write: the cell, its outbox entry, the clock.
//   incoming cells are one store write: the cells kept, the cursor, the outbox entries they beat.
//   an outbox entry leaves on its ack, or when a higher stamp for its field arrives. Never else.

import { batch, computed, effect, signal } from '@preact/signals-core';
import type { ReadonlySignal, Signal } from '@preact/signals-core';
import { ZERO, see, stamp } from '../core/hlc.ts';
import type { Clock, Stamp } from '../core/hlc.ts';
import { applyCell, cellKey, restamp } from '../core/merge.ts';
import type { Cell, Cells } from '../core/merge.ts';
import { IDLE, act } from '../core/timer.ts';
import type { TimerAction, TimerState } from '../core/timer.ts';
import type { OpenStore, Store, Write } from '../store/store.ts';
import { connect, smoothOffset } from './transport.ts';
import type { Connect, Handlers, Push, ServerMessage, Transport, Wire } from './transport.ts';

export interface Env extends Wire {
  openStore: OpenStore;
  /** Tests script the wire by replacing this. Left out, it is the real transport over `WebSocket` and `fetch`. */
  connect?: Connect;
}

/**
 * offline: no path to the server. syncing: connected, still catching up or with edits to send.
 * in-step: connected, nothing waiting either way. signed-out: no account, or the server refused the token.
 */
export type SyncState = 'offline' | 'syncing' | 'in-step' | 'signed-out';

/** A row as the UI reads it: its id and the newest value of each field. */
export type Row = { readonly id: string; readonly [field: string]: unknown };

export interface Account {
  account: string;
  username: string;
}

/**
 * `error` is a code from protocol section 10, or one of ours: `offline` (the server could not be
 * reached), `unsent` (sign out refused: edits are waiting and cannot be sent now).
 */
export type AccountResult = { ok: true } | { ok: false; error: string; retry_after?: number };

export interface Engine {
  readonly sync: ReadonlySignal<SyncState>;
  /** Who is signed in on this device. Stays set when the server refuses the token: the data is still theirs. */
  readonly account: ReadonlySignal<Account | null>;
  /** How many edits are waiting to be sent. */
  readonly unsent: ReadonlySignal<number>;
  /** The timer cell, or idle before there is one. Feed it to core/timer.ts `view` with `now()`. */
  readonly timer: ReadonlySignal<TimerState>;
  /** This install's id. Made once, kept across sign outs. */
  readonly device: string;
  /** Server-corrected time in ms. Everything stamped or shown uses this, never the device's own clock. */
  now(): number;
  /** Every row of a dataset, by id. The same signal each call; it changes when any cell of the dataset does. */
  rows(dataset: string): ReadonlySignal<ReadonlyMap<string, Row>>;
  /** Sets fields of a row. Shown at once, saved, then sent. Writes made in the same turn are saved as one transaction. */
  write(dataset: string, row: string, fields: Record<string, unknown>): void;
  /** Applies a timer action at `now()` and writes the timer cell if it changed anything. */
  act(action: TimerAction): void;
  register(invite: string, username: string, password: string): Promise<AccountResult>;
  signIn(username: string, password: string): Promise<AccountResult>;
  signOut(): Promise<AccountResult>;
  /** Reconnect now: call it when the network returns or the app comes to the front. */
  wake(): void;
  /** Resolves when everything written so far is in the store. */
  saved(): Promise<void>;
  /** Every cell held, for tests and the simulator to compare devices. */
  cells(): Cell[];
  /** Saves what is pending, closes the wire and the stores. */
  stop(): Promise<void>;
}

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
const INSTALL_DB = 'heirloom';

const bytes = (cell: Cell) => new TextEncoder().encode(JSON.stringify(cell)).length;
const isCell = (c: any): c is Cell =>
  c && [c.stamp, c.dataset, c.row, c.field].every((part) => typeof part === 'string') && 'value' in c;

// Two writes as one transaction, `first` applied first.
const join = (first: Write | null, then: Write): Write => ({
  cells: [...(first?.cells ?? []), ...(then.cells ?? [])],
  outbox: [...(first?.outbox ?? []), ...(then.outbox ?? [])],
  meta: { ...first?.meta, ...then.meta },
});

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

  let db: Replica | null = null;
  let offset: number | null = null;
  let batches = 0;
  let turn: Promise<unknown> = Promise.resolve();

  const account = signal<Account | null>(null);
  const connected = signal(false);
  const caughtUp = signal(false);
  const refused = signal(false);
  const unsent = signal(0);
  const sets = new Map<string, Signal<ReadonlyMap<string, Row>>>();

  const sync = computed<SyncState>(() => {
    if (!account.value || refused.value) return 'signed-out';
    if (!connected.value) return 'offline';
    return caughtUp.value && unsent.value === 0 ? 'in-step' : 'syncing';
  });

  const now = () => env.now() + (offset ?? 0);

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
    const state = rows('timer').value.get('current')?.state;
    return state && typeof state === 'object' ? (state as TimerState) : IDLE;
  });

  // Writes made while one is being saved ride together in the next. That is the batching, and it
  // is also what makes two writes in one turn a single transaction.
  function save(r: Replica, write: Write) {
    r.pending = join(r.pending, { ...write, meta: { clock: r.clock, cursor: r.cursor, offset } });
    r.saving ??= Promise.resolve().then(() => flush(r));
  }

  async function flush(r: Replica) {
    while (r.pending) {
      const write = r.pending;
      r.pending = null;
      try {
        await r.store.write(write);
      } catch {
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

  // Sends the next batch, one at a time. It waits for the save in progress: a cell the server has
  // and this device forgot in a crash could be stamped a second time with other content.
  function pump() {
    const r = db;
    if (!r || r.saving || r.flight || !connected.peek() || !caughtUp.peek()) return;
    const waiting = [...r.outbox]
      .filter((key) => !r.parked.has(key))
      .map((key) => r.cells.get(key)!)
      .sort((a, b) => (a.stamp < b.stamp ? -1 : 1));
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
        r.head = msg.head;
        batch(() => {
          connected.value = true;
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
        }
        return pump();
      }

      case 'bye':
        if (msg.reason !== 'token') return;
        r.transport.stop();
        return batch(() => {
          connected.value = false;
          refused.value = true;
        });
    }
  }

  async function open(session: Session) {
    const store = await env.openStore(`${INSTALL_DB}-${session.account}`);
    const snap = await store.load();
    const cells: Cells = new Map();
    for (const cell of snap.cells) applyCell(cells, cell);
    const handlers: Handlers = {
      hello: () => ({ token: session.token, device: me, cursor: r.cursor }),
      message: (msg) => receive(r, msg),
      down: () => {
        if (db !== r) return;
        batch(() => {
          connected.value = false;
          caughtUp.value = false;
        });
      },
      time: (sample) => {
        offset = smoothOffset(offset, sample);
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
      pending: null,
      saving: null,
    };
    offset = (snap.meta.offset as number | null | undefined) ?? offset;
    db = r;
    batch(() => {
      for (const [dataset, set] of sets) set.value = build(dataset);
      account.value = { account: session.account, username: session.username };
      refused.value = false;
      unsent.value = r.outbox.size;
    });
    r.transport.start();
  }

  async function close() {
    const r = db;
    if (!r) return;
    r.transport.stop();
    while (r.saving) await r.saving;
    db = null;
    r.store.close();
    batch(() => {
      for (const set of sets.values()) set.value = new Map();
      connected.value = caughtUp.value = false;
      unsent.value = 0;
    });
  }

  async function ask(path: string, body: object): Promise<{ ok: true; data: any } | { ok: false; error: string; retry_after?: number }> {
    const post = env.fetch;
    try {
      const res = await post(env.url + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data };
      const wait = Number(res.headers.get('retry-after'));
      return { ok: false, error: data?.error ?? `http_${res.status}`, ...(wait > 0 && { retry_after: wait }) };
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
      const reply = await ask(path, { ...body, device: me });
      if (!reply.ok) return reply;
      const { token, account: id, username } = reply.data;
      // Unsent work of whoever was here stays in their own database until they sign in again.
      await close();
      const session: Session = { token, account: id, username };
      await install.write({ meta: { session } });
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
    timer,
    device: me,
    now,
    rows,

    write(dataset, row, fields) {
      const r = db;
      if (!r) throw new Error('write before sign in: there is no account to write to');
      const made: Cell[] = [];
      let clock = r.clock;
      for (const [field, given] of Object.entries(fields)) {
        // Checked here, before anything changes: the server would refuse it, and a cell the
        // server refuses would sit in the outbox for good.
        if (![dataset, row, field].every((name) => NAME.test(name))) {
          throw new Error(`bad name in ${dataset}/${row}/${field}: 1 to 64 of A-Z a-z 0-9 _ -`);
        }
        const json = JSON.stringify(given);
        if (json === undefined) throw new Error(`${dataset}/${row}/${field}: write null to clear a field`);
        const next = stamp(clock, now(), me);
        clock = next.clock;
        // Through JSON and back: what is held here is exactly what the server will get, and the
        // caller changing its object afterwards changes nothing.
        const cell = { stamp: next.stamp, dataset, row, field, value: JSON.parse(json) };
        if (bytes(cell) > CELL_BYTES) throw new Error(`${dataset}/${row}/${field} is over 16 KB`);
        made.push(cell);
      }
      r.clock = clock;
      for (const cell of made) {
        applyCell(r.cells, cell);
        r.outbox.add(cellKey(cell));
      }
      save(r, { cells: made, outbox: made.map((cell) => [cellKey(cell), true]) });
      show(made);
    },

    act(action) {
      const state = timer.peek();
      const next = act(state, action, now());
      if (next !== state) engine.write('timer', 'current', { state: next });
    },

    register: (invite, username, password) => enter('/api/register', { invite, username, password }),
    signIn: (username, password) => enter('/api/login', { username, password }),

    signOut: () =>
      inTurn<AccountResult>(async () => {
        const r = db;
        if (!r) return { ok: true };
        // Signing out with edits unsent would be a way to lose a lap. Give them a moment to go, then refuse.
        if (r.outbox.size) await drained();
        if (r.outbox.size) return { ok: false, error: 'unsent' };
        // Best effort: offline with nothing to send, the device still signs out. The token is forgotten here either way.
        await ask('/api/logout', { token: r.session.token });
        await close();
        await install.write({ meta: { session: null } });
        account.value = null;
        return { ok: true };
      }),

    wake: () => db?.transport.wake(),

    async saved() {
      while (db?.saving) await db.saving;
    },

    cells: () => [...(db?.cells.values() ?? [])],

    stop: () =>
      inTurn(async () => {
        await close();
        install.close();
      }),
  };

  if (saved.session) await open(saved.session as Session);
  return engine;
}
