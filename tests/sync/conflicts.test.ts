// ARCHITECTURE section 4, one test per row of the conflict table: real engines, the real server.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { TimerState } from '../../client/src/core/timer.ts';
import { createFocus } from '../../client/src/sync/focus.ts';
import { account, converge, offline, online, serverHolds, signedIn, sleep, startServer, stopAll, table, until } from './harness.ts';
import type { Device, Server } from './harness.ts';

let server: Server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await stopAll();
  await server.stop();
});

const row = (d: Device, dataset: string, id: string) => d.engine.rows(dataset).value.get(id);

// Two devices of a new account, both in step.
async function pair(name: string): Promise<[Device, Device]> {
  const a = await account(server, name);
  const b = await signedIn(server, name);
  await converge([a, b]);
  return [a, b];
}

// Both devices hold what a fresh device gets from the server.
async function settled(name: string, devices: Device[]) {
  await converge(devices);
  assert.deepEqual(table(devices[0]!.engine.cells()), await serverHolds(server, name));
}

const stop = (...devices: Device[]) => Promise.all(devices.map((d) => d.engine.stop()));

test('1. the same field edited on two devices: the newer stamp wins on both', async () => {
  const [a, b] = await pair('row1');
  offline(a);
  offline(b);
  a.engine.write('task', 'older-on-a', { title: 'A, first' });
  b.engine.write('task', 'older-on-b', { title: 'B, first' });
  await sleep(5);
  b.engine.write('task', 'older-on-a', { title: 'B, later' });
  a.engine.write('task', 'older-on-b', { title: 'A, later' });
  // Each field's loser reaches the server last, so the server has to keep the newer one, not the latest to arrive.
  online(b);
  await until(() => b.engine.sync.value === 'in-step', 5000, 'B did not come back');
  online(a);
  await settled('row1', [a, b]);
  for (const d of [a, b]) {
    assert.equal(row(d, 'task', 'older-on-a')?.title, 'B, later');
    assert.equal(row(d, 'task', 'older-on-b')?.title, 'A, later');
  }
  await stop(a, b);
});

test('1. an edit made after seeing the other device\'s edit is newer, even inside one millisecond', async () => {
  const [a, b] = await pair('row1ms');
  // B's clock runs 2 s ahead, plus a fraction: a real device's corrected time has one too,
  // because its offset is the average of two readings, smoothed. A quarter, because the first
  // offset sample ends in .0 or .5 and must not cancel it.
  b.skew.ms = 2000.25;
  b.engine.write('task', 'notes', { title: 'B, first' });
  // Then B's clock is set right, so its stamps come from the clock's counter for the next 2 s.
  b.skew.ms = 0.25;
  await converge([a, b]);
  // A is behind B, so its clock takes B's millisecond and counts on from it.
  a.engine.write('task', 'notes', { notes: 'A', title: 'A, after seeing B' });
  await converge([a, b]);
  // B has now seen A's title, so this edit must be stamped later and win everywhere.
  b.engine.write('task', 'notes', { title: 'B, after seeing A' });
  const held = b.engine.cells().find((c) => c.row === 'notes' && c.field === 'title')!;
  assert.equal(held.value, 'B, after seeing A', `B's edit lost on B itself to ${held.stamp}`);
  await settled('row1ms', [a, b]);
  for (const d of [a, b]) assert.equal(row(d, 'task', 'notes')?.title, 'B, after seeing A');
  await stop(a, b);
});

test('2. a task deleted on one device, edited on the other: both stay, the delete stands, restore brings the edit back', async () => {
  const [a, b] = await pair('row2');
  a.engine.write('task', 'pointers', { title: 'Pointers', deleted: null });
  await converge([a, b]);
  offline(a);
  offline(b);
  const deletedAt = a.engine.now();
  a.engine.write('task', 'pointers', { deleted: deletedAt });
  b.engine.write('task', 'pointers', { title: 'Pointers, chapter 3' });
  online(a);
  online(b);
  await settled('row2', [a, b]);
  for (const d of [a, b]) assert.deepEqual(row(d, 'task', 'pointers'), { id: 'pointers', title: 'Pointers, chapter 3', deleted: deletedAt });

  a.engine.write('task', 'pointers', { deleted: null });
  await settled('row2', [a, b]);
  for (const d of [a, b]) assert.deepEqual(row(d, 'task', 'pointers'), { id: 'pointers', title: 'Pointers, chapter 3', deleted: null });
  await stop(a, b);
});

test('3. the timer changed on two devices, both online: both show the same state within a second', async (t) => {
  const [a, b] = await pair('row3');
  const same = () => JSON.stringify(a.engine.timer.value) === JSON.stringify(b.engine.timer.value);
  const within = async (what: string) => {
    const ms = await until(same, 1000, `${what}: the two devices still disagree after 1 s`);
    t.diagnostic(`${what}: ${ms.toFixed(0)} ms`);
  };

  a.engine.act({ do: 'start', phase: 'work', run: 'run-1', task: null, planned_ms: 25 * 60000 });
  await within('start on A, seen on B');
  assert.equal(b.engine.timer.value.run, 'run-1');

  b.engine.act({ do: 'pause' });
  await within('pause on B, seen on A');
  assert.notEqual(a.engine.timer.value.paused_at, null);

  // Both at once: whichever is stamped later is what both show.
  a.engine.act({ do: 'resume' });
  b.engine.act({ do: 'stop' });
  await within('resume on A and stop on B together');
  const stamps = a.engine.cells().filter((c) => c.dataset === 'timer');
  assert.equal(stamps.length, 1);
  await settled('row3', [a, b]);
  await stop(a, b);
});

test('4. both devices offline, each runs the timer: both sessions kept everywhere, the newer timer state holds the cell', async () => {
  const [a, b] = await pair('row4');
  offline(a);
  offline(b);
  const lap = (d: Device, run: string) => {
    d.engine.act({ do: 'start', phase: 'work', run, task: null, planned_ms: 25 * 60000 });
    const state = d.engine.timer.value;
    // Section 2 writes the row when the lap ends; here the test writes what it will write.
    d.engine.write('session', run, {
      kind: 'work', task: null, started: state.started, ended: state.started! + 25 * 60000,
      planned_ms: 25 * 60000, paused_ms: 0, outcome: 'rang', device: d.engine.device,
    });
    return state;
  };
  lap(a, 'run-on-a');
  await sleep(5);
  const newer: TimerState = lap(b, 'run-on-b');
  online(a);
  online(b);
  await settled('row4', [a, b]);
  for (const d of [a, b]) {
    assert.deepEqual([...d.engine.rows('session').value.keys()].sort(), ['run-on-a', 'run-on-b']);
    assert.deepEqual(d.engine.timer.value, newer);
  }
  await stop(a, b);
});

test('4. a lap still running when another device\'s newer start arrives is closed as stopped, with its minutes', async () => {
  const [a, b] = await pair('row4r');
  let runs = 0;
  const focus = (d: Device) =>
    createFocus(d.engine, {
      utcOffsetMin: () => 0,
      runId: () => `run-${++runs}`,
      schedule: (run, ms) => {
        const t = setTimeout(run, ms);
        return () => clearTimeout(t);
      },
    });
  const [fa, fb] = [focus(a), focus(b)];
  offline(b);
  fa.start();
  const replaced = a.engine.timer.value;
  // Ninety seconds pass on both laptops. The skew stands in for the wait, and stays under the
  // server's five minutes, so nothing is refused for its clock.
  a.skew.ms = b.skew.ms = 90000;
  fb.start();
  const newer = b.engine.timer.value;
  online(b);
  await settled('row4r', [a, b]);

  // A's lap ran for ninety seconds and nobody stopped it: its minutes are kept, as stopped.
  const rows = [...a.engine.rows('session').value.values()];
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.id, replaced.run);
  assert.equal(row.outcome, 'stopped');
  assert.equal(row.device, a.engine.device);
  const ran = (row.ended as number) - (row.started as number);
  assert.ok(ran >= 90000 && ran < 95000, `the replaced lap kept ${ran} ms`);
  for (const d of [a, b]) assert.deepEqual(d.engine.timer.value, newer);
  fa.close();
  fb.close();
  await stop(a, b);
});

test('5. a habit checked in on two devices offline: two checkin rows, both everywhere', async () => {
  const [a, b] = await pair('row5');
  offline(a);
  offline(b);
  for (const [d, id] of [[a, 'checkin-on-a'], [b, 'checkin-on-b']] as const) {
    d.engine.write('checkin', id, { habit: 'read', day: '2026-11-24', at: d.engine.now(), deleted: null });
  }
  online(a);
  online(b);
  await settled('row5', [a, b]);
  for (const d of [a, b]) {
    const rows = [...d.engine.rows('checkin').value.values()].filter((r) => r.habit === 'read' && r.day === '2026-11-24');
    assert.deepEqual(rows.map((r) => r.id).sort(), ['checkin-on-a', 'checkin-on-b']);
  }
  await stop(a, b);
});

test('6. two devices reorder a list: one order on both', async () => {
  const [a, b] = await pair('row6');
  for (const [id, order] of [['t1', 'a'], ['t2', 'b'], ['t3', 'c']]) a.engine.write('task', id!, { title: id, order });
  await converge([a, b]);
  offline(a);
  offline(b);
  a.engine.write('task', 't3', { order: '0' });
  a.engine.write('task', 't1', { order: 'b5' });
  await sleep(5);
  // t1 moved on both, B later; t2 lands on the same key as A's t3, so the row id breaks the tie.
  b.engine.write('task', 't1', { order: 'd' });
  b.engine.write('task', 't2', { order: '0' });
  online(a);
  online(b);
  await settled('row6', [a, b]);
  const list = (d: Device) =>
    [...d.engine.rows('task').value.values()]
      .sort((x, y) => (x.order === y.order ? (x.id < y.id ? -1 : 1) : String(x.order) < String(y.order) ? -1 : 1))
      .map((r) => r.id);
  assert.deepEqual(list(a), ['t2', 't3', 't1']);
  assert.deepEqual(list(b), ['t2', 't3', 't1']);
  await stop(a, b);
});

test('7. a clock wrong while offline: ten minutes fast is refused, restamped, accepted; a slow edit loses to a later real one', async () => {
  const [a, b] = await pair('row7');

  // The person sets A's clock ten minutes ahead while it is offline, and edits.
  offline(a);
  a.skew.ms = 10 * 60000;
  a.engine.write('task', 'essay', { title: 'Essay, fast clock', notes: 'written while ahead' });
  online(a);
  await settled('row7', [a, b]);
  const types = a.net.frames.filter((f) => f.dir === 'in').map((f) => f.msg.type);
  const nack = a.net.frames.find((f) => f.msg.type === 'nack');
  assert.equal(nack?.msg.reason, 'clock', `A was never refused for its clock: ${types.join(' ')}`);
  assert.ok(types.lastIndexOf('ack') > types.indexOf('nack'), 'the restamped push was not acked');
  for (const d of [a, b]) assert.deepEqual(row(d, 'task', 'essay'), { id: 'essay', title: 'Essay, fast clock', notes: 'written while ahead' });
  for (const cell of a.engine.cells()) {
    const ahead = Date.parse(cell.stamp.slice(0, 24)) - Date.now();
    assert.ok(ahead < 60000, `${cell.field} kept a stamp ${ahead} ms ahead`);
  }

  // B's clock falls ten minutes behind while offline. Its edit, then a real later one on A.
  offline(b);
  b.skew.ms = -10 * 60000;
  b.engine.write('task', 'essay', { notes: 'slow clock', estimate: 3 });
  await sleep(5);
  a.engine.write('task', 'essay', { notes: 'later, real clock' });
  online(b);
  await settled('row7', [a, b]);
  for (const d of [a, b]) {
    assert.deepEqual(row(d, 'task', 'essay'), { id: 'essay', title: 'Essay, fast clock', notes: 'later, real clock', estimate: 3 });
  }
  await stop(a, b);
});

test.todo('8. a room action while offline is not sent and says it needs a connection; cheers are queued (section 7)');

test('9. a device offline for a long time pulls over two pages, then pushes its own offline work; both end equal', async () => {
  const [a, b] = await pair('row9');
  offline(b);
  b.engine.write('session', 'lap-on-the-train', { kind: 'work', outcome: 'rang', started: b.engine.now(), device: b.engine.device });
  b.engine.write('task', 'train-notes', { title: 'Read on the train' });
  for (let i = 0; i < 1200; i++) a.engine.write('task', `task-${i}`, { title: `Task ${i}` });
  await until(() => a.engine.sync.value === 'in-step' && a.engine.unsent.value === 0, 15000, 'A did not send its 1200 cells');

  const mark = b.net.frames.length;
  online(b);
  await settled('row9', [a, b]);
  const back = b.net.frames.slice(mark);
  const welcome = back.find((f) => f.msg.type === 'welcome')!.msg;
  const pages = back.filter((f) => f.msg.type === 'cells' && f.msg.cells.length);
  const firstPush = back.findIndex((f) => f.msg.type === 'push');
  assert.ok(pages.length >= 3, `pulled in ${pages.length} pages`);
  assert.ok(welcome.head - pages[0]!.msg.from > 1000, 'fewer than 1000 cells were waiting');
  // Pull first: every page up to the head came in before the first push went out.
  const pulledBefore = back.slice(0, firstPush).filter((f) => f.msg.type === 'cells');
  assert.equal(pulledBefore.at(-1)?.msg.to, welcome.head, 'B pushed before it had caught up');
  for (const d of [a, b]) {
    assert.equal(row(d, 'session', 'lap-on-the-train')?.outcome, 'rang');
    assert.equal(row(d, 'task', 'train-notes')?.title, 'Read on the train');
    assert.equal(d.engine.rows('task').value.size, 1201);
  }
  await stop(a, b);
});
