// Focus on the real engine: see world.ts for the devices these tests run on.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventStamp } from '../core/hlc.ts';
import type { Cell } from '../core/merge.ts';
import type { Write } from '../store/store.ts';
import { T0 } from './fakes.ts';
import { EXTEND_MS } from './focus.ts';
import { LAP, MIN, world } from './world.ts';

const lapRow = (device: string, over: object = {}) => ({
  id: 'run-1',
  kind: 'work',
  task: null,
  started: T0,
  ended: T0 + LAP,
  planned_ms: LAP,
  paused_ms: 0,
  outcome: 'rang',
  device,
  ...over,
});

describe('starting and the timer', () => {
  it('start begins a lap of the settings length with a new run id and the task', async () => {
    const w = world();
    const d = await w.device('a');
    assert.deepEqual(d.focus.lengths.value, { work_ms: LAP, short_ms: 5 * MIN, long_ms: 15 * MIN });
    assert.deepEqual(d.focus.view().next, { phase: 'work', set_index: 0 });
    d.focus.start('task-pointers');
    assert.deepEqual(d.focus.state.value, {
      phase: 'work', run: 'run-1', task: 'task-pointers', started: T0, paused_at: null, paused_ms: 0, planned_ms: LAP, set_index: 0,
    });
    w.time.advance(6 * MIN);
    assert.equal(d.focus.view().left_ms, 19 * MIN);
    assert.equal(d.focus.ran(), 6 * MIN);
  });

  it('lengths come from the settings row, and a value no timer could use falls back to the default', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('settings', 'current', { work_ms: 50 * MIN, short_ms: 10, long_ms: '20 min' });
    assert.deepEqual(d.focus.lengths.value, { work_ms: 50 * MIN, short_ms: 5 * MIN, long_ms: 15 * MIN });
    // A day is the longest the schema allows.
    d.engine.write('settings', 'current', { short_ms: 86400000, long_ms: 86400001 });
    assert.deepEqual(d.focus.lengths.value, { work_ms: 50 * MIN, short_ms: 86400000, long_ms: 15 * MIN });
    d.focus.start();
    assert.equal(d.focus.state.value.planned_ms, 50 * MIN);
    assert.equal(d.focus.state.value.task, null);
  });

  it('after the bell, start begins the break the lap earned, and the lap after it is the next of the set', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start('task-pointers');
    w.time.advance(LAP);
    assert.deepEqual(d.focus.view().next, { phase: 'short', set_index: 0 });
    d.focus.start('task-pointers');
    assert.deepEqual(d.focus.state.value, {
      phase: 'short', run: 'run-2', task: null, started: T0 + LAP, paused_at: null, paused_ms: 0, planned_ms: 5 * MIN, set_index: 0,
    });
    w.time.advance(5 * MIN);
    d.focus.start('task-pointers');
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.set_index, 1);
    assert.equal(d.focus.state.value.task, 'task-pointers');
  });

  it('skipBreak starts the next lap in place of the break, whether the break is due or running', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(LAP);
    d.focus.skipBreak('t2');
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.set_index, 1);
    w.time.advance(LAP);
    d.focus.start();
    assert.equal(d.focus.state.value.phase, 'short');
    w.time.advance(2 * MIN);
    d.focus.skipBreak();
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.set_index, 2);
    // The break it cut short ran two minutes, so it is kept, as a break that was stopped.
    assert.equal(d.session('run-3')?.kind, 'short');
    assert.equal(d.session('run-3')?.outcome, 'stopped');
  });

  it('pause, resume, and extend by five minutes', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(10 * MIN);
    d.focus.pause();
    w.time.advance(3 * MIN);
    assert.equal(d.focus.view().paused, true);
    assert.equal(d.focus.ran(), 10 * MIN);
    d.focus.resume();
    d.focus.extend();
    assert.equal(d.focus.state.value.paused_ms, 3 * MIN);
    assert.equal(EXTEND_MS, 5 * MIN);
    assert.equal(d.focus.state.value.planned_ms, LAP + EXTEND_MS);
    assert.equal(d.focus.view().left_ms, 20 * MIN);
    // Nothing to act on: nothing is written.
    const cells = d.engine.cells();
    d.focus.resume();
    assert.deepEqual(d.engine.cells(), cells);
  });
});

describe('ending a run', () => {
  it('stop keeps the minutes as a stopped row, and the row and the timer cell are one store transaction', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    d.focus.start('task-pointers');
    await d.settle();
    w.time.advance(6 * MIN);
    log.length = 0;
    d.focus.stop();
    await d.engine.saved();
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device, { task: 'task-pointers', ended: T0 + 6 * MIN, outcome: 'stopped' }));
    assert.equal(d.focus.state.value.phase, 'idle');
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => c.dataset).toSorted(), [...Array(8).fill('session'), 'timer']);
    // A stopped row is something a person did: ordinary stamps, from the clock, at the time of the stop.
    assert.ok(d.engine.cells().filter((c) => c.dataset === 'session').every((c) => c.stamp.startsWith('2026-11-24T04:36:00.000Z-')));
  });

  it('stop under 60 s writes no row, and the next start is the same lap again', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(59999);
    d.focus.stop();
    assert.deepEqual(d.sessions(), []);
    assert.equal(d.focus.state.value.phase, 'idle');
    d.focus.start();
    assert.equal(d.focus.state.value.set_index, 0);
  });

  it('a run cut off under 60 s by the next start leaves no row, even as the clock ticks on while the start is written', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(59998);
    w.drift.ms = 1;
    d.focus.skipBreak();
    w.drift.ms = 0;
    assert.equal(d.focus.state.value.run, 'run-2');
    w.time.advance(MIN);
    assert.deepEqual(d.sessions(), []);
  });

  it('stop while paused ends the row where the pause began', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(10 * MIN);
    d.focus.pause();
    w.time.advance(45 * MIN);
    d.focus.stop();
    assert.equal(d.session('run-1')?.ended, T0 + 10 * MIN);
  });

  it('starting while a run is open closes it first, as stop, in the same transaction as the new timer cell', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    d.focus.start();
    await d.settle();
    w.time.advance(8 * MIN);
    log.length = 0;
    d.focus.skipBreak();
    await d.engine.saved();
    assert.equal(d.session('run-1')?.outcome, 'stopped');
    assert.equal(d.session('run-1')?.ended, T0 + 8 * MIN);
    assert.equal(d.focus.state.value.run, 'run-2');
    assert.equal(d.focus.state.value.set_index, 0, 'a lap restarted before the bell keeps its place');
    assert.equal(log.length, 1);
  });

  it('set aside writes a void row, which counts nowhere', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(12 * MIN);
    d.focus.setAside();
    assert.equal(d.session('run-1')?.outcome, 'void');
    assert.equal(d.session('run-1')?.ended, T0 + 12 * MIN);
    assert.equal(d.focus.race().you_ms, 0);
    assert.equal(d.focus.lapsToday(), 0);
  });

  it('stop after the bell: the lap rang, and the set moves on', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(LAP + 2 * MIN);
    d.focus.stop();
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device));
    assert.equal(d.focus.state.value.set_index, 1);
    assert.equal(d.focus.lapsToday(), 1);
  });
});

describe('the bell', () => {
  it('awake and in step: the rang row is written at the bell, every cell stamped when the timer cell was written', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    w.time.advance(LAP - 1);
    assert.deepEqual(d.sessions(), []);
    w.time.advance(1);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device));
    const stamps = new Set(d.engine.cells().filter((c) => c.dataset === 'session').map((c) => c.stamp));
    assert.deepEqual([...stamps], [`2026-11-24T04:30:00.000Z-0000-${d.engine.device}`]);
    // The timer cell is not written when it rings.
    assert.equal(d.focus.state.value.run, 'run-1');
    assert.equal(d.focus.view().over, true);
  });

  it('a lap that rings while the device is asleep is written on wake, stamped as it would have been at the bell', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    d.disconnect();
    // Asleep for two hours: no timer runs.
    w.time.jump(2 * 60 * MIN);
    assert.deepEqual(d.sessions(), []);
    w.time.advance(0);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device));
    assert.ok(d.engine.cells().filter((c) => c.dataset === 'session').every((c) => c.stamp.startsWith('2026-11-24T04:30:00.000Z-0000-')));
    // It waits in the outbox like any edit, and writing it did not move the clock back to the start of the lap.
    assert.equal(d.engine.unsent.value, 8);
    d.engine.write('task', 't1', { title: 'after waking' });
    assert.equal(d.engine.stamp('task', 't1', 'title'), `2026-11-24T06:30:00.000Z-0000-${d.engine.device}`);
  });

  it('a lap that rang while the app was closed is written when it opens again', async () => {
    const w = world();
    let d = await w.device('a');
    d.focus.start();
    await d.settle();
    w.time.jump(40 * MIN);
    d = await w.restart(d, { online: false });
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device));
  });

  it('a paused lap never rings, and rings at its new end once resumed', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(10 * MIN);
    d.focus.pause();
    w.time.advance(60 * MIN);
    assert.deepEqual(d.sessions(), []);
    d.focus.resume();
    await d.settle();
    w.time.advance(15 * MIN);
    assert.equal(d.session('run-1')?.ended, T0 + 85 * MIN);
    assert.equal(d.session('run-1')?.paused_ms, 60 * MIN);
  });

  it('a break that rings leaves a break row', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(LAP);
    d.focus.start();
    await d.settle();
    w.time.advance(5 * MIN);
    assert.equal(d.session('run-2')?.kind, 'short');
    assert.equal(d.session('run-2')?.outcome, 'rang');
    assert.equal(d.focus.lapsToday(), 1, 'a break is not a lap');
  });

  it('two devices that both see the bell write the same row: one row, identical cells on both', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start('task-pointers');
    await a.settle();
    w.exchange(a, b);
    assert.equal(b.focus.state.value.run, 'run-1');
    // Neither hears from the other before the bell.
    w.time.advance(LAP);
    assert.equal(a.session('run-1')?.device, a.engine.device);
    assert.equal(b.session('run-1')?.device, b.engine.device);
    w.exchange(a, b);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
    assert.deepEqual(a.sessions(), ['run-1']);
    assert.equal(a.focus.lapsToday(), 1);
    // One writer's cells won whole: the row is not half of each.
    const writers = new Set(a.engine.cells().filter((c) => c.dataset === 'session').map((c) => c.stamp.slice(30)));
    assert.equal(writers.size, 1);
    assert.equal(a.session('run-1')?.device, [...writers][0]);
  });

  it('a device that already holds the row does not write it again', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(LAP);
    // b was offline with a's timer, so only a wrote. Now b hears of it.
    w.exchange(a, b);
    await b.connect();
    assert.equal(b.session('run-1')?.device, a.engine.device);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('offline with another device\'s timer it does not write the bell; back in step with still no row, it does', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(LAP + MIN);
    assert.deepEqual(b.sessions(), [], 'that lap may have been stopped where it was running');
    await b.connect();
    assert.equal(b.session('run-1')?.outcome, 'rang');
    assert.equal(b.session('run-1')?.ended, T0 + LAP);
  });

  it('offline with another device\'s timer, and it was stopped there: the stop arrives and no bell is ever written', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(10 * MIN);
    a.focus.stop();
    w.time.advance(30 * MIN);
    assert.deepEqual(b.sessions(), []);
    w.exchange(a, b);
    await b.connect();
    assert.equal(b.session('run-1')?.outcome, 'stopped');
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('offline with its own timer it writes the bell: the lap is its own', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    d.disconnect();
    w.time.advance(LAP);
    assert.equal(d.session('run-1')?.outcome, 'rang');
  });

  it('a lap stopped on the laptop is not brought back as rung by a phone that slept through the stop', async () => {
    const w = world();
    const phone = await w.device('a');
    const laptop = await w.device('b');
    phone.focus.start();
    await phone.settle();
    w.exchange(phone, laptop);
    // The phone goes into a pocket, its socket dead. Ten minutes in, the lap is stopped on the laptop.
    phone.disconnect();
    w.time.advance(10 * MIN);
    laptop.focus.stop();
    await laptop.settle();
    // The phone wakes long after the bell, still offline. The timer is its own, so it writes the bell.
    w.time.jump(50 * MIN);
    w.time.advance(0);
    assert.equal(phone.session('run-1')?.outcome, 'rang');
    // Then it syncs. The stop is the newer thing: a person did it after the timer was last written.
    w.exchange(phone, laptop);
    await phone.connect();
    await laptop.settle();
    const stopped = lapRow(laptop.engine.device, { ended: T0 + 10 * MIN, outcome: 'stopped' });
    assert.deepEqual(phone.session('run-1'), stopped);
    assert.deepEqual(laptop.session('run-1'), stopped);
    assert.deepEqual(w.sorted(phone.engine), w.sorted(laptop.engine));
    assert.equal(laptop.focus.lapsToday(), 0);
    assert.equal(laptop.focus.race().you_ms, 10 * MIN);
  });

  it('a void made after the bell survives a second device writing the rang row late', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    // b goes to sleep with the lap running. a hears the bell, then sets the lap aside.
    b.disconnect();
    w.time.advance(LAP);
    assert.equal(a.session('run-1')?.outcome, 'rang');
    w.time.advance(MIN);
    a.focus.setAside();
    assert.equal(a.session('run-1')?.outcome, 'void');
    // b wakes an hour later, in step by its own lights for a moment, and writes the row it never saw.
    w.time.advance(60 * MIN);
    b.wire().handlers.message({ type: 'welcome', server_time: 0, head: 0 });
    assert.equal(b.session('run-1')?.outcome, 'rang');
    w.exchange(a, b);
    assert.equal(a.session('run-1')?.outcome, 'void');
    assert.equal(b.session('run-1')?.outcome, 'void');
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('extended after the bell: the row written at the first bell is written again at the second, with the longer lap', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    w.time.advance(LAP + MIN);
    assert.equal(d.session('run-1')?.ended, T0 + LAP);
    d.focus.extend();
    await d.settle();
    assert.equal(d.focus.view().over, false);
    w.time.advance(2 * MIN);
    // The lap in progress counts to now, not to the row of its first bell.
    assert.equal(d.focus.race().you_ms, 28 * MIN);
    w.time.advance(2 * MIN);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device, { ended: T0 + 30 * MIN, planned_ms: 30 * MIN }));
    assert.equal(d.focus.lapsToday(), 1);
    assert.equal(d.focus.race().you_ms, 30 * MIN);
  });

  it('extended after the bell, then stopped: it rang once, so it stays a lap, with the minutes it ran', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    w.time.advance(LAP + MIN);
    d.focus.extend();
    w.time.advance(MIN);
    d.focus.stop();
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device, { ended: T0 + 27 * MIN, planned_ms: 30 * MIN }));
    assert.equal(d.focus.lapsToday(), 1);
    // The stop is an edit a person made: stamped from the clock, so it is newer than the first bell's row.
    assert.ok(d.engine.cells().filter((c) => c.dataset === 'session').every((c) => c.stamp.startsWith('2026-11-24T04:57:00.000Z-')));
  });

  // Idle at this place in the set, then one lap run past its bell, extended, and two minutes into the extension.
  async function extendedLap(setIndex: number) {
    const w = world();
    const d = await w.device('a');
    d.engine.write('timer', 'current', { state: { ...d.focus.state.value, set_index: setIndex } });
    d.focus.start();
    await d.settle();
    w.time.advance(LAP + MIN);
    d.focus.extend();
    w.time.advance(2 * MIN);
    assert.equal(d.focus.view().over, false);
    return { w, d };
  }

  it('extended after the bell, then stopped: the set moves on, and after lap four comes lap one', async () => {
    const first = await extendedLap(0);
    first.d.focus.stop();
    assert.equal(first.d.session('run-1')?.outcome, 'rang');
    assert.deepEqual(first.d.focus.view().next, { phase: 'work', set_index: 1 });

    // Lap four, and paused in its extension when it is stopped.
    const fourth = await extendedLap(3);
    fourth.d.focus.pause();
    fourth.w.time.advance(10 * MIN);
    fourth.d.focus.stop();
    assert.equal(fourth.d.session('run-1')?.outcome, 'rang');
    assert.deepEqual(fourth.d.focus.view().next, { phase: 'work', set_index: 0 });
  });

  it('extended after the bell, then a new lap started directly: it is the next lap, started now', async () => {
    const first = await extendedLap(0);
    first.d.focus.skipBreak('t2');
    assert.deepEqual(first.d.focus.state.value, {
      phase: 'work', run: 'run-2', task: 't2', started: T0 + 28 * MIN, paused_at: null, paused_ms: 0, planned_ms: LAP, set_index: 1,
    });
    assert.equal(first.d.session('run-1')?.outcome, 'rang');

    const fourth = await extendedLap(3);
    fourth.d.focus.skipBreak();
    assert.equal(fourth.d.focus.state.value.set_index, 0);
    assert.equal(fourth.d.focus.state.value.started, T0 + 28 * MIN);
  });

  it('extended after the bell, then the break taken: the break still belongs to the lap it follows', async () => {
    const { d } = await extendedLap(1);
    d.focus.start();
    assert.equal(d.focus.state.value.phase, 'short');
    assert.equal(d.focus.state.value.set_index, 1);
    assert.deepEqual(d.focus.view().next, { phase: 'work', set_index: 2 });
  });

  it('a lap stopped before any bell does not move the set on', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(10 * MIN);
    d.focus.stop();
    assert.equal(d.session('run-1')?.outcome, 'stopped');
    assert.deepEqual(d.focus.view().next, { phase: 'work', set_index: 0 });
  });

  it('extended after the bell, then set aside: set aside wins', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    w.time.advance(LAP + MIN);
    d.focus.extend();
    w.time.advance(MIN);
    d.focus.setAside();
    assert.equal(d.session('run-1')?.outcome, 'void');
    assert.equal(d.focus.lapsToday(), 0);
  });

  it('extend long after the bell does nothing: no minutes nobody worked, and no second row', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    w.time.advance(LAP + 6 * MIN);
    const cells = d.engine.cells();
    d.focus.extend();
    assert.deepEqual(d.engine.cells(), cells);
    assert.equal(d.focus.view().over, true);
    w.time.advance(10 * MIN);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device));
  });

  it('a timer from somewhere that ends weeks from now: the watch waits a day at most and looks again, it does not spin', async () => {
    const w = world();
    const d = await w.device('a');
    // 40 days: more ms than a browser's timer can count, where such a wait would fire at once.
    const far = { phase: 'work', run: 'run-far', task: null, started: T0, paused_at: null, paused_ms: 0, planned_ms: 40 * 86400000, set_index: 0 };
    d.receive([{ stamp: eventStamp(T0, 'b2c3d4e5f6071829'), dataset: 'timer', row: 'current', field: 'state', value: far }]);
    assert.equal(w.waits.at(-1), 86400000);
    const asked = w.waits.length;
    w.time.advance(3 * 86400000);
    assert.equal(w.waits.length, asked + 3, 'one look a day');
    assert.ok(w.waits.every((ms) => ms <= 86400000));
    assert.deepEqual(d.sessions(), []);
  });

  it('close() stops the watch', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    assert.equal(w.time.waiting(), 1);
    d.focus.close();
    // Nothing left waiting: in Node a timer 25 minutes out would hold the process open.
    assert.equal(w.time.waiting(), 0);
    w.time.advance(LAP);
    assert.deepEqual(d.sessions(), []);
  });
});

describe('undo', () => {
  // A lap six minutes in, in step with the server.
  async function sixMinutesIn() {
    const w = world();
    const d = await w.device('a');
    d.focus.start('task-pointers');
    await d.settle();
    w.time.advance(6 * MIN);
    return { w, d, before: d.focus.state.value };
  }
  const stampsOf = (d: { engine: { cells(): Cell[] } }) => [...new Set(d.engine.cells().filter((c) => c.dataset === 'session').map((c) => c.stamp.slice(0, 29)))];

  it('stop, undo, then the bell: one rang row with the full lap, and the seconds in between counted', async () => {
    const { w, d, before } = await sixMinutesIn();
    assert.equal(d.focus.undoable.value, false);
    d.focus.stop();
    assert.equal(d.focus.undoable.value, true);
    assert.equal(d.session('run-1')?.outcome, 'stopped');
    w.time.advance(3000);
    d.focus.undo();
    assert.equal(d.focus.undoable.value, false);
    assert.deepEqual(d.focus.state.value, before);
    assert.equal(d.focus.ran(), 6 * MIN + 3000);
    // Nothing else was rewritten: the row of the stop is still there, and the race looks past it.
    assert.equal(d.session('run-1')?.outcome, 'stopped');
    assert.equal(d.focus.race().you_ms, 6 * MIN + 3000);
    await d.settle();
    w.time.advance(LAP - 6 * MIN - 3000);
    assert.deepEqual(d.sessions(), ['run-1']);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device, { task: 'task-pointers' }));
    // The bell's row is stamped when the timer cell was last written: at the undo, after the stop.
    assert.deepEqual(stampsOf(d), ['2026-11-24T04:36:03.000Z-0000']);
    assert.equal(d.focus.lapsToday(), 1);
    assert.equal(d.focus.race().you_ms, LAP);
  });

  it('set aside, undo, then the bell: rang, not void', async () => {
    const { w, d } = await sixMinutesIn();
    d.focus.setAside();
    assert.equal(d.session('run-1')?.outcome, 'void');
    w.time.advance(2000);
    d.focus.undo();
    w.time.advance(LAP);
    assert.equal(d.session('run-1')?.outcome, 'rang');
    assert.equal(d.session('run-1')?.ended, T0 + LAP);
    assert.equal(d.focus.lapsToday(), 1);
  });

  it('set aside after the bell, then undo: the lap is a lap again at once', async () => {
    const { w, d } = await sixMinutesIn();
    w.time.advance(LAP);
    assert.equal(d.session('run-1')?.outcome, 'rang');
    d.focus.setAside();
    assert.equal(d.session('run-1')?.outcome, 'void');
    assert.equal(d.focus.lapsToday(), 0);
    w.time.advance(1000);
    d.focus.undo();
    assert.equal(d.focus.view().over, true);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device, { task: 'task-pointers' }));
    assert.equal(d.focus.lapsToday(), 1);
  });

  it('stop, undo, stop again: one stopped row, with the later end', async () => {
    const { w, d } = await sixMinutesIn();
    d.focus.stop();
    w.time.advance(4000);
    d.focus.undo();
    w.time.advance(2 * MIN);
    d.focus.stop();
    assert.deepEqual(d.sessions(), ['run-1']);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device, { task: 'task-pointers', ended: T0 + 8 * MIN + 4000, outcome: 'stopped' }));
    assert.deepEqual(stampsOf(d), ['2026-11-24T04:38:04.000Z-0000', '2026-11-24T04:38:04.000Z-0001', '2026-11-24T04:38:04.000Z-0002', '2026-11-24T04:38:04.000Z-0003', '2026-11-24T04:38:04.000Z-0004', '2026-11-24T04:38:04.000Z-0005', '2026-11-24T04:38:04.000Z-0006', '2026-11-24T04:38:04.000Z-0007']);
    // And that second stop can be taken back too.
    assert.equal(d.focus.undoable.value, true);
  });

  it('a stop that left no row: undo just puts the timer back, and the lap rings as if nothing happened', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    await d.settle();
    w.time.advance(30000);
    const before = d.focus.state.value;
    d.focus.stop();
    assert.deepEqual(d.sessions(), []);
    d.focus.undo();
    assert.deepEqual(d.focus.state.value, before);
    assert.deepEqual(d.sessions(), []);
    w.time.advance(LAP);
    assert.deepEqual(d.session('run-1'), lapRow(d.engine.device));
  });

  it('is offered for ten seconds and no longer', async () => {
    const { w, d } = await sixMinutesIn();
    d.focus.stop();
    w.time.advance(9999);
    assert.equal(d.focus.undoable.value, true);
    w.time.advance(1);
    assert.equal(d.focus.undoable.value, false);
    d.focus.undo();
    assert.equal(d.focus.state.value.phase, 'idle');
    assert.equal(d.session('run-1')?.outcome, 'stopped');
  });

  it('ends at once when another device writes the timer', async () => {
    const { w, d } = await sixMinutesIn();
    const b = await w.device('b');
    d.focus.stop();
    await d.settle();
    w.exchange(d, b);
    w.time.advance(2000);
    b.focus.start();
    d.receive(b.engine.cells());
    assert.equal(d.focus.undoable.value, false);
    d.focus.undo();
    assert.equal(d.focus.state.value.run, 'run-2');
    assert.equal(d.session('run-1')?.outcome, 'stopped');
  });

  it('ends at once when a new run is started here', async () => {
    const { w, d } = await sixMinutesIn();
    d.focus.stop();
    w.time.advance(2000);
    d.focus.start();
    assert.equal(d.focus.undoable.value, false);
    d.focus.undo();
    assert.equal(d.focus.state.value.run, 'run-2');
  });

  it('is not offered after a restart', async () => {
    const { w, d } = await sixMinutesIn();
    d.focus.stop();
    const again = await w.restart(d);
    assert.equal(again.focus.undoable.value, false);
    again.focus.undo();
    assert.equal(again.focus.state.value.phase, 'idle');
  });

  it('does nothing when there is nothing to undo', async () => {
    const { d, before } = await sixMinutesIn();
    d.focus.undo();
    assert.equal(d.focus.state.value, before);
  });

  it('after an undo, a run replaced by another device\'s is closed with the minutes it went on to run', async () => {
    const { w, d } = await sixMinutesIn();
    const b = await w.device('b');
    d.focus.stop();
    w.time.advance(3000);
    d.focus.undo();
    d.disconnect();
    b.disconnect();
    w.time.advance(4 * MIN);
    b.focus.start();
    w.time.advance(2 * MIN);
    d.receive(b.engine.cells());
    assert.equal(d.focus.state.value.run, 'run-2');
    assert.equal(d.session('run-1')?.outcome, 'stopped');
    assert.equal(d.session('run-1')?.ended, T0 + 12 * MIN + 3000);
  });

  it('another device follows along: it sees the stop, the undo, and writes the same bell', async () => {
    const { w, d } = await sixMinutesIn();
    const b = await w.device('b');
    d.focus.stop();
    await d.settle();
    w.exchange(d, b);
    assert.equal(b.focus.state.value.phase, 'idle');
    assert.equal(b.focus.undoable.value, false, 'the stop was not made on b');
    w.time.advance(3000);
    d.focus.undo();
    await d.settle();
    w.exchange(d, b);
    assert.equal(b.focus.state.value.run, 'run-1');
    w.time.advance(LAP);
    w.exchange(d, b);
    assert.equal(d.session('run-1')?.outcome, 'rang');
    assert.deepEqual(w.sorted(d.engine), w.sorted(b.engine));
  });
});

describe('replaced by another device\'s run', () => {
  // Both offline, each starts its own run. b's is the later, so it takes the timer.
  async function twoRuns(w: ReturnType<typeof world>, log?: Write[]) {
    const a = await w.device('a', { log });
    const b = await w.device('b');
    a.disconnect();
    b.disconnect();
    a.focus.start('task-a');
    w.time.advance(5 * MIN);
    b.focus.start('task-b');
    w.time.advance(7 * MIN);
    await a.engine.saved();
    return { a, b };
  }

  it('the run it replaces is closed as stopped at that moment, once, in the same transaction as the cell that replaced it', async () => {
    const w = world();
    const log: Write[] = [];
    const { a, b } = await twoRuns(w, log);
    log.length = 0;
    a.receive(b.engine.cells());
    await a.engine.saved();
    assert.equal(a.focus.state.value.run, 'run-2');
    assert.deepEqual(a.session('run-1'), lapRow(a.engine.device, { task: 'task-a', ended: T0 + 12 * MIN, outcome: 'stopped' }));
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => c.dataset).toSorted(), [...Array(8).fill('session'), 'timer']);

    // Nothing more happens for it: not on the next change, not after a restart.
    const row = a.engine.cells().filter((c) => c.dataset === 'session');
    w.time.advance(MIN);
    await a.connect();
    const again = await w.restart(a);
    assert.deepEqual(again.engine.cells().filter((c) => c.dataset === 'session' && c.row === 'run-1'), row);
    // And the timer it lost to is untouched, and b's run is b's to close.
    assert.equal(again.focus.state.value.run, 'run-2');
    assert.deepEqual(b.sessions(), []);
  });

  it('a restart before the replacement arrives: the open run is still known, and is closed once when it does', async () => {
    const w = world();
    const { a, b } = await twoRuns(w);
    const again = await w.restart(a, { online: false });
    assert.equal(again.focus.state.value.run, 'run-1');
    again.receive(b.engine.cells());
    assert.equal(again.session('run-1')?.outcome, 'stopped');
    assert.equal(again.session('run-1')?.ended, T0 + 12 * MIN);
    const cells = again.engine.cells();
    again.receive(b.engine.cells());
    assert.deepEqual(again.engine.cells(), cells);
  });

  it('replaced after its bell: the lap rang, and is written once whichever came first', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.disconnect();
    b.disconnect();
    a.focus.start();
    w.time.advance(LAP + 5 * MIN);
    assert.equal(a.session('run-1')?.outcome, 'rang');
    const row = a.engine.cells().filter((c) => c.dataset === 'session');
    b.focus.start();
    a.receive(b.engine.cells());
    assert.deepEqual(a.engine.cells().filter((c) => c.dataset === 'session'), row);
  });

  it('replaced when the other device already wrote the row for our run: its row stands', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    // On b: set our run aside, then start another. a learns of both at once.
    w.time.advance(10 * MIN);
    b.focus.setAside();
    w.time.advance(MIN);
    b.focus.start();
    w.time.advance(5 * MIN);
    a.receive(b.engine.cells());
    assert.equal(a.session('run-1')?.outcome, 'void');
    assert.equal(a.session('run-1')?.device, b.engine.device);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('stopped on another device is not replaced: whoever stopped it wrote the row, or meant there to be none', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    w.time.advance(30000);
    b.focus.stop();
    w.time.advance(5 * MIN);
    a.receive(b.engine.cells());
    assert.equal(a.focus.state.value.phase, 'idle');
    assert.deepEqual(a.sessions(), []);
  });

  it('a run another device wrote last is not ours to close', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const c = await w.device('c');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    w.time.advance(5 * MIN);
    // b pauses a's run: b is now the last writer of it.
    b.focus.pause();
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    w.time.advance(MIN);
    c.focus.start();
    a.receive(c.engine.cells());
    b.receive(c.engine.cells());
    assert.deepEqual(a.sessions(), []);
    assert.equal(b.session('run-1')?.outcome, 'stopped');
    assert.equal(b.session('run-1')?.ended, T0 + 5 * MIN, 'where its pause began');
  });
});

describe('a new day', () => {
  // T0 is 10:00 local. Local midnight is 14 hours on.
  const DAY = 24 * 60 * MIN;

  it('the first lap of a new local day is lap one, wherever yesterday stopped', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(LAP);
    d.focus.start();
    w.time.advance(5 * MIN);
    d.focus.start();
    w.time.advance(LAP);
    // Two laps done, the second bell at 10:55. Yesterday's set says a short break, then lap three.
    assert.deepEqual(d.focus.view().next, { phase: 'short', set_index: 1 });
    w.time.advance(DAY);
    assert.deepEqual(d.focus.view().next, { phase: 'work', set_index: 0 });
    d.focus.start();
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.set_index, 0);
  });

  it('on the same day the set goes on, even hours later', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(LAP);
    d.focus.stop();
    assert.equal(d.focus.state.value.set_index, 1);
    w.time.advance(13 * 60 * MIN);
    d.focus.start();
    assert.equal(d.focus.state.value.set_index, 1);
  });

  it('an idle timer left at lap three yesterday starts at lap one today', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(LAP);
    d.focus.skipBreak();
    w.time.advance(LAP);
    d.focus.stop();
    assert.equal(d.focus.state.value.set_index, 2);
    w.time.advance(DAY);
    d.focus.skipBreak();
    assert.equal(d.focus.state.value.set_index, 0);
  });

  it('a lap started before midnight that rings after it is still the same sitting: its break is earned', async () => {
    const w = world();
    const d = await w.device('a');
    // 23:50 local.
    w.time.advance(13 * 60 * MIN + 50 * MIN);
    d.focus.start();
    w.time.advance(LAP + MIN);
    assert.deepEqual(d.focus.view().next, { phase: 'short', set_index: 0 });
    d.focus.start();
    assert.equal(d.focus.state.value.phase, 'short');
  });
});

describe('the race and the counts', () => {
  it('you: the laps of today plus the lap in progress; the ghost: the same stretch of the same weekday last week', async () => {
    const w = world();
    const d = await w.device('a');
    // Last Tuesday, 09:00 to 09:25 and 09:50 to 10:15 local.
    const week = 7 * 24 * 60 * MIN;
    d.engine.write('session', 'old-1', { kind: 'work', task: null, started: T0 - week - 60 * MIN, ended: T0 - week - 35 * MIN, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: d.engine.device });
    d.engine.write('session', 'old-2', { kind: 'work', task: null, started: T0 - week - 10 * MIN, ended: T0 - week + 15 * MIN, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: d.engine.device });
    assert.deepEqual(d.focus.race(), { you_ms: 0, ghost: { day: '2026-11-17', ms: 35 * MIN, total_ms: 50 * MIN }, split_ms: -35 * MIN });
    d.focus.start();
    w.time.advance(10 * MIN);
    assert.deepEqual(d.focus.race(), { you_ms: 10 * MIN, ghost: { day: '2026-11-17', ms: 45 * MIN, total_ms: 50 * MIN }, split_ms: -35 * MIN });
    assert.equal(d.focus.lapsToday(), 0);
    w.time.advance(15 * MIN);
    assert.equal(d.focus.race().you_ms, 25 * MIN);
    assert.equal(d.focus.lapsToday(), 1);
  });

  it('a lap whose bell has gone counts as a lap before its row is written, as it does in the race, and once when the row comes', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    // b is offline with a's timer: it may not write the bell, but it heard it.
    b.disconnect();
    w.time.advance(LAP - 1);
    assert.equal(b.focus.lapsToday(), 0);
    w.time.advance(1 + MIN);
    assert.deepEqual(b.sessions(), []);
    assert.equal(b.focus.lapsToday(), 1);
    assert.equal(b.focus.race().you_ms, LAP);
    w.exchange(a, b);
    assert.equal(b.session('run-1')?.outcome, 'rang');
    assert.equal(b.focus.lapsToday(), 1);
  });

  it('a break whose bell has gone is not a lap, and neither is a lap set aside', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    w.time.advance(LAP);
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(10 * MIN);
    assert.equal(b.focus.view().over, true);
    assert.equal(b.focus.lapsToday(), 1, 'the lap before the break, and not the break');
    a.focus.skipBreak();
    await a.settle();
    w.exchange(a, b);
    w.time.advance(LAP + MIN);
    assert.equal(b.focus.lapsToday(), 2);
    a.focus.setAside();
    w.time.advance(MIN);
    assert.equal(a.focus.lapsToday(), 1);
    // The row reaches b a moment before the timer cell does: the lap is already not a lap there.
    b.receive(a.engine.cells().filter((c) => c.dataset === 'session'));
    assert.equal(b.focus.view().over, true);
    assert.equal(b.focus.lapsToday(), 1);
  });

  it('a lap extended after its bell and rung again, with only the first bell\'s row held, is one lap', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    w.time.advance(LAP + MIN);
    a.focus.extend();
    await a.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(10 * MIN);
    assert.equal(b.focus.view().over, true);
    assert.equal(b.session('run-1')?.ended, T0 + LAP, 'b may not write the second bell');
    assert.equal(b.focus.lapsToday(), 1);
  });

  it('a row with cells still to arrive is not counted, and does not break the count', async () => {
    const w = world();
    const d = await w.device('a');
    const half = (field: string, value: unknown) => ({ stamp: eventStamp(T0, 'b2c3d4e5f6071829'), dataset: 'session', row: 'half', field, value });
    d.receive([half('kind', 'work'), half('outcome', 'rang'), half('device', 'b2c3d4e5f6071829')]);
    assert.deepEqual(d.focus.race(), { you_ms: 0, ghost: null, split_ms: null });
    assert.equal(d.focus.lapsToday(), 0);
  });
});
