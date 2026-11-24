// The engine with the memory store and a scripted wire. Each test names the promise it holds the
// engine to; most of them are some way of saying "nothing is lost, nothing is sent twice as two".

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cell } from '../core/merge.ts';
import { memoryStores } from '../store/memory.ts';
import type { OpenStore, Write } from '../store/store.ts';
import { createEngine } from './engine.ts';
import type { Env } from './engine.ts';
import { T0, fakeSockets, fakeTime, settle } from './fakes.ts';
import { connect } from './transport.ts';
import type { Fetch, Handlers, Push, Transport } from './transport.ts';

const OTHER = 'b2c3d4e5f6071829';
// A cell from another device, stamped `seconds` after T0.
const theirs = (seconds: number, row: string, field: string, value: unknown, dataset = 'task'): Cell => ({
  stamp: `${new Date(T0 + seconds * 1000).toISOString()}-0000-${OTHER}`,
  dataset,
  row,
  field,
  value,
});

// The wire, scripted: the test is the server.
function fakeWire(handlers: Handlers) {
  const wire = {
    handlers,
    running: false,
    sent: [] as Push[],
    agains: 0,
    wakes: 0,
    start: () => void (wire.running = true),
    stop: () => void (wire.running = false),
    send: (push: Push) => void wire.sent.push(push),
    again: () => void wire.agains++,
    wake: () => void wire.wakes++,
    offline: () => handlers.down(),
    // What the server does:
    welcome: (head = 0) => handlers.message({ type: 'welcome', server_time: 0, head }),
    cells: (from: number, to: number, cells: Cell[]) => handlers.message({ type: 'cells', from, to, cells }),
    ack: (from: number, cursor: number, batch = wire.sent.at(-1)!.batch) => handlers.message({ type: 'ack', batch, from, cursor }),
  };
  return wire satisfies Transport;
}

// The account routes of a server, enough of them.
function fakeAccounts() {
  const server = {
    reachable: true,
    calls: [] as { path: string; body: any; signal?: AbortSignal }[],
    fail: null as null | { status: number; error: string; retryAfter?: string },
    /** Set, and the next logout waits for it: the request is on its way and has not come back. */
    logoutWaits: null as null | Promise<void>,
  };
  const fetch: Fetch = async (url, init) => {
    if (!server.reachable) throw new TypeError('fetch failed');
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    server.calls.push({ path, body, signal: init.signal });
    if (path === '/api/logout') await server.logoutWaits;
    const fail = server.fail;
    if (fail) {
      return { ok: false, status: fail.status, headers: { get: () => fail.retryAfter ?? null }, json: async () => ({ error: fail.error }) };
    }
    const reply = path === '/api/logout' ? {} : { token: `token-of-${body.username}`, account: `acct-${body.username}`, username: body.username };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => reply };
  };
  return { server, fetch };
}

interface Options {
  stores?: OpenStore;
  /** Wraps every store this device opens: to watch writes, or to break them. */
  wrap?: (open: OpenStore) => OpenStore;
  startAt?: number;
}

// One device. Give two of them the same `stores` and the second is the first after a restart.
async function device(options: Options = {}) {
  const time = fakeTime(options.startAt);
  const stores = options.stores ?? memoryStores();
  const wires: ReturnType<typeof fakeWire>[] = [];
  const accounts = fakeAccounts();
  const env: Env = {
    url: 'https://heirloom.test',
    now: time.now,
    schedule: time.schedule,
    random: () => 0.5,
    WebSocket: fakeSockets().FakeSocket,
    fetch: accounts.fetch,
    openStore: options.wrap ? options.wrap(stores) : stores,
    connect: (handlers) => {
      const wire = fakeWire(handlers);
      wires.push(wire);
      return wire;
    },
  };
  const engine = await createEngine(env);
  return { engine, time, stores, server: accounts.server, wire: () => wires.at(-1)!, wires };
}

// A device with someone signed in. `head` is what the server says it has; undefined leaves it offline.
async function signedIn(options: Options & { head?: number | null } = {}) {
  const d = await device(options);
  assert.deepEqual(await d.engine.register('invite-code', 'ravi', 'correct horse'), { ok: true });
  if (options.head !== null) d.wire().welcome(options.head ?? 0);
  return d;
}

const title = (d: { engine: { rows: (dataset: string) => { value: ReadonlyMap<string, any> } } }, row = 't1') =>
  d.engine.rows('task').value.get(row)?.title;

// Every store write this device makes to its account database, in order.
function watching(log: Write[]): (open: OpenStore) => OpenStore {
  return (open) => async (name) => {
    const store = await open(name);
    return name === 'heirloom' ? store : { ...store, write: (write) => (log.push(write), store.write(write)) };
  };
}

// A store whose writes stop landing once `crash.now` is set: the process died mid-transaction.
function crashing(crash: { now: boolean }): (open: OpenStore) => OpenStore {
  return (open) => async (name) => {
    const store = await open(name);
    return { ...store, write: (write) => (crash.now ? new Promise<void>(() => {}) : store.write(write)) };
  };
}

describe('a local edit', () => {
  it('shows at once, before anything is saved or sent', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'Pointers chapter 3', estimate: 4 });
    assert.deepEqual(d.engine.rows('task').value.get('t1'), { id: 't1', title: 'Pointers chapter 3', estimate: 4 });
    assert.equal(d.engine.unsent.value, 2);
    assert.equal(d.wire().sent.length, 0);
  });

  it('is one store transaction: the cells, their outbox entries and the clock together', async () => {
    const log: Write[] = [];
    const d = await signedIn({ wrap: watching(log) });
    d.engine.write('task', 't1', { title: 'Pointers', estimate: 4 });
    await d.engine.saved();
    assert.equal(log.length, 1);
    const stamps = [`2026-11-24T04:30:00.000Z-0000-${d.engine.device}`, `2026-11-24T04:30:00.000Z-0001-${d.engine.device}`];
    assert.deepEqual(log[0], {
      cells: [
        { stamp: stamps[0], dataset: 'task', row: 't1', field: 'title', value: 'Pointers' },
        { stamp: stamps[1], dataset: 'task', row: 't1', field: 'estimate', value: 4 },
      ],
      outbox: [['task/t1/title', true], ['task/t1/estimate', true]],
      meta: { clock: { ms: T0, counter: 1 }, cursor: 0, offset: null },
    });
  });

  it('writes made in the same turn are one transaction, so a lap and its timer state cannot be torn apart', async () => {
    const log: Write[] = [];
    const d = await signedIn({ wrap: watching(log) });
    d.engine.write('session', 'run-1', { kind: 'work', outcome: 'rang' });
    d.engine.act({ do: 'start', phase: 'short', run: 'run-2', task: null, planned_ms: 300000 });
    await d.engine.saved();
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => `${c.dataset}/${c.field}`), ['session/kind', 'session/outcome', 'timer/state']);
  });

  it('is pushed once it is saved, oldest first, and the ack empties the outbox', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'Pointers' });
    d.engine.write('task', 't2', { title: 'Arrays' });
    await d.engine.saved();
    assert.equal(d.wire().sent.length, 1);
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => c.value), ['Pointers', 'Arrays']);
    d.wire().ack(0, 2);
    assert.equal(d.engine.unsent.value, 0);
  });

  it('is refused whole, with nothing changed, when the server could never store it', async () => {
    const d = await signedIn();
    assert.throws(() => d.engine.write('task', 'bad row', { title: 'x' }), /bad name/);
    assert.throws(() => d.engine.write('task', 't1', { title: 'fine', 'no/slash': 1 }), /bad name/);
    assert.throws(() => d.engine.write('task', 't1', { title: undefined }), /null/);
    assert.throws(() => d.engine.write('task', 't1', { notes: 'x'.repeat(17000) }), /16 KB/);
    await d.engine.saved();
    assert.deepEqual(d.engine.cells(), []);
    assert.equal(d.engine.unsent.value, 0);
    // The clock did not move either: the next stamp is the first.
    d.engine.write('task', 't1', { title: 'ok' });
    assert.match(d.engine.cells()[0]!.stamp, /Z-0000-/);
  });

  it('holds a copy of the value as JSON carries it, so the caller cannot change a cell after writing it', async () => {
    const d = await signedIn();
    const repeat = { every: 2, days: [1, 3], until: undefined as string | undefined };
    d.engine.write('task', 't1', { repeat });
    repeat.days.push(5);
    await d.engine.saved();
    assert.deepEqual(d.engine.rows('task').value.get('t1')?.repeat, { every: 2, days: [1, 3] });
    assert.deepEqual(d.wire().sent[0]!.cells[0]!.value, { every: 2, days: [1, 3] });
  });

  it('stamp() gives the stamp of the cell held for a field, and nothing for a field never written', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'x' });
    assert.equal(d.engine.stamp('task', 't1', 'title'), `2026-11-24T04:30:00.000Z-0000-${d.engine.device}`);
    d.wire().cells(0, 1, [theirs(30, 't1', 'title', 'theirs')]);
    assert.equal(d.engine.stamp('task', 't1', 'title'), `2026-11-24T04:30:30.000Z-0000-${OTHER}`);
    assert.equal(d.engine.stamp('task', 't1', 'notes'), undefined);
  });

  it('a write with a given stamp time: every cell stamped there, saved and sent like any edit, and the clock neither read nor moved', async () => {
    const log: Write[] = [];
    const d = await signedIn({ wrap: watching(log) });
    d.engine.write('task', 't1', { title: 'an ordinary edit' });
    d.time.advance(25 * 60000);
    // A row stamped in the past, and one stamped ahead of the clock.
    d.engine.write('session', 'run-1', { outcome: 'rang', ended: T0 + 1500000 }, T0);
    d.engine.write('session', 'run-2', { outcome: 'rang' }, T0 + 3600000);
    const me = d.engine.device;
    assert.equal(d.engine.stamp('session', 'run-1', 'outcome'), `2026-11-24T04:30:00.000Z-0000-${me}`);
    assert.equal(d.engine.stamp('session', 'run-1', 'ended'), `2026-11-24T04:30:00.000Z-0000-${me}`);
    assert.equal(d.engine.stamp('session', 'run-2', 'outcome'), `2026-11-24T05:30:00.000Z-0000-${me}`);
    assert.equal(d.engine.rows('session').value.get('run-1')?.outcome, 'rang');
    assert.equal(d.engine.unsent.value, 4);
    // The next ordinary edit is stamped at the wall time, as if those writes had not happened.
    d.engine.write('task', 't2', { title: 'the next ordinary edit' });
    assert.equal(d.engine.stamp('task', 't2', 'title'), `2026-11-24T04:55:00.000Z-0000-${me}`);
    await d.engine.saved();
    assert.deepEqual(log.at(-1)!.meta!.clock, { ms: T0 + 1500000, counter: 0 });
    assert.equal(log.at(-1)!.outbox!.filter(([key]) => key.startsWith('session/')).length, 3);
    assert.deepEqual(d.wire().sent.flatMap((push) => push.cells).map((c) => `${c.dataset}/${c.row}/${c.field}`).toSorted(), [
      'session/run-1/ended', 'session/run-1/outcome', 'session/run-2/outcome', 'task/t1/title', 'task/t2/title',
    ]);
    // And it all survives a restart, outbox included.
    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.engine.unsent.value, 5);
    assert.equal(again.engine.stamp('session', 'run-1', 'outcome'), `2026-11-24T04:30:00.000Z-0000-${me}`);
  });

  it('a write with a given stamp time loses to a newer cell already held: nothing changes, nothing is queued or saved', async () => {
    const log: Write[] = [];
    const d = await signedIn({ wrap: watching(log) });
    d.time.advance(60000);
    d.engine.write('session', 'run-1', { outcome: 'void' });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.saved();
    const writes = log.length;
    d.engine.write('session', 'run-1', { outcome: 'rang', ended: T0 + 1500000 }, T0);
    await d.engine.saved();
    assert.equal(d.engine.rows('session').value.get('run-1')?.outcome, 'void');
    // The field nobody had written is kept and sent. The one that lost is not.
    assert.equal(d.engine.unsent.value, 1);
    assert.deepEqual(log.at(-1)!.cells!.map((c) => c.field), ['ended']);
    assert.equal(log.length, writes + 1);
    d.engine.write('session', 'run-1', { outcome: 'rang' }, T0);
    await d.engine.saved();
    assert.equal(log.length, writes + 1);
  });

  it('throws when nobody is signed in: there is no account to write to', async () => {
    const d = await device();
    assert.throws(() => d.engine.write('task', 't1', { title: 'x' }), /sign in/);
  });
});

describe('the outbox', () => {
  it('survives a restart, and what was waiting is pushed with the stamp it was made with', async () => {
    const first = await signedIn({ head: null });
    first.engine.write('task', 't1', { title: 'made offline' });
    const made = first.engine.cells();
    await first.engine.stop();

    const second = await device({ stores: first.stores });
    assert.equal(second.engine.unsent.value, 1);
    assert.equal(title(second), 'made offline');
    assert.equal(second.wire().sent.length, 0);
    second.wire().welcome();
    assert.deepEqual(second.wire().sent[0]!.cells, made);
  });

  it('an edit made while offline is pushed on reconnect', async () => {
    const d = await signedIn();
    d.wire().handlers.down();
    assert.equal(d.engine.sync.value, 'offline');
    d.engine.write('task', 't1', { title: 'in the tunnel' });
    await d.engine.saved();
    assert.equal(d.wire().sent.length, 0);
    d.wire().welcome();
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => c.value), ['in the tunnel']);
  });

  it('a push still in the air at the next welcome is sent again, as a new batch with the same cells', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'lost on the way' });
    await d.engine.saved();
    d.wire().handlers.down();
    assert.equal(d.wire().sent.length, 1, 'nothing is sent into a dead connection');
    d.wire().welcome();
    assert.equal(d.wire().sent.length, 2);
    // A welcome with no drop before it: the transport moved from POST to the socket.
    d.wire().welcome();
    assert.equal(d.wire().sent.length, 3);
    assert.deepEqual(d.wire().sent[2]!.cells, d.wire().sent[0]!.cells);
    assert.equal(new Set(d.wire().sent.map((push) => push.batch)).size, 3);
    // The ack of an older batch is not the ack of this one.
    d.wire().ack(0, 1, d.wire().sent[0]!.batch);
    assert.equal(d.engine.unsent.value, 1);
    d.wire().ack(0, 1);
    assert.equal(d.engine.unsent.value, 0);
  });

  it('an ack removes exactly its batch: a field edited again since still waits', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'first' });
    await d.engine.saved();
    assert.equal(d.wire().sent.length, 1);
    // While that batch is in the air: the same field again, and another.
    d.engine.write('task', 't1', { title: 'second', estimate: 2 });
    await d.engine.saved();
    assert.equal(d.wire().sent.length, 1, 'one batch at a time');
    d.wire().ack(0, 1);
    assert.equal(d.engine.unsent.value, 2);
    await d.engine.saved();
    assert.deepEqual(d.wire().sent[1]!.cells.map((c) => c.value), ['second', 2]);
    // An ack for a batch this engine does not have in the air changes nothing.
    d.wire().ack(1, 3, 'someone-elses');
    assert.equal(d.engine.unsent.value, 2);
    d.wire().ack(1, 3);
    assert.equal(d.engine.unsent.value, 0);

    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.engine.unsent.value, 0);
    assert.equal(title(again), 'second');
  });

  it('an incoming cell with a lower stamp does not touch the unsent edit', async () => {
    const d = await signedIn({ head: null });
    d.time.advance(60000);
    d.engine.write('task', 't1', { title: 'mine, later' });
    d.wire().cells(0, 1, [theirs(30, 't1', 'title', 'theirs, earlier')]);
    assert.equal(title(d), 'mine, later');
    assert.equal(d.engine.unsent.value, 1);
    d.wire().welcome(1);
    await d.engine.saved();
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => c.value), ['mine, later']);
  });

  it('an incoming cell with a higher stamp replaces the unsent edit and takes it out of the outbox, for good', async () => {
    const d = await signedIn({ head: null });
    d.engine.write('task', 't1', { title: 'mine, earlier', estimate: 3 });
    d.wire().cells(0, 1, [theirs(30, 't1', 'title', 'theirs, later')]);
    assert.equal(title(d), 'theirs, later');
    assert.equal(d.engine.unsent.value, 1);
    d.wire().welcome(1);
    await d.engine.saved();
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => c.field), ['estimate']);

    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(title(again), 'theirs, later');
    assert.equal(again.engine.unsent.value, 1);
  });

  it('an edit made after seeing a value is stamped later than it, even when this clock is behind', async () => {
    const d = await signedIn();
    d.wire().cells(0, 1, [theirs(3600, 't1', 'title', 'from a device an hour ahead')]);
    d.engine.write('task', 't1', { title: 'typed after reading it' });
    assert.equal(title(d), 'typed after reading it');
    assert.equal(d.engine.cells()[0]!.stamp, `2026-11-24T05:30:00.000Z-0001-${d.engine.device}`);
  });

  it('pushes at most 500 cells at a time', async () => {
    const d = await signedIn();
    for (let i = 0; i < 501; i++) d.engine.write('task', `t${i}`, { title: `task ${i}` });
    await d.engine.saved();
    assert.equal(d.wire().sent[0]!.cells.length, 500);
    d.wire().ack(0, 500);
    await d.engine.saved();
    assert.deepEqual(d.wire().sent[1]!.cells.map((c) => c.value), ['task 500']);
  });

  it('keeps a push under the 1 MB frame even when every cell is large', async () => {
    const d = await signedIn();
    for (let i = 0; i < 100; i++) d.engine.write('task', `t${i}`, { notes: 'n'.repeat(15000) });
    await d.engine.saved();
    const size = JSON.stringify(d.wire().sent[0]).length;
    assert.ok(size < 1024 * 1024, `${size} bytes`);
    assert.ok(d.wire().sent[0]!.cells.length > 50);
  });

  it('a cell the server calls invalid is found one push at a time, kept, and no longer blocks the rest', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'fine', notes: 'the server dislikes this one' });
    await d.engine.saved();
    const nack = () => d.wire().handlers.message({ type: 'nack', batch: d.wire().sent.at(-1)!.batch, reason: 'invalid', server_time: 0 });
    nack();
    assert.deepEqual(d.wire().sent.at(-1)!.cells.map((c) => c.field), ['title']);
    d.wire().ack(0, 1);
    await d.engine.saved();
    assert.deepEqual(d.wire().sent.at(-1)!.cells.map((c) => c.field), ['notes']);
    nack();
    const pushes = d.wire().sent.length;
    d.engine.write('task', 't2', { title: 'behind it' });
    await d.engine.saved();
    assert.deepEqual(d.wire().sent.at(-1)!.cells.map((c) => c.value), ['behind it']);
    assert.equal(d.wire().sent.length, pushes + 1);
    d.wire().ack(1, 2);
    // Still held and still counted: it is tried again at the next start.
    assert.equal(d.engine.unsent.value, 1);
    assert.equal(d.engine.rows('task').value.get('t1')?.notes, 'the server dislikes this one');
    // The one cell was found, so the rest go together again: three edits, one push.
    d.engine.write('task', 't3', { title: 'a', notes: 'b', estimate: 3 });
    await d.engine.saved();
    assert.equal(d.wire().sent.at(-1)!.cells.length, 3);
  });

  it('a new connection starts over: after a welcome the batch is tried whole again, not a cell at a time', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'one', notes: 'two' });
    await d.engine.saved();
    d.wire().handlers.message({ type: 'nack', batch: d.wire().sent.at(-1)!.batch, reason: 'invalid', server_time: 0 });
    assert.equal(d.wire().sent.at(-1)!.cells.length, 1);
    d.wire().handlers.down();
    d.wire().welcome();
    assert.equal(d.wire().sent.at(-1)!.cells.length, 2);
  });
});

describe('the restamp after a clock nack', () => {
  it('sets the offset, restarts the clock from what the server has, and stamps the unsent again in the order made', async () => {
    // This device's clock is ten minutes fast and it has never been told.
    const d = await signedIn({ startAt: T0 + 600000 });
    // Another device's cell, two minutes ahead of the server: allowed, and it must still come first.
    d.wire().cells(0, 1, [theirs(120, 't0', 'title', 'already on the server')]);
    d.engine.write('task', 't1', { title: 'first' });
    d.engine.write('task', 't2', { title: 'second' });
    d.engine.write('task', 't1', { title: 'first, edited' });
    await d.engine.saved();
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => c.stamp.slice(0, 29)), [
      '2026-11-24T04:40:00.000Z-0001',
      '2026-11-24T04:40:00.000Z-0002',
    ]);

    d.wire().handlers.message({ type: 'nack', batch: d.wire().sent[0]!.batch, reason: 'clock', server_time: T0 });
    assert.equal(d.engine.now(), T0);
    await d.engine.saved();
    const me = d.engine.device;
    const expected = [
      { stamp: `2026-11-24T04:32:00.000Z-0001-${me}`, dataset: 'task', row: 't2', field: 'title', value: 'second' },
      { stamp: `2026-11-24T04:32:00.000Z-0002-${me}`, dataset: 'task', row: 't1', field: 'title', value: 'first, edited' },
    ];
    assert.deepEqual(d.wire().sent[1]!.cells, expected);
    // The old, higher stamps are gone from the store: replaced, not merged.
    assert.deepEqual(d.engine.cells().filter((c) => c.row !== 't0').toSorted((a, b) => (a.stamp < b.stamp ? -1 : 1)), expected);
    assert.equal(d.engine.unsent.value, 2);

    // The next edit follows on, and all of it was saved: a restart changes nothing.
    d.engine.write('task', 't3', { title: 'third' });
    assert.equal(d.engine.cells().find((c) => c.row === 't3')!.stamp, `2026-11-24T04:32:00.000Z-0003-${me}`);
    await d.engine.stop();
    const again = await device({ stores: d.stores, startAt: d.time.now() });
    assert.equal(again.engine.now(), T0);
    assert.deepEqual(again.engine.cells().filter((c) => c.row === 't1' || c.row === 't2').toSorted((a, b) => (a.stamp < b.stamp ? -1 : 1)), expected);
    again.engine.write('task', 't4', { title: 'fourth' });
    assert.equal(again.engine.cells().find((c) => c.row === 't4')!.stamp, `2026-11-24T04:32:00.000Z-0004-${me}`);
  });
});

describe('the cursor', () => {
  it('moves to a cells frame\'s `to`, never backwards, and is saved with the cells it covers', async () => {
    const log: Write[] = [];
    const d = await signedIn({ head: 5, wrap: watching(log) });
    assert.equal(d.engine.sync.value, 'syncing');
    d.wire().cells(0, 5, [theirs(1, 't1', 'title', 'one'), theirs(2, 't2', 'title', 'two')]);
    assert.equal(d.wire().handlers.hello().cursor, 5);
    assert.equal(d.engine.sync.value, 'in-step');
    d.wire().cells(2, 3, [theirs(1, 't1', 'title', 'one')]);
    assert.equal(d.wire().handlers.hello().cursor, 5);
    await d.engine.saved();
    assert.equal(log[0]!.cells!.length, 2);
    assert.equal(log[0]!.meta!.cursor, 5);

    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.wire().handlers.hello().cursor, 5);
    assert.equal(title(again, 't2'), 'two');
  });

  it('an ack moves it only when its `from` is where the cursor stands', async () => {
    const d = await signedIn({ head: 10 });
    d.wire().cells(0, 10, []);
    d.engine.write('task', 't1', { title: 'a' });
    await d.engine.saved();
    d.wire().ack(10, 11);
    assert.equal(d.wire().handlers.hello().cursor, 11);

    // Another device's cells took 12 and 13 before ours took 14, and their frame has not come yet.
    d.engine.write('task', 't1', { title: 'b' });
    await d.engine.saved();
    d.wire().ack(13, 14);
    assert.equal(d.wire().handlers.hello().cursor, 11);
    assert.equal(d.engine.unsent.value, 0, 'the ack still empties the outbox');
    await d.engine.saved();

    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.wire().handlers.hello().cursor, 11);
  });

  it('a cells frame from past the cursor is not applied: the engine asks to say hello again', async () => {
    const d = await signedIn({ head: 5 });
    d.wire().cells(0, 5, []);
    d.wire().cells(8, 9, [theirs(1, 't1', 'title', 'after a gap')]);
    assert.equal(d.wire().agains, 1);
    assert.equal(d.wire().handlers.hello().cursor, 5);
    assert.equal(title(d), undefined);
    assert.equal(d.engine.sync.value, 'syncing');
    // The server answers the new hello with everything after 5.
    d.wire().welcome(9);
    d.wire().cells(5, 9, [theirs(0, 't0', 'title', 'the missed one'), theirs(1, 't1', 'title', 'after a gap')]);
    assert.equal(title(d, 't0'), 'the missed one');
    assert.equal(d.engine.sync.value, 'in-step');
  });

  it('does not push until it has caught up, so a newer cell can still beat an old unsent edit first', async () => {
    const d = await signedIn({ head: null });
    d.engine.write('task', 't1', { title: 'three weeks old' });
    await d.engine.saved();
    d.wire().welcome(700);
    d.wire().cells(0, 500, []);
    await d.engine.saved();
    assert.equal(d.wire().sent.length, 0);
    d.wire().cells(500, 700, [theirs(30, 't1', 'title', 'written since')]);
    await d.engine.saved();
    assert.equal(d.wire().sent.length, 0);
    assert.equal(d.engine.sync.value, 'in-step');
  });
});

describe('a crash, then a restart', () => {
  it('in the middle of saving a local edit: the edit is wholly absent, never half there, and was never sent', async () => {
    const crash = { now: false };
    const d = await signedIn({ wrap: crashing(crash) });
    d.engine.write('task', 't0', { title: 'saved before' });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.saved();

    crash.now = true;
    d.engine.write('task', 't1', { title: 'the power went', estimate: 2 });
    await settle();
    // Even a fresh welcome, which sends everything waiting, does not send what is not on disk yet.
    d.wire().welcome(1);
    assert.equal(d.wire().sent.length, 1, 'not pushed before it is on disk');

    const again = await device({ stores: d.stores });
    assert.deepEqual(again.engine.cells().map((c) => c.value), ['saved before']);
    assert.equal(again.engine.unsent.value, 0);
    // The clock is where the last saved write left it, so the next stamp cannot repeat one the server holds.
    again.time.advance(1);
    again.engine.write('task', 't2', { title: 'after' });
    assert.ok(again.engine.cells().every((c, i, all) => all.findIndex((x) => x.stamp === c.stamp) === i));
  });

  it('after the push but before the ack is saved: the cell is pushed again with the same stamp, which the server takes as the same cell', async () => {
    const crash = { now: false };
    const d = await signedIn({ wrap: crashing(crash) });
    d.engine.write('task', 't1', { title: 'sent, ack lost' });
    await d.engine.saved();
    const pushed = d.wire().sent[0]!.cells;
    crash.now = true;
    d.wire().ack(0, 1);
    await settle();

    const again = await device({ stores: d.stores });
    assert.equal(again.engine.unsent.value, 1);
    assert.equal(again.wire().handlers.hello().cursor, 0);
    again.wire().welcome(1);
    // The server sends our own cell back, since our cursor never moved. Applying it changes nothing.
    again.wire().cells(0, 1, pushed);
    await again.engine.saved();
    assert.deepEqual(again.wire().sent[0]!.cells, pushed);
    again.wire().ack(1, 1);
    assert.equal(again.engine.unsent.value, 0);
    assert.equal(again.engine.cells().length, 1);
  });

  it('in the middle of saving incoming cells: neither the cells nor the cursor moved, so the server sends them again', async () => {
    const crash = { now: false };
    const d = await signedIn({ head: null, wrap: crashing(crash) });
    d.engine.write('task', 't1', { title: 'mine, unsent' });
    await d.engine.saved();

    crash.now = true;
    d.wire().welcome(2);
    const incoming = [theirs(30, 't1', 'title', 'theirs, later'), theirs(31, 't2', 'title', 'another')];
    d.wire().cells(0, 2, incoming);
    await settle();

    const again = await device({ stores: d.stores });
    assert.equal(again.wire().handlers.hello().cursor, 0);
    assert.equal(title(again), 'mine, unsent');
    assert.equal(again.engine.unsent.value, 1);
    again.wire().welcome(2);
    again.wire().cells(0, 2, incoming);
    await again.engine.saved();
    assert.equal(title(again), 'theirs, later');
    assert.equal(title(again, 't2'), 'another');
    assert.equal(again.engine.unsent.value, 0);
    assert.equal(again.wire().sent.length, 0);
    assert.equal(again.wire().handlers.hello().cursor, 2);
  });

  it('a write the store refuses is kept, still pushed, and saved when the store works again', async () => {
    const broken = { now: false };
    const wrap = (open: OpenStore): OpenStore => async (name) => {
      const store = await open(name);
      return { ...store, write: (write) => (broken.now ? Promise.reject(new Error('disk full')) : store.write(write)) };
    };
    const d = await signedIn({ wrap });
    assert.equal(d.engine.unsaved.value, false);
    broken.now = true;
    d.engine.write('task', 't1', { title: 'the disk was full' });
    // saved() does not say saved when it is not.
    await assert.rejects(d.engine.saved(), /refused/);
    assert.equal(d.engine.unsaved.value, true, 'the indicator can say: could not save on this device');
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => c.value), ['the disk was full']);
    // Still refusing at the next try: still true.
    d.time.advance(5000);
    await assert.rejects(d.engine.saved(), /refused/);
    assert.equal(d.engine.unsaved.value, true);
    broken.now = false;
    d.time.advance(5000);
    await d.engine.saved();
    assert.equal(d.engine.unsaved.value, false);
    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(title(again), 'the disk was full');
    assert.equal(again.engine.unsent.value, 1);
  });

  // A store that refuses writes while `broken.now` is set.
  const breakable = (broken: { now: boolean }) => (open: OpenStore): OpenStore => async (name) => {
    const store = await open(name);
    return { ...store, write: (write) => (broken.now ? Promise.reject(new Error('disk full')) : store.write(write)) };
  };

  it('closing after a refused write tries it once more: an edit that can be saved by then is saved, not dropped', async () => {
    const broken = { now: false };
    const d = await signedIn({ head: null, wrap: breakable(broken) });
    broken.now = true;
    d.engine.write('task', 't1', { title: 'refused, then the disk had room' });
    await assert.rejects(d.engine.saved());
    // The store works again, and the app is closed before the five second retry comes round.
    broken.now = false;
    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(title(again), 'refused, then the disk had room');
    assert.equal(again.engine.unsent.value, 1);
  });

  it('closing while the store still refuses unsent edits is not done quietly: stop() closes and says what was lost', async () => {
    const broken = { now: false };
    const d = await signedIn({ head: null, wrap: breakable(broken) });
    d.engine.write('task', 't0', { title: 'saved' });
    await d.engine.saved();
    broken.now = true;
    d.engine.write('task', 't1', { title: 'never saved, never sent' });
    await assert.rejects(d.engine.stop(), /2 unsent edits the store refused/);
    const again = await device({ stores: d.stores });
    assert.deepEqual(again.engine.cells().map((c) => c.value), ['saved']);
  });

  it('closing while the store refuses is quiet when the server has everything: nothing is lost', async () => {
    const broken = { now: false };
    const d = await signedIn({ wrap: breakable(broken) });
    broken.now = true;
    d.engine.write('task', 't1', { title: 'sent and acked, not saved' });
    await assert.rejects(d.engine.saved());
    d.wire().ack(0, 1);
    await d.engine.stop();
  });

  it('signing in as someone else is refused while unsent edits of the account here cannot be saved, before the server is asked', async () => {
    const broken = { now: false };
    const d = await signedIn({ head: null, wrap: breakable(broken) });
    broken.now = true;
    d.engine.write('task', 't1', { title: 'held in memory only' });
    const calls = d.server.calls.length;
    assert.deepEqual(await d.engine.signIn('nimal', 'another password'), { ok: false, error: 'unsaved' });
    assert.equal(d.server.calls.length, calls, 'a new token would have cut this account off');
    assert.equal(d.engine.account.value?.username, 'ravi');
    assert.equal(title(d), 'held in memory only');
    // Once it can be saved, it is, and then the other account may come in.
    broken.now = false;
    assert.deepEqual(await d.engine.signIn('nimal', 'another password'), { ok: true });
    assert.equal((await (await d.stores('heirloom-acct-ravi')).load()).cells.length, 1);
  });

  it('the account database deleted from another tab, with nothing unsent here: this engine is signed out too, and does not go on writing into nothing', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'before' });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.saved();
    const wire = d.wire();
    await (await d.stores('heirloom-acct-ravi')).destroy();
    // The next thing to save is a cell from the server: nothing of ours is at stake.
    d.wire().cells(1, 2, [theirs(60, 't2', 'title', 'from another device')]);
    await d.engine.saved();
    assert.equal(d.engine.account.value, null);
    assert.equal(d.engine.sync.value, 'signed-out');
    assert.equal(d.engine.unsaved.value, false);
    assert.equal(wire.running, false);
    assert.deepEqual(d.engine.cells(), []);
    assert.throws(() => d.engine.write('task', 't3', { title: 'x' }), /sign in/);
    // No retry is left ticking.
    assert.equal(d.time.waiting(), 0);
  });

  it('the account database deleted from another tab while this one holds an unsent lap: the lap is written back, kept, and sent at the next sign in', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'sent long ago' });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.saved();
    // Offline, a lap ends here. Then the other tab signs out and deletes the database.
    d.wire().handlers.down();
    d.engine.write('session', 'run-1', { kind: 'work', outcome: 'rang' });
    await d.engine.saved();
    await (await d.stores('heirloom-acct-ravi')).destroy();
    d.engine.write('task', 't2', { title: 'typed in the tab that did not know' });
    await d.engine.saved();

    assert.equal(d.engine.account.value?.username, 'ravi');
    assert.equal(d.engine.unsent.value, 3);
    assert.equal(d.engine.unsaved.value, false);
    assert.equal(d.engine.rows('session').value.get('run-1')?.outcome, 'rang');
    // On the disk again: what the server never got, and nothing else of the account.
    const disk = await (await d.stores('heirloom-acct-ravi')).load();
    assert.deepEqual(disk.cells.map((c) => `${c.row}/${c.field}`).toSorted(), ['run-1/kind', 'run-1/outcome', 't2/title']);
    assert.equal(disk.outbox.length, 3);
    assert.equal(disk.meta.cursor, 0, 'so the rest is asked for again');
    // Later writes land in the new database like any other.
    d.engine.write('task', 't3', { title: 'and one more' });
    await d.engine.saved();
    assert.equal((await (await d.stores('heirloom-acct-ravi')).load()).cells.length, 4);

    // The app is opened again and the person signs in: the lap goes to the server.
    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.engine.unsent.value, 4);
    assert.equal(again.wire().handlers.hello().cursor, 0);
    again.wire().welcome();
    assert.deepEqual(again.wire().sent[0]!.cells.map((c) => c.row).toSorted(), ['run-1', 'run-1', 't2', 't3']);
  });
});

describe('a server restored from an older copy', () => {
  it('a welcome with a head below our cursor: the cursor goes to 0 and every cell held is sent again, ours and theirs', async () => {
    const d = await signedIn({ head: 2 });
    d.wire().cells(0, 2, [theirs(1, 't1', 'title', 'from another device'), theirs(2, 't2', 'title', 'the server will lose this one')]);
    d.engine.write('task', 't3', { title: 'ours, acked long ago' });
    await d.engine.saved();
    d.wire().ack(2, 3);
    await d.engine.saved();
    assert.equal(d.wire().handlers.hello().cursor, 3);
    assert.equal(d.engine.sync.value, 'in-step');
    const held = d.engine.cells();

    // The server comes back from last night's copy: it has one cell.
    d.wire().handlers.down();
    const pushes = d.wire().sent.length;
    d.wire().welcome(1);
    assert.equal(d.wire().handlers.hello().cursor, 0);
    assert.equal(d.engine.unsent.value, 3);
    assert.equal(d.engine.sync.value, 'syncing');
    assert.equal(d.wire().sent.length, pushes, 'it listens first: the server sends what it has from 0');
    d.wire().cells(0, 1, [theirs(1, 't1', 'title', 'from another device')]);
    await d.engine.saved();
    const push = d.wire().sent.at(-1)!;
    assert.deepEqual(push.cells.toSorted((a, b) => (a.stamp < b.stamp ? -1 : 1)), held.toSorted((a, b) => (a.stamp < b.stamp ? -1 : 1)));
    d.wire().ack(1, 3);
    assert.equal(d.engine.sync.value, 'in-step');
    assert.deepEqual(d.engine.cells(), held, 'nothing here changed: the same cells, the same stamps');
  });

  it('what it decided survives a restart in the middle: the cursor at 0 and the outbox full', async () => {
    const d = await signedIn({ head: 2 });
    d.wire().cells(0, 2, [theirs(1, 't1', 'title', 'one'), theirs(2, 't2', 'title', 'two')]);
    await d.engine.saved();
    d.wire().handlers.down();
    d.wire().welcome(0);
    await d.engine.saved();
    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.wire().handlers.hello().cursor, 0);
    assert.equal(again.engine.unsent.value, 2);
  });

  it('a head at or past our cursor is the ordinary case: nothing is sent again', async () => {
    const d = await signedIn({ head: 2 });
    d.wire().cells(0, 2, [theirs(1, 't1', 'title', 'one'), theirs(2, 't2', 'title', 'two')]);
    d.wire().handlers.down();
    d.wire().welcome(2);
    assert.equal(d.engine.unsent.value, 0);
    assert.equal(d.wire().handlers.hello().cursor, 2);
  });
});

describe('what the UI reads', () => {
  it('sync state: signed out, offline, syncing, in step', async () => {
    const d = await device();
    assert.equal(d.engine.sync.value, 'signed-out');
    await d.engine.register('invite-code', 'ravi', 'correct horse');
    assert.equal(d.engine.sync.value, 'offline');
    d.wire().welcome(3);
    assert.equal(d.engine.sync.value, 'syncing');
    d.wire().cells(0, 3, []);
    assert.equal(d.engine.sync.value, 'in-step');
    d.engine.write('task', 't1', { title: 'x' });
    assert.equal(d.engine.sync.value, 'syncing');
    await d.engine.saved();
    d.wire().ack(3, 4);
    assert.equal(d.engine.sync.value, 'in-step');
    d.wire().handlers.down();
    assert.equal(d.engine.sync.value, 'offline');
  });

  it('rows of a dataset: one signal per dataset, changed by local and incoming cells, untouched by other datasets', async () => {
    const d = await signedIn();
    const tasks = d.engine.rows('task');
    const habits = d.engine.rows('habit');
    assert.equal(d.engine.rows('task'), tasks);
    const habitsBefore = habits.value;
    let seen = 0;
    const stop = tasks.subscribe(() => seen++);
    d.engine.write('task', 't1', { title: 'local' });
    d.wire().cells(0, 2, [theirs(5, 't2', 'title', 'incoming'), theirs(6, 't1', 'estimate', 3)]);
    stop();
    assert.equal(seen, 3, 'once on subscribe, once per change');
    assert.deepEqual([...tasks.value.values()], [
      { id: 't1', title: 'local', estimate: 3 },
      { id: 't2', title: 'incoming' },
    ]);
    assert.equal(habits.value, habitsBefore);
  });

  it('datasets and fields this build does not know are kept, shown and sent on', async () => {
    const d = await signedIn();
    d.wire().cells(0, 2, [theirs(1, 'mood-1124', 'level', 3, 'mood'), theirs(2, 't1', 'energy', 'low')]);
    d.engine.write('mood', 'mood-1125', { level: 4 });
    await d.engine.saved();
    assert.deepEqual(d.engine.rows('mood').value.get('mood-1124'), { id: 'mood-1124', level: 3 });
    assert.equal(d.engine.rows('task').value.get('t1')?.energy, 'low');
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => `${c.dataset}/${c.field}`), ['mood/level']);
    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.engine.cells().length, 3);
  });

  it('the timer: idle until there is a cell, an action writes the whole state as one cell, a no-op writes nothing', async () => {
    const d = await signedIn();
    assert.equal(d.engine.timer.value.phase, 'idle');
    d.engine.act({ do: 'pause' });
    assert.equal(d.engine.unsent.value, 0);
    d.engine.act({ do: 'start', phase: 'work', run: 'run-1', task: 't1', planned_ms: 1500000 });
    d.time.advance(60000);
    d.engine.act({ do: 'pause' });
    const state = { phase: 'work', run: 'run-1', task: 't1', started: T0, paused_at: T0 + 60000, paused_ms: 0, planned_ms: 1500000, set_index: 0 };
    assert.deepEqual(d.engine.timer.value, state);
    assert.equal(d.engine.unsent.value, 1);
    assert.deepEqual(d.engine.cells().map((c) => [c.dataset, c.row, c.field, c.value]), [['timer', 'current', 'state', state]]);
    // Another device stops it: the newer state arrives whole.
    d.wire().cells(0, 1, [theirs(120, 'current', 'state', { ...state, phase: 'idle', run: null, task: null, started: null, paused_at: null, planned_ms: 0 }, 'timer')]);
    assert.equal(d.engine.timer.value.phase, 'idle');
  });

  it('now() is the device clock plus the measured offset, smoothed', async () => {
    const d = await signedIn();
    assert.equal(d.engine.now(), T0);
    d.wire().handlers.time(800);
    assert.equal(d.engine.now(), T0 + 800);
    d.wire().handlers.time(840);
    assert.equal(d.engine.now(), T0 + 810);
    d.engine.write('task', 't1', { title: 'stamped in server time' });
    assert.match(d.engine.cells()[0]!.stamp, /^2026-11-24T04:30:00\.810Z/);
    // The smoothed offset is now 810.75. That fraction never reaches a timer state or a row: the schemas say integer.
    d.wire().handlers.time(813);
    assert.equal(d.engine.now(), T0 + 811);
    d.engine.act({ do: 'start', phase: 'work', run: 'run-1', task: null, planned_ms: 1500000 });
    assert.equal(d.engine.timer.value.started, T0 + 811);
  });
});

describe('accounts', () => {
  it('register and sign in send the device id, and the session survives a restart', async () => {
    const d = await device();
    assert.equal(d.engine.account.value, null);
    assert.match(d.engine.device, /^[0-9a-f]{16}$/);
    assert.deepEqual(await d.engine.register('invite-code', 'ravi', 'correct horse'), { ok: true });
    assert.equal(d.server.calls[0]?.path, '/api/register');
    assert.deepEqual(d.server.calls[0]?.body, { invite: 'invite-code', username: 'ravi', password: 'correct horse', device: d.engine.device });
    assert.deepEqual(d.engine.account.value, { account: 'acct-ravi', username: 'ravi' });
    assert.equal(d.wire().running, true);
    assert.equal(d.wire().handlers.hello().token, 'token-of-ravi');

    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.deepEqual(again.engine.account.value, { account: 'acct-ravi', username: 'ravi' });
    assert.equal(again.engine.device, d.engine.device);
    assert.equal(again.wire().handlers.hello().token, 'token-of-ravi');
  });

  it('errors come back as the server\'s code, and an unreachable server as offline', async () => {
    const d = await device();
    d.server.fail = { status: 409, error: 'taken' };
    assert.deepEqual(await d.engine.register('invite-code', 'ravi', 'correct horse'), { ok: false, error: 'taken' });
    d.server.fail = { status: 429, error: 'slow_down', retryAfter: '840' };
    assert.deepEqual(await d.engine.signIn('ravi', 'wrong'), { ok: false, error: 'slow_down', retry_after: 840 });
    d.server.reachable = false;
    assert.deepEqual(await d.engine.signIn('ravi', 'correct horse'), { ok: false, error: 'offline' });
    assert.equal(d.engine.account.value, null);
    assert.equal(d.engine.sync.value, 'signed-out');
  });

  it('sign out is refused while offline with unsent work, and nothing is touched', async () => {
    const d = await signedIn();
    d.wire().handlers.down();
    d.engine.write('session', 'run-1', { kind: 'work', outcome: 'rang' });
    assert.deepEqual(await d.engine.signOut(), { ok: false, error: 'unsent' });
    assert.deepEqual(d.engine.account.value, { account: 'acct-ravi', username: 'ravi' });
    assert.equal(d.engine.unsent.value, 2);
    assert.equal(d.server.calls.some((c) => c.path === '/api/logout'), false);
  });

  it('sign out waits for the outbox to empty, then tells the server and forgets the token', async () => {
    const d = await signedIn();
    d.engine.write('session', 'run-1', { kind: 'work', outcome: 'rang' });
    await d.engine.saved();
    const leaving = d.engine.signOut();
    await settle();
    assert.equal(d.engine.account.value?.username, 'ravi', 'still waiting for the ack');
    const wire = d.wire();
    wire.ack(0, 2);
    assert.deepEqual(await leaving, { ok: true });
    assert.equal(d.server.calls.at(-1)?.path, '/api/logout');
    assert.deepEqual(d.server.calls.at(-1)?.body, { token: 'token-of-ravi' });
    assert.equal(d.engine.account.value, null);
    assert.equal(d.engine.sync.value, 'signed-out');
    assert.equal(wire.running, false);
    assert.deepEqual([...d.engine.rows('session').value], []);

    await d.engine.stop();
    const again = await device({ stores: d.stores });
    assert.equal(again.engine.account.value, null);
    assert.equal(again.engine.device, d.engine.device, 'the device id outlives the sign out');
  });

  it('a write made while the server is being told of the sign out is refused, never taken and then deleted with the database', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'sent' });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.saved();
    let release = () => {};
    d.server.logoutWaits = new Promise((resolve) => (release = resolve));
    const leaving = d.engine.signOut();
    await settle();
    assert.equal(d.server.calls.at(-1)?.path, '/api/logout', 'the request is on its way');
    // The bell falls due, or a thumb lands on stop. There is no account to write to any more,
    // and saying so is the honest answer: the timer is on the server, untouched.
    assert.throws(() => d.engine.write('session', 'run-1', { outcome: 'rang' }), /sign in/);
    assert.deepEqual([...d.engine.rows('task').value], []);
    // And the screen is not left with a name over an empty account while the request is out.
    assert.equal(d.engine.account.value, null);
    assert.equal(d.engine.sync.value, 'signed-out');
    release();
    assert.deepEqual(await leaving, { ok: true });
    assert.equal(d.engine.account.value, null);
  });

  it('a logout the server never answers is given five seconds and then cancelled: the sign out finishes without it', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'sent' });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.saved();
    d.server.logoutWaits = new Promise(() => {});
    let finished: unknown;
    void d.engine.signOut().then((result) => (finished = result));
    await settle();
    const logout = d.server.calls.at(-1)!;
    assert.equal(logout.path, '/api/logout');
    assert.equal(d.engine.account.value, null);
    d.time.advance(4999);
    await settle();
    assert.equal(finished, undefined);
    assert.equal(logout.signal?.aborted, false);
    d.time.advance(1);
    await settle();
    assert.deepEqual(finished, { ok: true });
    assert.equal(logout.signal?.aborted, true);
    assert.deepEqual(await (await d.stores('heirloom-acct-ravi')).load(), { cells: [], outbox: [], meta: {} });
    // The next sign in is not kept waiting behind it.
    assert.deepEqual(await d.engine.signIn('ravi', 'correct horse'), { ok: true });
  });

  it('a sign in the server never answers is given twenty seconds, cancelled, and reported as offline', async () => {
    const d = await device();
    const hung: Fetch = (_url, init) => {
      d.server.calls.push({ path: '/api/login', body: {}, signal: init.signal });
      return new Promise(() => {});
    };
    const engine = await createEngine({
      url: 'https://heirloom.test',
      now: d.time.now,
      schedule: d.time.schedule,
      random: () => 0.5,
      WebSocket: fakeSockets().FakeSocket,
      fetch: hung,
      openStore: memoryStores(),
    });
    const answer = engine.signIn('ravi', 'correct horse');
    await settle();
    d.time.advance(20000);
    assert.deepEqual(await answer, { ok: false, error: 'offline' });
    assert.equal(d.server.calls.at(-1)?.signal?.aborted, true);
  });

  it('an edit that lands just as the outbox empties stops the sign out: still signed in, the server not told, the edit kept', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'first' });
    await d.engine.saved();
    const leaving = d.engine.signOut();
    await settle();
    d.wire().ack(0, 1);
    d.engine.write('session', 'run-1', { outcome: 'rang' });
    assert.deepEqual(await leaving, { ok: false, error: 'unsent' });
    assert.equal(d.engine.account.value?.username, 'ravi');
    assert.equal(d.server.calls.some((c) => c.path === '/api/logout'), false);
    assert.equal(d.engine.rows('session').value.get('run-1')?.outcome, 'rang');
    assert.equal(d.wire().running, true);
    // It is sent like any other, and then the sign out goes through.
    await d.engine.saved();
    d.wire().ack(1, 2);
    assert.deepEqual(await d.engine.signOut(), { ok: true });
  });

  it('sign out gives up after ten seconds if the edits will not go', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'the server never acks' });
    await d.engine.saved();
    const leaving = d.engine.signOut();
    await settle();
    d.time.advance(10000);
    assert.deepEqual(await leaving, { ok: false, error: 'unsent' });
  });

  it('each account has its own database: signing in as someone else shows none of the first one\'s rows', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: "ravi's" });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.signOut();
    await d.engine.signIn('nimal', 'another password');
    assert.equal(d.engine.account.value?.account, 'acct-nimal');
    assert.equal(title(d), undefined);
    assert.equal(d.wire().handlers.hello().cursor, 0);
  });

  it('sign out deletes that account\'s database from the device: signing in again starts from nothing and asks the server for it all', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: "ravi's, on a shared laptop" });
    await d.engine.saved();
    d.wire().ack(0, 1);
    await d.engine.saved();
    assert.deepEqual(await d.engine.signOut(), { ok: true });
    // Straight from the disk: nothing of the account is left there.
    assert.deepEqual(await (await d.stores('heirloom-acct-ravi')).load(), { cells: [], outbox: [], meta: {} });
    await d.engine.signIn('ravi', 'correct horse');
    assert.equal(title(d), undefined);
    assert.equal(d.wire().handlers.hello().cursor, 0);
    assert.equal(d.engine.unsent.value, 0);
  });

  it('a refused sign out deletes nothing', async () => {
    const d = await signedIn();
    d.wire().handlers.down();
    d.engine.write('task', 't1', { title: 'not sent yet' });
    await d.engine.saved();
    assert.deepEqual(await d.engine.signOut(), { ok: false, error: 'unsent' });
    assert.equal((await (await d.stores('heirloom-acct-ravi')).load()).cells.length, 1);
    assert.equal(title(d), 'not sent yet');
  });

  it('bye token: signed out, the wire stopped, the data and the outbox kept, and signing in again sends it', async () => {
    const d = await signedIn();
    d.engine.write('task', 't1', { title: 'unsent when the token died' });
    await d.engine.saved();
    const wire = d.wire();
    wire.handlers.message({ type: 'bye', reason: 'token' });
    assert.equal(d.engine.sync.value, 'signed-out');
    assert.equal(wire.running, false);
    assert.equal(d.engine.account.value?.username, 'ravi');
    assert.equal(title(d), 'unsent when the token died');
    assert.equal(d.engine.unsent.value, 1);
    // Work goes on, and is kept.
    d.engine.write('task', 't2', { title: 'made while signed out' });
    assert.deepEqual(await d.engine.signOut(), { ok: false, error: 'unsent' });

    assert.deepEqual(await d.engine.signIn('ravi', 'correct horse'), { ok: true });
    assert.equal(d.engine.sync.value, 'offline');
    assert.equal(d.engine.unsent.value, 2);
    d.wire().welcome();
    assert.deepEqual(d.wire().sent[0]!.cells.map((c) => c.value), ['unsent when the token died', 'made while signed out']);
    // Through all of it the database stayed: a bye is not a sign out.
    assert.equal((await (await d.stores('heirloom-acct-ravi')).load()).cells.length, 2);
  });

  it('a bye for any other reason is left to the transport: the engine stays signed in', async () => {
    const d = await signedIn();
    d.wire().handlers.message({ type: 'bye', reason: 'protocol' });
    assert.equal(d.engine.sync.value, 'in-step');
    assert.equal(d.wire().running, true);
  });
});

describe('the engine over the real transport', () => {
  // A server in a few lines: it numbers what it accepts and answers POST /api/sync as protocol section 5 says.
  function tinyServer() {
    const log: Cell[] = [];
    const fetch: Fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      const path = new URL(url).pathname;
      let reply: object = {};
      if (path === '/api/register') reply = { token: 'tok', account: 'acct', username: body.username };
      if (path === '/api/sync') {
        const from = log.length;
        if (body.push) log.push(...body.push.cells);
        reply = {
          server_time: T0,
          head: log.length,
          from: body.cursor,
          to: log.length,
          cells: log.slice(body.cursor),
          ...(body.push && { ack: { batch: body.push.batch, from, cursor: log.length } }),
        };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => reply };
    };
    return { log, fetch };
  }

  it('after a gap the engine asks for a new hello and shows offline until one is answered, not syncing on a socket that may never open', async () => {
    const time = fakeTime();
    const sockets = fakeSockets();
    const engine = await createEngine({
      url: 'https://heirloom.test',
      now: time.now,
      schedule: time.schedule,
      random: () => 1,
      WebSocket: sockets.FakeSocket,
      fetch: tinyServer().fetch,
      openStore: memoryStores(),
    });
    await engine.register('invite-code', 'ravi', 'correct horse');
    sockets.last().accept();
    sockets.last().say({ type: 'welcome', server_time: time.now(), head: 0 });
    assert.equal(engine.sync.value, 'in-step');
    sockets.last().say({ type: 'cells', from: 4, to: 5, cells: [] });
    assert.equal(sockets.all.length, 2);
    assert.equal(engine.sync.value, 'offline');
    sockets.last().fail();
    assert.equal(engine.sync.value, 'offline');
    time.advance(1000);
    sockets.last().accept();
    sockets.last().say({ type: 'welcome', server_time: time.now(), head: 0 });
    assert.equal(engine.sync.value, 'in-step');
    await engine.stop();
  });

  it('the device says the network is gone: offline at once, not a ping later, and the edit made meanwhile goes out when it is back', async () => {
    const time = fakeTime();
    const sockets = fakeSockets();
    // As browser.ts does it: the wire is made by the caller, so the offline event can reach it.
    let wire: Transport | undefined;
    const env: Env = {
      url: 'https://heirloom.test',
      now: time.now,
      schedule: time.schedule,
      random: () => 1,
      WebSocket: sockets.FakeSocket,
      fetch: tinyServer().fetch,
      openStore: memoryStores(),
      connect: (handlers) => (wire = connect(env, handlers)),
    };
    const engine = await createEngine(env);
    await engine.register('invite-code', 'ravi', 'correct horse');
    sockets.last().accept();
    sockets.last().say({ type: 'welcome', server_time: time.now(), head: 0 });
    assert.equal(engine.sync.value, 'in-step');

    wire!.offline();
    assert.equal(engine.sync.value, 'offline');
    engine.write('task', 't1', { title: 'in the lift' });
    await engine.saved();
    assert.equal(sockets.all[0]!.sent.some((m) => m.type === 'push'), false);

    engine.wake();
    sockets.last().accept();
    sockets.last().say({ type: 'welcome', server_time: time.now(), head: 0 });
    assert.equal(engine.sync.value, 'syncing');
    assert.deepEqual(sockets.last().sent.at(-1).cells.map((c: Cell) => c.value), ['in the lift']);
    await engine.stop();
  });

  it('when no socket gets through, an edit still reaches the server by POST and comes back acked', async () => {
    const server = tinyServer();
    const time = fakeTime();
    const sockets = fakeSockets();
    const engine = await createEngine({
      url: 'https://heirloom.test',
      now: time.now,
      schedule: time.schedule,
      random: () => 1,
      WebSocket: sockets.FakeSocket,
      fetch: server.fetch,
      openStore: memoryStores(),
    });
    await engine.register('invite-code', 'ravi', 'correct horse');
    engine.write('task', 't1', { title: 'through the proxy' });
    await engine.saved();
    assert.equal(engine.sync.value, 'offline');
    for (const wait of [0, 1000, 2000]) {
      time.advance(wait);
      sockets.last().fail();
    }
    for (let i = 0; i < 5; i++) await settle();
    assert.deepEqual(server.log.map((c) => c.value), ['through the proxy']);
    assert.equal(engine.unsent.value, 0);
    assert.equal(engine.sync.value, 'in-step');
    await engine.stop();
  });
});
