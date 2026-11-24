// Today on the real engine: see world.ts for the devices these tests run on.
// T0 is 10:00 on Tuesday 2026-11-24 in Sri Lanka; local midnight is 14 hours on.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Write } from '../store/store.ts';
import { T0 } from './fakes.ts';
import { LAP, MIN, world } from './world.ts';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TODAY = '2026-11-24';
const TOMORROW = '2026-11-25';

type Device = Awaited<ReturnType<ReturnType<typeof world>['device']>>;
const titles = (list: { title: string }[]) => list.map((t) => t.title);
// Today's open tasks as the screen lists them: running, next, then the rest.
const open = (d: Device) => titles([d.today.running.value, d.today.next.value, ...d.today.later.value].filter((t) => t !== null));
const next = (d: Device) => d.today.next.value;
const row = (d: Device, id: string) => d.engine.rows('task').value.get(id);
// One lap that rang on a task, as a row.
const lap = (d: Device, id: string, task: string, started: number, over: object = {}) =>
  d.engine.write('session', id, { kind: 'work', task, started, ended: started + LAP, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: d.engine.device, ...over });

describe('adding', () => {
  it('quick add with an estimate: title, estimate, due today and a place at the end, in one store transaction', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    void d.today;
    log.length = 0;
    const id = d.today.add('pointers chapter 3 ~4');
    await d.engine.saved();
    assert.deepEqual(row(d, id!), { id, title: 'pointers chapter 3', estimate: 4, due: TODAY, order: 'V' });
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => c.field), ['title', 'estimate', 'due', 'order']);
    const next = d.today.next.value!;
    assert.deepEqual(next, {
      id, title: 'pointers chapter 3', notes: '', project: null, estimate: 4, laps: 0, squares: [], running: false,
      due: TODAY, when: null, repeat: null, done: false, subtasks: [],
    });
  });

  it('quick add without an estimate, and a line with no title adds nothing', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('  read the K&R preface ');
    assert.equal(d.today.next.value?.title, 'read the K&R preface');
    assert.equal(d.today.next.value?.estimate, null);
    assert.equal(row(d, id!)?.estimate, null);
    const cells = d.engine.cells().length;
    assert.equal(d.today.add('   '), null);
    assert.equal(d.today.add('~3'), null);
    assert.equal(d.engine.cells().length, cells);
  });

  it('each new task goes after the last of today\'s list', async () => {
    const w = world();
    const d = await w.device('a');
    for (const title of ['one', 'two', 'three']) d.today.add(title);
    assert.deepEqual(open(d), ['one', 'two', 'three']);
    assert.equal(d.today.next.value?.title, 'one');
    assert.deepEqual(titles(d.today.later.value), ['two', 'three']);
  });

  it('two devices adding at the end of the same list offline end in one order on both', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.today.add('there before');
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    const fromA = a.today.add('added on a')!;
    const fromB = b.today.add('added on b')!;
    // Each picked the key after the last one it knew: the same key.
    assert.equal(row(a, fromA)?.order, row(b, fromB)?.order);
    w.exchange(a, b);
    assert.deepEqual(open(a), ['there before', 'added on a', 'added on b']);
    assert.deepEqual(open(b), open(a));
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });
});

describe('the lists', () => {
  it('today is what is due by today or has no day, upcoming what is due later, each in its order', async () => {
    const w = world();
    const d = await w.device('a');
    const [overdue, noDay, later, soon, alsoSoon] = ['overdue', 'no day', 'in a week', 'tomorrow', 'also tomorrow'].map((t) => d.today.add(t)!);
    d.today.edit(overdue!, { due: '2026-11-20' });
    d.today.edit(noDay!, { due: null });
    d.today.edit(later!, { due: '2026-12-01' });
    d.today.edit(soon!, { due: TOMORROW });
    d.today.edit(alsoSoon!, { due: TOMORROW });
    assert.deepEqual(open(d), ['overdue', 'no day']);
    assert.deepEqual(titles(d.today.upcoming.value), ['tomorrow', 'also tomorrow', 'in a week']);
  });

  it('the task the timer is on is "running", and the first of the others is "next"', async () => {
    const w = world();
    const d = await w.device('a');
    const [, two] = ['one', 'two', 'three'].map((t) => d.today.add(t)!);
    d.focus.start(two);
    assert.equal(d.today.running.value?.title, 'two');
    assert.equal(d.today.running.value?.running, true);
    assert.equal(d.today.next.value?.title, 'one');
    assert.deepEqual(titles(d.today.later.value), ['three']);
    w.time.advance(5 * MIN);
    d.focus.pause();
    assert.equal(d.today.running.value?.title, 'two', 'paused is still on it');
    d.focus.stop();
    assert.equal(d.today.running.value, null);
    assert.deepEqual(open(d), ['one', 'two', 'three']);
  });

  it('done shows what was done today, in the order it was done, and nothing done yesterday', async () => {
    const w = world();
    const d = await w.device('a');
    const [one, two, three] = ['one', 'two', 'three'].map((t) => d.today.add(t)!);
    d.today.setDone(three!, true);
    w.time.advance(MIN);
    d.today.setDone(one!, true);
    assert.deepEqual(titles(d.today.done.value), ['three', 'one']);
    assert.equal(d.today.done.value[0]!.done, true);
    assert.deepEqual(open(d), ['two']);
    w.time.advance(DAY);
    assert.deepEqual(titles(d.today.done.value), []);
    d.today.setDone(two!, true);
    assert.deepEqual(titles(d.today.done.value), ['two']);
  });

  it('removed tasks are in Recently deleted, newest first, for thirty days', async () => {
    const w = world();
    const d = await w.device('a');
    const [one, two] = ['one', 'two'].map((t) => d.today.add(t)!);
    d.today.remove(one!);
    w.time.advance(DAY);
    d.today.remove(two!);
    assert.deepEqual(open(d), []);
    assert.deepEqual(titles(d.today.deleted.value), ['two', 'one']);
    w.time.advance(29 * DAY - 1);
    assert.deepEqual(titles(d.today.deleted.value), ['two', 'one']);
    w.time.advance(DAY);
    assert.deepEqual(titles(d.today.deleted.value), ['two']);
    d.today.restore(two!);
    assert.deepEqual(titles(d.today.deleted.value), []);
    assert.deepEqual(open(d), ['two']);
  });

  it('a row with no title yet is not a task: it is kept, shown nowhere, and shown when its title comes', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('task', 'half', { due: TODAY, order: 'V', estimate: 2 });
    d.engine.write('task', 'odd', { title: 7, due: TODAY });
    assert.deepEqual(open(d), []);
    assert.deepEqual(d.today.figures().left_laps, 0);
    d.today.setDone('half', true);
    d.today.remove('half');
    d.today.move('half', null);
    assert.equal(row(d, 'half')?.done, undefined);
    d.engine.write('task', 'half', { title: 'arrived' });
    assert.deepEqual(open(d), ['arrived']);
    assert.equal(d.today.next.value?.estimate, 2);
  });

  it('fields a newer build wrote differently read as unset, never as something to trip on', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('task', 't1', { title: 'odd fields', estimate: 'four', due: 'next week', repeat: { every: 'month' }, when: 9, notes: null, order: 3, project: 'gone' });
    assert.deepEqual(d.today.next.value, {
      id: 't1', title: 'odd fields', notes: '', project: null, estimate: null, laps: 0, squares: [], running: false,
      due: null, when: null, repeat: null, done: false, subtasks: [],
    });
  });
});

describe('midnight', () => {
  it('a task due tomorrow moves from Upcoming to Today at local midnight, without anyone tapping', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('for tomorrow')!;
    d.today.edit(id, { due: TOMORROW });
    assert.equal(d.today.day.value, TODAY);
    assert.deepEqual(titles(d.today.upcoming.value), ['for tomorrow']);
    let changes = 0;
    const stop = d.today.next.subscribe(() => changes++);
    w.time.advance(14 * HOUR - 1);
    assert.equal(d.today.day.value, TODAY);
    assert.equal(next(d), null);
    w.time.advance(1);
    assert.equal(d.today.day.value, TOMORROW);
    assert.equal(next(d)?.title, 'for tomorrow');
    assert.deepEqual(d.today.upcoming.value, []);
    assert.equal(changes, 2, 'the signal itself changed: once on subscribe, once at midnight');
    stop();
    // And the night after.
    w.time.advance(DAY);
    assert.equal(d.today.day.value, '2026-11-26');
  });

  it('a device that slept through midnight has the new day when it wakes', async () => {
    const w = world();
    const d = await w.device('a');
    void d.today;
    w.time.jump(20 * HOUR);
    w.time.advance(0);
    assert.equal(d.today.day.value, TOMORROW);
  });

  it('close() leaves no timer waiting', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('x')!;
    d.focus.start(id);
    d.close();
    assert.equal(w.time.waiting(), 0);
  });
});

describe('laps and squares', () => {
  it('a task over its estimate, "6 of 5", has six squares', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('exercise 5-3 ~5')!;
    for (let n = 0; n < 6; n++) lap(d, `lap-${n}`, id, T0 - (6 - n) * 30 * MIN);
    const task = d.today.next.value!;
    assert.equal(task.estimate, 5);
    assert.equal(task.laps, 6);
    assert.deepEqual(task.squares, [1, 1, 1, 1, 1, 1]);
    assert.equal(d.today.figures().left_laps, 0, 'over the estimate leaves nothing planned, not less than nothing');
  });

  it('a stopped lap is a part square, a lap set aside none, and the lap in progress fills as it runs without anyone writing', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('pointers ~4')!;
    lap(d, 'lap-a', id, T0 - 2 * HOUR);
    lap(d, 'lap-b', id, T0 - 90 * MIN, { ended: T0 - 90 * MIN + 15 * MIN, outcome: 'stopped' });
    lap(d, 'lap-c', id, T0 - 60 * MIN, { outcome: 'void' });
    assert.deepEqual(d.today.next.value?.squares, [1, 0.6]);
    assert.equal(d.today.next.value?.laps, 1);

    d.focus.start(id);
    await d.settle();
    const cells = d.engine.cells();
    assert.deepEqual(d.today.running.value?.squares, [1, 0.6, 0]);
    w.time.advance(10 * MIN);
    assert.deepEqual(d.today.running.value?.squares, [1, 0.6, 0.4]);
    assert.deepEqual(d.engine.cells(), cells, 'the square moved and nothing was written');
    // At the bell the square is whole and the lap counts.
    w.time.advance(15 * MIN);
    assert.deepEqual(next(d)?.squares, [1, 0.6, 1]);
    assert.equal(next(d)?.laps, 2);
  });

  it('a lap on the top task rings with no row yet: the task shows the lap and the whole square, and is next again; its row then changes nothing', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.today.add('pointers ~4')!;
    a.today.add('arrays');
    a.focus.start(id);
    await a.settle();
    w.exchange(a, b);
    // b is offline with a's timer: it may not write the bell.
    b.disconnect();
    w.time.advance(LAP - 1000);
    // Still counting: the task is running, and next is the one below.
    assert.equal(b.today.running.value?.title, 'pointers');
    assert.equal(b.today.running.value?.running, true);
    assert.equal(b.today.running.value?.laps, 0);
    assert.ok(b.today.running.value!.squares[0]! < 1);
    assert.equal(next(b)?.title, 'arrays');
    assert.deepEqual(titles(b.today.later.value), []);

    w.time.advance(1000);
    assert.deepEqual(b.sessions(), []);
    const rung = { ...next(b)! };
    assert.equal(b.today.running.value, null);
    assert.equal(rung.title, 'pointers');
    assert.equal(rung.running, false);
    assert.equal(rung.laps, 1, 'never a full square beside "0 of 4"');
    assert.deepEqual(rung.squares, [1]);
    assert.deepEqual(titles(b.today.later.value), ['arrays']);
    assert.equal(b.today.figures().laps, 1);
    assert.equal(b.today.figures().left_laps, 3);

    // The row arrives. Nothing on the screen moves.
    w.exchange(a, b);
    assert.equal(b.session('run-1')?.outcome, 'rang');
    assert.deepEqual(next(b), rung);
    assert.equal(b.today.running.value, null);
    assert.equal(b.today.figures().laps, 1);
  });

  it('a paused lap is still running: the task stays out of the queue until its bell', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('pointers')!;
    d.today.add('arrays');
    d.focus.start(id);
    w.time.advance(5 * MIN);
    d.focus.pause();
    w.time.advance(2 * 60 * MIN);
    assert.equal(d.today.running.value?.title, 'pointers');
    assert.equal(next(d)?.title, 'arrays');
  });

  it('a paused lap stops filling, and a break is on no task', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('pointers')!;
    d.focus.start(id);
    w.time.advance(5 * MIN);
    d.focus.pause();
    w.time.advance(20 * MIN);
    assert.deepEqual(d.today.running.value?.squares, [0.2]);
    d.focus.resume();
    w.time.advance(20 * MIN);
    d.focus.start();
    assert.equal(d.focus.state.value.phase, 'short');
    assert.equal(d.today.running.value, null);
    assert.deepEqual(d.today.next.value?.squares, [1]);
  });
});

describe('figures', () => {
  it('with a lap in progress: time and laps so far, what is still planned, the target, and the ghost\'s whole day', async () => {
    const w = world();
    const d = await w.device('a');
    const [first, second] = ['pointers ~4', 'arrays ~2', 'no estimate'].map((t) => d.today.add(t)!);
    // Last Tuesday: two laps and a stopped one.
    const week = 7 * DAY;
    lap(d, 'old-1', 'whatever', T0 - week - 2 * HOUR);
    lap(d, 'old-2', 'whatever', T0 - week - HOUR);
    lap(d, 'old-3', 'whatever', T0 - week + 5 * HOUR, { ended: T0 - week + 5 * HOUR + 10 * MIN, outcome: 'stopped' });
    // Today: one lap done on the first task, one in progress on the second.
    lap(d, 'lap-today', first!, T0 - HOUR);
    d.today.setTarget(8);
    d.focus.start(second);
    w.time.advance(10 * MIN);
    assert.deepEqual(d.today.figures(), {
      done_ms: 35 * MIN,
      laps: 1,
      left_laps: 3 + 2,
      left_ms: 5 * LAP,
      target: 8,
      ghost: { day: '2026-11-17', total_ms: 60 * MIN, laps: 2 },
    });
    // The bell: the lap counts at once, and one less is left on its task.
    w.time.advance(15 * MIN);
    const after = d.today.figures();
    assert.equal(after.laps, 2);
    assert.equal(after.done_ms, 50 * MIN);
    assert.equal(after.left_laps, 3 + 1);
  });

  it('on a first day there is no ghost, no target reads as 0, and what is left follows the lap length in settings', async () => {
    const w = world();
    const d = await w.device('a');
    d.today.add('pointers ~3');
    d.engine.write('settings', 'current', { work_ms: 50 * MIN });
    assert.deepEqual(d.today.figures(), { done_ms: 0, laps: 0, left_laps: 3, left_ms: 150 * MIN, target: 0, ghost: null });
    d.today.setTarget(6.9);
    assert.equal(d.today.figures().target, 6);
    d.today.setTarget(0);
    assert.equal(d.today.figures().target, 0);
  });

  it('only today\'s list is planned: a task for tomorrow, a done one and a deleted one add nothing', async () => {
    const w = world();
    const d = await w.device('a');
    const [, tomorrow, done, gone] = ['today ~2', 'tomorrow ~3', 'done ~4', 'gone ~5'].map((t) => d.today.add(t)!);
    d.today.edit(tomorrow!, { due: TOMORROW });
    d.today.setDone(done!, true);
    d.today.remove(gone!);
    assert.equal(d.today.figures().left_laps, 2);
  });
});

describe('repeating tasks', () => {
  async function daily(w: ReturnType<typeof world>, name = 'a') {
    const d = await w.device(name);
    const id = d.today.add('read ~2')!;
    d.today.edit(id, { repeat: { every: 'day' }, when: 'after dinner', notes: 'K&R' });
    await d.settle();
    return { d, id };
  }

  it('done makes the next one of the series: the whole row and the done mark in one store transaction', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('read ~2')!;
    d.today.edit(id, { repeat: { every: 'day' }, when: 'after dinner', notes: 'K&R' });
    await d.settle();
    log.length = 0;
    d.today.setDone(id, true);
    await d.engine.saved();
    assert.equal(log.length, 1);
    const next = `${id}-20261125`;
    assert.deepEqual(row(d, next), {
      id: next, project: null, title: 'read', notes: 'K&R', estimate: 2, repeat: { every: 'day' }, when: 'after dinner', order: 'V', due: TOMORROW,
    });
    assert.deepEqual(titles(d.today.done.value), ['read']);
    assert.deepEqual(titles(d.today.upcoming.value), ['read']);
    assert.equal(d.today.upcoming.value[0]!.laps, 0, 'the laps stay with the day they were run');
  });

  it('marked done on two devices offline: one next row, the same on both', async () => {
    const w = world();
    const { d: a, id } = await daily(w);
    const b = await w.device('b');
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    a.today.setDone(id, true);
    w.time.advance(5 * MIN);
    b.today.setDone(id, true);
    w.exchange(a, b);
    assert.deepEqual(titles(a.today.upcoming.value), ['read']);
    assert.deepEqual(titles(b.today.upcoming.value), ['read']);
    assert.equal(a.engine.rows('task').value.size, 2);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('done, undone, done again: the next one goes and comes back, and is never two', async () => {
    const w = world();
    const { d, id } = await daily(w);
    d.today.setDone(id, true);
    assert.deepEqual(titles(d.today.upcoming.value), ['read']);
    d.today.setDone(id, false);
    assert.deepEqual(open(d), ['read']);
    assert.deepEqual(titles(d.today.upcoming.value), []);
    assert.equal(typeof row(d, `${id}-20261125`)?.deleted, 'number');
    d.today.setDone(id, true);
    assert.deepEqual(titles(d.today.upcoming.value), ['read']);
    assert.equal(row(d, `${id}-20261125`)?.deleted, null);
    assert.equal(d.engine.rows('task').value.size, 2);
    // Doing what is already done changes nothing.
    const cells = d.engine.cells();
    d.today.setDone(id, true);
    assert.deepEqual(d.engine.cells(), cells);
  });

  it('undone does not take away a next one the person has since edited', async () => {
    const w = world();
    const { d, id } = await daily(w);
    d.today.setDone(id, true);
    d.today.edit(`${id}-20261125`, { title: 'read chapter 2' });
    d.today.setDone(id, false);
    assert.deepEqual(titles(d.today.upcoming.value), ['read chapter 2']);
    assert.equal(row(d, `${id}-20261125`)?.deleted, undefined);
  });

  it('undone does not take away a next one that has been moved, broken down, or has a lap on it', async () => {
    for (const touch of ['moved', 'subtask', 'lap'] as const) {
      const w = world();
      const { d, id } = await daily(w);
      const other = d.today.add('another')!;
      d.today.edit(other, { due: TOMORROW });
      d.today.setDone(id, true);
      const next = `${id}-20261125`;
      if (touch === 'moved') d.today.move(next, null);
      if (touch === 'subtask') d.today.addSubtask(next, 'the preface');
      if (touch === 'lap') lap(d, 'lap-1', next, T0);
      d.today.setDone(id, false);
      assert.equal(row(d, next)?.deleted, undefined, touch);
    }
  });

  it('done again does not bring back a next one the person changed and then removed', async () => {
    const w = world();
    const { d, id } = await daily(w);
    d.today.setDone(id, true);
    const next = `${id}-20261125`;
    d.today.edit(next, { estimate: 5 });
    d.today.remove(next);
    d.today.setDone(id, false);
    d.today.setDone(id, true);
    assert.equal(typeof row(d, next)?.deleted, 'number');
  });

  it('undone the day after still finds the next one it made', async () => {
    const w = world();
    const { d, id } = await daily(w);
    d.today.setDone(id, true);
    w.time.advance(DAY);
    // The copy for the 25th is on today's list now, untouched.
    assert.deepEqual(open(d), ['read']);
    d.today.setDone(id, false);
    assert.equal(typeof row(d, `${id}-20261125`)?.deleted, 'number');
    assert.deepEqual(open(d), ['read']);
    assert.equal(d.today.next.value?.id, id);
  });

  it('the next of a next keeps the series id, and a late one is due after today, not after its own day', async () => {
    const w = world();
    const { d, id } = await daily(w);
    d.today.setDone(id, true);
    w.time.advance(3 * DAY);
    d.today.setDone(`${id}-20261125`, true);
    assert.equal(row(d, `${id}-20261128`)?.due, '2026-11-28');
    assert.equal(d.engine.rows('task').value.size, 3);
  });

  it('chosen weekdays: the next one is on the next chosen day', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('gym')!;
    // Monday, Wednesday, Friday. Today is a Tuesday.
    d.today.edit(id, { repeat: { every: 'week', days: 21 } });
    d.today.setDone(id, true);
    assert.equal(d.today.upcoming.value[0]?.due, TOMORROW);
    assert.deepEqual(d.today.upcoming.value[0]?.repeat, { every: 'week', days: 21 });
  });
});

describe('removing and restoring', () => {
  it('delete then restore keeps the edits another device made in between', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.today.add('Pointers chapter 3 ~3')!;
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    a.today.remove(id);
    w.time.advance(5 * MIN);
    b.today.edit(id, { title: 'Pointers and arrays', estimate: 4 });
    w.exchange(a, b);
    // Both stay: the delete stands, and the edit is under it.
    assert.deepEqual(open(a), []);
    assert.deepEqual(titles(b.today.deleted.value), ['Pointers and arrays']);
    w.time.advance(MIN);
    a.today.restore(id);
    w.exchange(a, b);
    assert.deepEqual(open(b), ['Pointers and arrays']);
    assert.equal(b.today.next.value?.estimate, 4);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('a parent\'s subtasks go and come back with it, and not one of their cells is written', async () => {
    const w = world();
    const d = await w.device('a');
    const parent = d.today.add('chapter 5')!;
    const first = d.today.addSubtask(parent, ' exercise 5-1 ')!;
    const second = d.today.addSubtask(parent, 'exercise 5-2')!;
    d.today.editSubtask(second, { done: true });
    assert.deepEqual(d.today.next.value?.subtasks, [
      { id: first, title: 'exercise 5-1', done: false },
      { id: second, title: 'exercise 5-2', done: true },
    ]);
    assert.deepEqual(open(d), ['chapter 5'], 'a subtask shows inside its parent only');
    const subCells = () => d.engine.cells().filter((c) => c.row === first || c.row === second);
    const before = subCells();
    d.today.remove(parent);
    assert.deepEqual(d.today.deleted.value[0]?.subtasks.length, 2);
    d.today.restore(parent);
    assert.deepEqual(d.today.next.value?.subtasks.length, 2);
    assert.deepEqual(subCells(), before);
  });

  it('a subtask: its own title and done, removed on its own, and no subtasks of its own', async () => {
    const w = world();
    const d = await w.device('a');
    const parent = d.today.add('chapter 5')!;
    const sub = d.today.addSubtask(parent, 'exercise 5-1')!;
    assert.equal(d.today.addSubtask(parent, '  '), null);
    assert.equal(d.today.addSubtask(sub, 'deeper'), null);
    assert.equal(d.today.addSubtask('nobody', 'orphan'), null);
    d.today.editSubtask(sub, { title: 'exercise 5-1, again' });
    d.today.editSubtask(sub, { title: '   ' });
    assert.deepEqual(d.today.next.value?.subtasks, [{ id: sub, title: 'exercise 5-1, again', done: false }]);
    d.today.remove(sub);
    assert.deepEqual(d.today.next.value?.subtasks, []);
    assert.deepEqual(d.today.deleted.value, []);
  });
});

describe('editing', () => {
  it('writes only the fields given, in one write, and leaves out what no task could hold', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('pointers')!;
    await d.engine.saved();
    log.length = 0;
    d.today.edit(id, { title: '  Pointers, chapter 3 ', estimate: 4, when: ' after dinner ', due: TOMORROW, repeat: { every: 'week', days: 1 } });
    await d.engine.saved();
    assert.equal(log.length, 1);
    assert.deepEqual(row(d, id), { id, title: 'Pointers, chapter 3', estimate: 4, due: TOMORROW, order: 'V', when: 'after dinner', repeat: { every: 'week', days: 1 } });
    const cells = d.engine.cells();
    d.today.edit(id, { title: '   ', estimate: 0, due: 'tomorrow' });
    d.today.edit(id, { estimate: 2.5 });
    d.today.edit('nobody', { title: 'x' });
    assert.deepEqual(d.engine.cells(), cells);
    d.today.edit(id, { estimate: null, due: null, when: '', repeat: { every: 'week', days: 0 } });
    assert.deepEqual(row(d, id), { id, title: 'Pointers, chapter 3', estimate: null, due: null, order: 'V', when: null, repeat: null });
  });
});

describe('projects', () => {
  it('a task shows its project; one that is archived or deleted shows none, and is offered no more', async () => {
    const w = world();
    const d = await w.device('a');
    const c = d.today.addProject(' The C book ', 'you')!;
    const react = d.today.addProject('React', 'rest')!;
    assert.equal(d.today.addProject('  ', 'ink'), null);
    assert.deepEqual(d.today.projects.value, [
      { id: c, name: 'The C book', color: 'you' },
      { id: react, name: 'React', color: 'rest' },
    ]);
    const task = d.today.add('pointers')!;
    d.today.edit(task, { project: c });
    assert.deepEqual(d.today.next.value?.project, { id: c, name: 'The C book', color: 'you' });
    d.today.editProject(c, { name: 'K&R', color: 'heat-2' });
    assert.deepEqual(d.today.next.value?.project, { id: c, name: 'K&R', color: 'heat-2' });
    d.today.editProject(c, { archived: true });
    assert.equal(next(d)?.project, null);
    assert.deepEqual(d.today.projects.value.map((p) => p.name), ['React']);
    d.today.editProject(c, { archived: false });
    assert.equal(next(d)?.project?.name, 'K&R');
    d.engine.write('project', c, { deleted: d.engine.now() });
    assert.equal(next(d)?.project, null);
    // The task still says which project it was: that comes back if the project does.
    assert.equal(row(d, task)?.project, c);
  });

  it('a project with a colour this build does not know is shown in ink, and one with no name yet is not shown', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('project', 'p1', { name: 'From a newer build', color: 'heat-9', order: 'V' });
    d.engine.write('project', 'p2', { color: 'you', order: 'W' });
    assert.deepEqual(d.today.projects.value, [{ id: 'p1', name: 'From a newer build', color: 'ink' }]);
  });
});

describe('moving', () => {
  async function three(w: ReturnType<typeof world>, log?: Write[]) {
    const d = await w.device('a', { log });
    const ids = ['one', 'two', 'three'].map((t) => d.today.add(t)!);
    await d.engine.saved();
    if (log) log.length = 0;
    return { d, ids: ids as [string, string, string] };
  }
  const orders = (log: Write[]) => log.flatMap((write) => write.cells ?? []).filter((c) => c.field === 'order');

  it('before another, or to the end: one key is written', async () => {
    const w = world();
    const log: Write[] = [];
    const { d, ids } = await three(w, log);
    d.today.move(ids[2], ids[0]);
    assert.deepEqual(open(d), ['three', 'one', 'two']);
    d.today.move(ids[2], ids[1]);
    assert.deepEqual(open(d), ['one', 'three', 'two']);
    d.today.move(ids[0], null);
    assert.deepEqual(open(d), ['three', 'two', 'one']);
    // Before itself, or before a task that is not in its list: the end.
    d.today.move(ids[2], 'nobody');
    assert.deepEqual(open(d), ['two', 'one', 'three']);
    await d.engine.saved();
    assert.equal(orders(log).length, 4);
    assert.ok(orders(log).every((c) => /^[0-9A-Za-z]{1,64}$/.test(c.value as string) && !(c.value as string).endsWith('0')));
  });

  it('between two rows that hold the same key: the one after moves up to make room, two keys written', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    for (const [id, order] of [['a', 'V'], ['b', 'W'], ['c', 'W'], ['d', 'X'], ['m', 'z']] as const) d.engine.write('task', id, { title: id, order });
    await d.engine.saved();
    log.length = 0;
    assert.deepEqual(open(d), ['a', 'b', 'c', 'd', 'm']);
    d.today.move('m', 'c');
    assert.deepEqual(open(d), ['a', 'b', 'm', 'c', 'd']);
    await d.engine.saved();
    assert.deepEqual(orders(log).map((c) => c.row), ['m', 'c']);
    assert.equal(log.length, 1, 'one store transaction');
    assert.equal(row(d, 'b')?.order, 'W');
    assert.equal(row(d, 'd')?.order, 'X');
  });

  it('three rows on one key: only those after the gap are rewritten, and they keep their order', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    for (const [id, order] of [['a', 'W'], ['b', 'W'], ['c', 'W'], ['m', 'z']] as const) d.engine.write('task', id, { title: id, order });
    await d.engine.saved();
    log.length = 0;
    d.today.move('m', 'b');
    assert.deepEqual(open(d), ['a', 'm', 'b', 'c']);
    await d.engine.saved();
    assert.deepEqual(orders(log).map((c) => c.row), ['m', 'b', 'c']);
    assert.equal(row(d, 'a')?.order, 'W');
  });

  it('rows with no key yet can be moved among too', async () => {
    const w = world();
    const d = await w.device('a');
    for (const id of ['a', 'b', 'c']) d.engine.write('task', id, { title: id });
    d.today.move('c', 'a');
    assert.deepEqual(open(d), ['c', 'a', 'b']);
    d.today.move('a', null);
    assert.deepEqual(open(d), ['c', 'b', 'a']);
  });

  it('a gap halved until no key of 64 characters fits: the list is given fresh short keys, in the same order', async () => {
    const w = world();
    const d = await w.device('a');
    for (const [id, order] of [['a', 'V'], ['b', `V${'0'.repeat(62)}1`], ['m', 'z']] as const) d.engine.write('task', id, { title: id, order });
    d.today.move('m', 'b');
    assert.deepEqual(open(d), ['a', 'm', 'b']);
    assert.deepEqual(['a', 'm', 'b'].map((id) => row(d, id)?.order), ['V', 'W', 'X']);
  });

  it('upcoming tasks are moved among those due the same day, and subtasks among their parent\'s', async () => {
    const w = world();
    const d = await w.device('a');
    const ids = ['one', 'two', 'three'].map((t) => d.today.add(t)!);
    for (const id of ids) d.today.edit(id, { due: TOMORROW });
    d.today.move(ids[2]!, ids[0]!);
    assert.deepEqual(titles(d.today.upcoming.value), ['three', 'one', 'two']);
    const parent = d.today.add('parent')!;
    const subs = ['s1', 's2', 's3'].map((t) => d.today.addSubtask(parent, t)!);
    d.today.move(subs[0]!, null);
    assert.deepEqual(d.today.next.value?.subtasks.map((s) => s.title), ['s2', 's3', 's1']);
  });

  it('two devices moving the same task offline settle on one order', async () => {
    const w = world();
    const { d: a, ids } = await three(w);
    const b = await w.device('b');
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    a.today.move(ids[2], ids[0]);
    w.time.advance(MIN);
    b.today.move(ids[2], ids[1]);
    w.exchange(a, b);
    assert.deepEqual(open(a), ['one', 'three', 'two'], 'the later move');
    assert.deepEqual(open(b), open(a));
  });
});
