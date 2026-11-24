// Settings, marks, and a person's own copy, on the real engine: see world.ts for the devices.
// "Now" is 10:00 on Tuesday 2026-11-24 in Sri Lanka; the Monday of this week is the 23rd.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cell } from '../core/merge.ts';
import type { Write } from '../store/store.ts';
import { T0 } from './fakes.ts';
import { LAP, MIN, OFFSET, world } from './world.ts';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type World = ReturnType<typeof world>;
type Device = Awaited<ReturnType<World['device']>>;
const at = (day: string, hour: number, minute = 0) => Date.parse(day) - OFFSET * MIN + hour * HOUR + minute * MIN;

let made = 0;
// A lap that rang, written by this device unless told otherwise.
function lap(d: Device, started: number, over: Record<string, unknown> = {}) {
  const id = `s${++made}`;
  d.engine.write('session', id, { kind: 'work', task: null, started, ended: started + LAP, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: d.engine.device, ...over });
  return id;
}
// The same, as it arrives from another device.
function theirLap(d: Device, started: number, over: Record<string, unknown> = {}) {
  const id = `s${++made}`;
  const row = { kind: 'work', task: null, started, ended: started + LAP, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: 'b2c3d4e5f6071829', ...over };
  d.receive(Object.entries(row).map(([field, value]): Cell => ({ stamp: `${new Date(started).toISOString()}-0000-b2c3d4e5f6071829`, dataset: 'session', row: id, field, value })));
  return id;
}
const shown = (d: Device) => d.engine.rows('settings').value.get('current')?.marks as Record<string, number> | undefined;

async function one() {
  const w = world();
  const d = await w.device('a');
  return { w, d, s: d.settings };
}

describe('settings', () => {
  it('a field nobody has written reads as its default', async () => {
    const { s } = await one();
    assert.deepEqual(s.all.value, {
      work_ms: 25 * MIN, short_ms: 5 * MIN, long_ms: 15 * MIN, auto_break: false, auto_work: false,
      sound: 'bell', celebrate: true, day_target: 0, share_task: false, rooms_hidden: false,
    });
  });

  it('set writes the fields given, in one write, and they read back', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    void d.settings.all.value;
    log.length = 0;
    assert.equal(d.settings.set({ work_ms: 50 * MIN, auto_break: true, day_target: 8, sound: 'bowl' }), true);
    await d.engine.saved();
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => c.field), ['work_ms', 'auto_break', 'day_target', 'sound']);
    assert.deepEqual(d.settings.all.value, {
      work_ms: 50 * MIN, short_ms: 5 * MIN, long_ms: 15 * MIN, auto_break: true, auto_work: false,
      sound: 'bowl', celebrate: true, day_target: 8, share_task: false, rooms_hidden: false,
    });
    // And Focus reads the same row: the next lap is fifty minutes.
    d.focus.start();
    assert.equal(d.focus.state.value.planned_ms, 50 * MIN);
  });

  it('a value outside the schema refuses the whole call: nothing is written, not even the fields that were fine', async () => {
    const { d, s } = await one();
    const cells = d.engine.cells();
    for (const bad of [
      { work_ms: 999 },
      { work_ms: 86400001 },
      { short_ms: 86400001 },
      { long_ms: 86400001 },
      { long_ms: 900000.5 },
      { day_target: -1 },
      { auto_break: 'yes' },
      { sound: '' },
      { work_ms: 30 * MIN, celebrate: 1 },
      { marks: {} },
      {},
    ]) {
      assert.equal(s.set(bad as never), false, JSON.stringify(bad));
    }
    assert.deepEqual(d.engine.cells(), cells);
    // A day is the longest a length may be, and a second the shortest.
    assert.equal(s.set({ work_ms: 86400000, short_ms: 1000 }), true);
  });

  it('a row with something this build cannot use still reads: each such field as its default', async () => {
    const { d, s } = await one();
    d.engine.write('settings', 'current', { work_ms: 'long', auto_break: 1, sound: 7, celebrate: null, day_target: 2.5, from_a_newer_build: true });
    assert.deepEqual(s.all.value, {
      work_ms: 25 * MIN, short_ms: 5 * MIN, long_ms: 15 * MIN, auto_break: false, auto_work: false,
      sound: 'bell', celebrate: true, day_target: 0, share_task: false, rooms_hidden: false,
    });
  });

  it('"ring here" is this device\'s: on by default, in no cell, kept across a restart and across a sign out', async () => {
    const { w, d, s } = await one();
    assert.equal(s.ringHere.value, true);
    s.setRingHere(false);
    assert.equal(s.ringHere.value, false);
    await d.engine.saved();
    assert.deepEqual(d.engine.cells(), []);
    assert.equal(d.engine.unsent.value, 0);
    const again = await w.restart(d);
    assert.equal(again.settings.ringHere.value, false);
    assert.deepEqual(await again.engine.signOut(), { ok: true });
    assert.equal(again.engine.kept('ring_here', 'device'), false);
    // Whoever signs in next on this device, or nobody: it is still off.
    again.close();
    await again.engine.stop();
    const later = await w.device('a', { stores: again.stores });
    assert.equal(later.settings.ringHere.value, false);
    later.settings.setRingHere(true);
    assert.equal(later.settings.ringHere.value, true);
  });
});

describe('marks', () => {
  it('the first lap that rings is a mark, shown once; the next laps are not, until the fourth', async () => {
    const { w, d, s } = await one();
    assert.deepEqual(s.marks.value, []);
    d.focus.start();
    w.time.advance(LAP);
    assert.deepEqual(s.marks.value, [{ kind: 'laps', tier: 1 }]);
    assert.deepEqual(Object.keys(shown(d) ?? {}), ['laps-1']);
    s.seen();
    assert.deepEqual(s.marks.value, []);
    for (const n of [2, 3]) {
      d.focus.skipBreak();
      w.time.advance(LAP);
      assert.deepEqual(s.marks.value, [], `lap ${n}`);
    }
    d.focus.skipBreak();
    w.time.advance(LAP);
    assert.deepEqual(s.marks.value, [{ kind: 'laps', tier: 4 }]);
    // Shown and not yet looked at: it stays until seen, and is not added a second time.
    d.today.add('something else changes');
    assert.equal(s.marks.value.length, 1);
  });

  it('a task done with its laps at or under its estimate is a mark; over it, or with no lap at all, is not', async () => {
    const { d, s } = await one();
    const [under, level, over, none] = ['under ~3', 'level ~2', 'over ~1', 'no lap ~2'].map((line) => d.today.add(line)!);
    // Four laps from another day and another device, so no lap tier is in the way here.
    for (const [task, count] of [[under, 1], [level, 2], [over, 2]] as const) {
      for (let n = 0; n < count; n++) theirLap(d, T0 - 3 * DAY + made * HOUR, { task });
    }
    for (const task of [over, none, under!]) d.today.setDone(task!, true);
    assert.deepEqual(s.marks.value, [{ kind: 'estimate', task: under, title: 'under', estimate: 3, laps: 1 }]);
    d.today.setDone(level!, true);
    assert.deepEqual(s.marks.value.map((mark) => mark.kind === 'estimate' && mark.title), ['under', 'level']);
    assert.deepEqual(Object.keys(shown(d)!).toSorted(), [`estimate-${level}`, `estimate-${under}`].toSorted());
  });

  it('this week passing the best week before it is a mark, once there is a week before it', async () => {
    const { w, d, s } = await one();
    // The best week so far: two laps, three weeks ago. Last week: one.
    theirLap(d, at('2026-11-03', 9));
    theirLap(d, at('2026-11-03', 10));
    theirLap(d, at('2026-11-17', 9));
    theirLap(d, at('2026-11-23', 9));
    d.focus.start();
    w.time.advance(LAP);
    // Two laps this week: level with the best, not past it.
    assert.deepEqual(s.marks.value, []);
    d.focus.skipBreak();
    w.time.advance(LAP);
    assert.deepEqual(s.marks.value, [{ kind: 'week', focus_ms: 75 * MIN, before_ms: 50 * MIN }]);
    assert.ok('week-2026-11-23' in shown(d)!);
    s.seen();
    d.focus.skipBreak();
    w.time.advance(LAP);
    assert.deepEqual(s.marks.value, [], 'further past the same best is not another mark');
  });

  it('a first week has nothing to pass: no week mark', async () => {
    const { w, d, s } = await one();
    theirLap(d, at('2026-11-23', 9));
    d.focus.start();
    w.time.advance(LAP);
    assert.deepEqual(s.marks.value, []);
  });

  it('a mark is shown once: not again after a restart, and not on a second device once it has the rows', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    void b.settings.marks.value;
    a.focus.start();
    w.time.advance(LAP);
    assert.deepEqual(a.settings.marks.value, [{ kind: 'laps', tier: 1 }]);
    await a.settle();
    w.exchange(a, b);
    assert.deepEqual(b.settings.marks.value, [], 'catching up is not an achievement');
    const again = await w.restart(a);
    assert.deepEqual(again.settings.marks.value, []);
    // Even a device that wrote the same bell itself does not show it once the key has arrived.
    const c = await w.device('c');
    c.receive(again.engine.cells().filter((cell) => cell.dataset === 'settings'));
    lap(c, T0 - HOUR);
    assert.deepEqual(c.settings.marks.value, []);
  });

  it('a lap another device rang, arriving here with no word that it was ever marked, is not this device\'s to celebrate', async () => {
    const { d, s } = await one();
    // The phone rang its first lap an hour ago with its app asleep, so nobody was shown anything.
    theirLap(d, T0 - HOUR);
    assert.deepEqual(s.marks.value, [], 'nothing for opening the app and catching up');
    assert.equal(shown(d), undefined);
  });

  it('two devices that both wrote the bell before hearing of each other each show the mark, and that is the end of it', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    void a.settings.marks.value;
    void b.settings.marks.value;
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    w.time.advance(LAP);
    assert.equal(a.settings.marks.value.length, 1);
    assert.equal(b.settings.marks.value.length, 1);
    w.exchange(a, b);
    assert.equal(a.settings.marks.value.length, 1);
    assert.equal(b.settings.marks.value.length, 1);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('with celebrations off nothing is shown and nothing is written', async () => {
    const { w, d, s } = await one();
    s.set({ celebrate: false });
    d.focus.start();
    w.time.advance(LAP);
    const task = d.today.add('quick ~2')!;
    lap(d, T0 - HOUR, { task });
    d.today.setDone(task, true);
    assert.deepEqual(s.marks.value, []);
    assert.equal(shown(d), undefined);
  });

  it('switching celebrations on does not replay the past: nothing for last month, only what was achieved within the day', async () => {
    const { w, d, s } = await one();
    s.set({ celebrate: false });
    // Last month: four laps and a task done within its estimate.
    const old = d.today.add('old ~2')!;
    for (let n = 0; n < 4; n++) lap(d, T0 - 30 * DAY + n * HOUR, { task: old });
    d.engine.write('task', old, { done: T0 - 29 * DAY });
    // This morning: a task done within its estimate.
    const fresh = d.today.add('fresh ~2')!;
    lap(d, T0 - 2 * HOUR, { task: fresh });
    d.today.setDone(fresh, true);
    w.time.advance(MIN);
    assert.deepEqual(s.marks.value, []);
    s.set({ celebrate: true });
    assert.deepEqual(s.marks.value, [{ kind: 'estimate', task: fresh, title: 'fresh', estimate: 2, laps: 1 }]);
    assert.deepEqual(Object.keys(shown(d)!), [`estimate-${fresh}`]);
  });

  it('keys of marks shown long ago are dropped when the next is written, so the one cell stays small', async () => {
    const { w, d, s } = await one();
    d.engine.write('settings', 'current', { marks: { 'laps-1': T0 - 40 * DAY, 'estimate-old': T0 - 3 * DAY, 'week-2026-11-23': T0 - HOUR } });
    for (let n = 0; n < 3; n++) theirLap(d, T0 - 5 * DAY + n * HOUR);
    d.focus.start();
    w.time.advance(LAP);
    assert.deepEqual(s.marks.value, [{ kind: 'laps', tier: 4 }]);
    assert.deepEqual(Object.keys(shown(d)!).toSorted(), ['laps-4', 'week-2026-11-23']);
  });
});

describe('a person\'s own copy', () => {
  // A little of everything, on one device.
  async function account(w: World) {
    const d = await w.device('a');
    const task = d.today.add('pointers ~3')!;
    d.today.edit(task, { notes: 'K&R chapter 5' });
    const habit = d.habits.add('Read', 127, 1)!;
    d.habits.checkIn(habit);
    d.focus.start(task);
    w.time.advance(LAP);
    d.settings.set({ work_ms: 50 * MIN });
    d.progress.setNote('2026-11-24', 'Pointers finally clicked.');
    d.engine.write('mood', 'mood-1124', { level: 3 });
    await d.settle();
    return { d, task };
  }

  it('export is one JSON text with every cell held, stamps and all', async () => {
    const w = world();
    const { d } = await account(w);
    const copy = JSON.parse(d.settings.exportAll());
    assert.deepEqual(Object.keys(copy), ['heirloom', 'exported', 'account', 'cells']);
    assert.deepEqual([copy.heirloom, copy.exported, copy.account], [1, d.engine.now(), 'ravi']);
    assert.deepEqual(copy.cells, d.engine.cells());
    assert.ok(copy.cells.some((cell: Cell) => cell.dataset === 'mood'), 'a dataset this build does not know is in it too');
  });

  it('export, then import into a fresh account on another device: the same cells, and all of them on their way to the server', async () => {
    const w = world();
    const { d, task } = await account(w);
    const text = d.settings.exportAll();
    const b = await w.device('b', { online: false });
    await b.engine.signIn('nimal', 'another password');
    assert.deepEqual(b.engine.cells(), []);
    assert.deepEqual(b.settings.importAll(text), { ok: true, cells: d.engine.cells().length });
    assert.deepEqual(w.sorted(b.engine), w.sorted(d.engine));
    assert.equal(b.engine.unsent.value, d.engine.cells().length);
    assert.equal(b.today.next.value?.title, 'pointers');
    assert.equal(b.today.next.value?.laps, 1);
    assert.equal(b.focus.lengths.value.work_ms, 50 * MIN);
    assert.equal(b.engine.rows('task').value.get(task)?.notes, 'K&R chapter 5');
    // Pushed with the stamps and devices they were made with.
    b.wire().handlers.message({ type: 'welcome', server_time: 0, head: 0 });
    await b.engine.saved();
    assert.deepEqual(b.wire().sent[0]!.cells.toSorted((x, y) => (x.stamp < y.stamp ? -1 : 1)).map((cell) => cell.stamp), d.engine.cells().map((cell) => cell.stamp).toSorted());
    // And they survive a restart before they are sent.
    const again = await w.restart(b, { online: false });
    assert.deepEqual(w.sorted(again.engine), w.sorted(d.engine));
  });

  it('importing twice changes nothing', async () => {
    const w = world();
    const { d } = await account(w);
    const text = d.settings.exportAll();
    const cells = d.engine.cells();
    assert.deepEqual(d.settings.importAll(text), { ok: true, cells: 0 });
    assert.deepEqual(d.engine.cells(), cells);
    assert.equal(d.engine.unsent.value, 0);
  });

  it('importing an older copy does not undo newer edits, and brings back only what is newer in it', async () => {
    const w = world();
    const { d, task } = await account(w);
    const old = d.settings.exportAll();
    w.time.advance(HOUR);
    d.today.edit(task, { title: 'Pointers and arrays', estimate: 5 });
    d.today.remove(task);
    const now = d.engine.cells();
    assert.deepEqual(d.settings.importAll(old), { ok: true, cells: 0 });
    assert.deepEqual(d.engine.cells(), now);
    // The other way round: a device that never got the edit takes the newer cells from a newer copy.
    const b = await w.device('b', { online: false });
    b.settings.importAll(old);
    assert.equal(b.engine.rows('task').value.get(task)?.title, 'pointers');
    assert.deepEqual(b.settings.importAll(d.settings.exportAll()), { ok: true, cells: 3 });
    assert.equal(b.engine.rows('task').value.get(task)?.title, 'Pointers and arrays');
  });

  it('what is not a copy is refused, each kind by its name, and nothing is written', async () => {
    const { d, s } = await one();
    assert.deepEqual(s.importAll('not json at all {'), { ok: false, error: 'not_json' });
    assert.deepEqual(s.importAll('{"some":"other file"}'), { ok: false, error: 'not_heirloom' });
    assert.deepEqual(s.importAll('{"heirloom":2,"cells":[]}'), { ok: false, error: 'not_heirloom' });
    assert.deepEqual(s.importAll('{"heirloom":1,"cells":"many"}'), { ok: false, error: 'not_heirloom' });
    assert.deepEqual(s.importAll('[1,2,3]'), { ok: false, error: 'not_heirloom' });
    assert.deepEqual(s.importAll('null'), { ok: false, error: 'not_heirloom' });
    assert.deepEqual(s.importAll('{"heirloom":1,"exported":1,"account":"ravi","cells":[]}'), { ok: false, error: 'empty' });
    assert.deepEqual(d.engine.cells(), []);
  });

  it('cells in a copy that the server could not store are left out, and the rest come in', async () => {
    const { d, s } = await one();
    const good = { stamp: '2026-11-20T04:30:00.000Z-0000-b2c3d4e5f6071829', dataset: 'task', row: 't1', field: 'title', value: 'kept' };
    const copy = { heirloom: 1, exported: 1, account: 'x', cells: [
      good,
      { ...good, row: 't2', stamp: 'yesterday' },
      { ...good, row: 'bad row' },
      { ...good, row: 't3', value: 'x'.repeat(17000) },
      { dataset: 'task', row: 't4' },
      'not a cell',
      null,
    ] };
    assert.deepEqual(s.importAll(JSON.stringify(copy)), { ok: true, cells: 1 });
    assert.deepEqual(d.engine.cells(), [good]);
    assert.equal(d.engine.unsent.value, 1);
  });

  it('an edit made after an import is stamped later than everything the copy held', async () => {
    const { d, s } = await one();
    const ahead = { stamp: '2026-11-24T04:33:00.000Z-0004-b2c3d4e5f6071829', dataset: 'task', row: 't1', field: 'title', value: 'from a clock three minutes ahead' };
    s.importAll(JSON.stringify({ heirloom: 1, cells: [ahead] }));
    d.engine.write('task', 't1', { title: 'typed after the import' });
    assert.equal(d.engine.rows('task').value.get('t1')?.title, 'typed after the import');
    assert.equal(d.engine.stamp('task', 't1', 'title'), `2026-11-24T04:33:00.000Z-0005-${d.engine.device}`);
  });
});
