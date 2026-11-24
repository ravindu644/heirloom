// Automatic starts (protocol section 16) on the real engine: see world.ts for the devices.
// A lap is 25 minutes, a short break 5, a long one 15.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stampCounter, stampDevice, stampMs } from '../core/hlc.ts';
import type { Write } from '../store/store.ts';
import { T0 } from './fakes.ts';
import { LAP, MIN, world } from './world.ts';

const SHORT = 5 * MIN;
const LONG = 15 * MIN;
const HOUR = 60 * MIN;

type Device = Awaited<ReturnType<ReturnType<typeof world>['device']>>;
const auto = (d: Device, fields: { auto_break?: boolean; auto_work?: boolean }) => d.engine.write('settings', 'current', fields);
const outcomes = (d: Device) => Object.fromEntries([...d.engine.rows('session').value].map(([id, row]) => [id, `${row.kind} ${row.outcome}`]));

describe('an automatic break', () => {
  it('starts at the lap\'s bell: begun at the bell, under the rung run\'s id with a mark, in the same store transaction as the bell\'s row', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    auto(d, { auto_break: true });
    d.focus.start('task-pointers');
    await d.settle();
    const started = d.engine.stamp('timer', 'current', 'state')!;
    log.length = 0;
    w.time.advance(LAP);
    await d.engine.saved();
    assert.deepEqual(d.focus.state.value, {
      phase: 'short', run: 'run-1_', task: null, started: T0 + LAP, paused_at: null, paused_ms: 0, planned_ms: SHORT, set_index: 0,
    });
    assert.deepEqual(outcomes(d), { 'run-1': 'work rang' });
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => c.dataset).toSorted(), [...Array(8).fill('session'), 'timer']);
    // Stamped just after the cell it follows: the same moment, one more on the counter, this device.
    const stamp = d.engine.stamp('timer', 'current', 'state')!;
    assert.deepEqual([stampMs(stamp), stampCounter(stamp), stampDevice(stamp)], [stampMs(started), stampCounter(started) + 1, d.engine.device]);
    // An id the server will take as a row id, when this break's own row comes to be written.
    assert.match(d.focus.state.value.run!, /^[A-Za-z0-9_-]{1,64}$/);
    w.time.advance(SHORT);
    assert.deepEqual(outcomes(d), { 'run-1': 'work rang', 'run-1_': 'short rang' });
    assert.equal(d.focus.state.value.run, 'run-1_', 'with auto_work off the break\'s bell starts nothing');
  });

  it('with the option off the bell starts nothing: starting is a declaration', async () => {
    const w = world();
    const d = await w.device('a');
    d.focus.start();
    w.time.advance(LAP + MIN);
    assert.equal(d.focus.state.value.run, 'run-1');
    assert.equal(d.focus.view().over, true);
  });

  it('the fourth lap earns the long break, and after the long break nothing starts by itself', async () => {
    const w = world();
    const d = await w.device('a');
    auto(d, { auto_break: true, auto_work: true });
    d.engine.write('timer', 'current', { state: { ...d.focus.state.value, set_index: 3 } });
    d.focus.start();
    w.time.advance(LAP);
    assert.deepEqual([d.focus.state.value.phase, d.focus.state.value.planned_ms, d.focus.state.value.set_index], ['long', LONG, 3]);
    w.time.advance(LONG + HOUR);
    assert.equal(d.focus.state.value.phase, 'long');
    assert.equal(d.focus.view().over, true);
    assert.deepEqual(outcomes(d), { 'run-1': 'work rang', 'run-1_': 'long rang' });
  });
});

describe('an automatic lap', () => {
  it('starts at a short break\'s bell as the next lap of the set, and the whole set runs to its long break and stops', async () => {
    const w = world();
    const d = await w.device('a');
    auto(d, { auto_break: true, auto_work: true });
    d.focus.start();
    w.time.advance(LAP + SHORT);
    assert.deepEqual(d.focus.state.value, {
      phase: 'work', run: 'run-1__', task: null, started: T0 + LAP + SHORT, paused_at: null, paused_ms: 0, planned_ms: LAP, set_index: 1,
    });
    // On through laps three and four, their breaks, and the long break.
    w.time.advance(3 * LAP + 2 * SHORT + LONG + HOUR);
    assert.deepEqual(outcomes(d), {
      'run-1': 'work rang', 'run-1_': 'short rang', 'run-1__': 'work rang', 'run-1___': 'short rang',
      'run-1____': 'work rang', 'run-1_____': 'short rang', 'run-1______': 'work rang', 'run-1_______': 'long rang',
    });
    assert.equal(d.focus.state.value.phase, 'long');
    assert.equal(d.focus.lapsToday(), 4);
  });

  it('goes on with the task at the top of today\'s list when the lap before the break was on it', async () => {
    const w = world();
    const d = await w.device('a');
    auto(d, { auto_break: true, auto_work: true });
    const top = d.today.add('pointers ~4')!;
    d.today.add('arrays');
    d.focus.start(top);
    w.time.advance(LAP + SHORT);
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.task, top);
  });

  it('is for no task when the lap before the break was on another task, or the top of the list has changed', async () => {
    const w = world();
    const d = await w.device('a');
    auto(d, { auto_break: true, auto_work: true });
    const top = d.today.add('pointers')!;
    const second = d.today.add('arrays')!;
    d.focus.start(second);
    w.time.advance(LAP + SHORT);
    assert.equal(d.focus.state.value.task, null, 'it was on the second task: which next is the person\'s to say');
    d.focus.stop();
    // On the top task this time, but it is done during the break.
    d.focus.start(top);
    w.time.advance(LAP + MIN);
    d.today.setDone(top, true);
    w.time.advance(SHORT);
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.task, null);
  });
});

describe('two devices, one bell', () => {
  it('both see the bell and both write: one timer state, one row for the run, and no stray stopped row', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    auto(a, { auto_break: true, auto_work: true });
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    // Neither hears from the other until after the bell.
    w.time.advance(LAP);
    assert.equal(a.focus.state.value.run, 'run-1_');
    assert.deepEqual(a.focus.state.value, b.focus.state.value);
    w.exchange(a, b);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
    assert.deepEqual(outcomes(a), { 'run-1': 'work rang' });
    // And on through the break's bell, each alone again.
    w.time.advance(SHORT);
    w.exchange(a, b);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
    assert.deepEqual(outcomes(b), { 'run-1': 'work rang', 'run-1_': 'short rang' });
    assert.equal(b.focus.state.value.run, 'run-1__');
    assert.equal(Object.values(outcomes(a)).some((outcome) => outcome.includes('stopped')), false);
  });

  it('a person\'s start a second after the automatic one wins, on both devices', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    auto(a, { auto_break: true });
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    w.time.advance(LAP);
    assert.equal(b.focus.state.value.phase, 'short');
    w.time.advance(1000);
    // On a, offline: straight into the next lap instead of the break that began by itself.
    a.focus.skipBreak();
    assert.equal(a.focus.state.value.phase, 'work');
    w.exchange(a, b);
    assert.equal(b.focus.state.value.phase, 'work');
    assert.deepEqual(a.focus.state.value, b.focus.state.value);
    assert.equal(a.focus.state.value.set_index, 1);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('a stop made on another device before the bell is newer than a start made by itself at the bell', async () => {
    const w = world();
    const phone = await w.device('a');
    const laptop = await w.device('b');
    auto(phone, { auto_break: true });
    phone.focus.start();
    await phone.settle();
    w.exchange(phone, laptop);
    phone.disconnect();
    w.time.advance(10 * MIN);
    laptop.focus.stop();
    // The phone sleeps through the bell and wakes with its own timer still showing the lap.
    w.time.jump(20 * MIN);
    w.time.advance(0);
    assert.equal(phone.focus.state.value.phase, 'short');
    w.exchange(phone, laptop);
    assert.equal(phone.focus.state.value.phase, 'idle');
    assert.equal(laptop.focus.state.value.phase, 'idle');
    assert.equal(outcomes(phone)['run-1'], 'work stopped');
  });
});

describe('when nothing starts', () => {
  it('a bell three hours old: its row is written, and the timer is left as it was', async () => {
    const w = world();
    const d = await w.device('a');
    auto(d, { auto_break: true, auto_work: true });
    d.focus.start();
    await d.settle();
    d.disconnect();
    w.time.jump(LAP + 3 * HOUR);
    w.time.advance(0);
    assert.deepEqual(outcomes(d), { 'run-1': 'work rang' });
    assert.equal(d.focus.state.value.run, 'run-1');
  });

  it('a bell under two hours old still starts the break, begun at the bell and long over by now', async () => {
    const w = world();
    const d = await w.device('a');
    auto(d, { auto_break: true });
    d.focus.start();
    await d.settle();
    d.disconnect();
    w.time.jump(LAP + 2 * HOUR);
    w.time.advance(0);
    assert.equal(d.focus.state.value.run, 'run-1_');
    assert.equal(d.focus.state.value.started, T0 + LAP);
    assert.equal(d.focus.view().over, true);
    assert.deepEqual(outcomes(d), { 'run-1': 'work rang', 'run-1_': 'short rang' });
  });

  it('a device that may not write the bell starts nothing: offline with another device\'s timer', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    auto(a, { auto_break: true });
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(LAP + MIN);
    assert.equal(b.focus.state.value.run, 'run-1');
    assert.deepEqual(outcomes(b), {});
    // The device that could, did: when b hears of it, that is the state.
    w.exchange(a, b);
    assert.equal(b.focus.state.value.run, 'run-1_');
  });

  it('a device that holds the bell\'s row already leaves the start to whoever wrote it', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    w.time.advance(LAP + MIN);
    w.exchange(a, b);
    // The option is switched on after the bell: nothing begins a minute late and backdated.
    auto(a, { auto_break: true });
    w.exchange(a, b);
    w.time.advance(MIN);
    assert.equal(a.focus.state.value.run, 'run-1');
    assert.equal(b.focus.state.value.run, 'run-1');
  });
});
