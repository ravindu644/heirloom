// Today on the real engine: see world.ts for the devices these tests run on.
// T0 is 10:00 on Tuesday 2026-11-24 in Sri Lanka; local midnight is 14 hours on.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GONE, isMoment } from '../core/real.ts';
import type { Write } from '../store/store.ts';
import { T0 } from './fakes.ts';
import { LAP_MAX_MS } from './settings.ts';
import { COLORS, ESTIMATE_MAX, PROJECT_NAME_MAX, isColor } from './today.ts';
import { LAP, MIN, world } from './world.ts';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TODAY = '2026-11-24';
const TOMORROW = '2026-11-25';

type Device = Awaited<ReturnType<ReturnType<typeof world>['device']>>;
const titles = (list: { title: string }[]) => list.map((t) => t.title);
// Today's open tasks in list order: `next` and `later` are all of them, put back by their keys.
const open = (d: Device) => {
  const key = (t: { id: string }) => `${d.engine.rows('task').value.get(t.id)?.order ?? ''} ${t.id}`;
  const all = [d.today.next.value, ...d.today.later.value].filter((t) => t !== null);
  return titles(all.toSorted((a, b) => (key(a) < key(b) ? -1 : 1)));
};
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
      due: TODAY, when: null, time: null, repeat: null, lengths: { work_ms: null, short_ms: null, long_ms: null }, done: false, deleted: null, subtasks: [],
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
    // The running task keeps its row, in its place, between the others.
    assert.deepEqual(titles(d.today.later.value), ['two', 'three']);
    assert.equal(d.today.later.value[0], d.today.running.value, 'the same view, not a copy with other numbers');
    assert.deepEqual(open(d), ['one', 'two', 'three']);
    w.time.advance(5 * MIN);
    d.focus.pause();
    assert.equal(d.today.running.value?.title, 'two', 'paused is still on it');
    d.focus.stop();
    assert.equal(d.today.running.value, null);
    assert.deepEqual(open(d), ['one', 'two', 'three']);
  });

  it('`list` is all of today\'s open tasks in order, so a screen can see where next sits beside the running one', async () => {
    const w = world();
    const d = await w.device('a');
    const [one, two] = ['one', 'two', 'three'].map((t) => d.today.add(t)!);
    assert.deepEqual(titles(d.today.list.value), ['one', 'two', 'three']);
    // The running task first: next is below it. The running task second: next is above it.
    d.focus.start(one);
    assert.deepEqual(titles(d.today.list.value), ['one', 'two', 'three']);
    assert.equal(d.today.next.value?.title, 'two');
    assert.equal(d.today.list.value.indexOf(d.today.next.value!), 1);
    assert.equal(d.today.list.value[0], d.today.running.value);
    d.focus.stop();
    d.focus.start(two);
    assert.equal(d.today.next.value?.title, 'one');
    assert.equal(d.today.list.value.indexOf(d.today.next.value!), 0);
    assert.deepEqual(titles(d.today.later.value), ['two', 'three']);
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
    // Each says when it was deleted, so the screen can say when it goes for good.
    assert.deepEqual(d.today.deleted.value.map((t) => t.deleted), [T0 + DAY, T0]);
    w.time.advance(29 * DAY - 1);
    assert.deepEqual(titles(d.today.deleted.value), ['two', 'one']);
    w.time.advance(DAY);
    assert.deepEqual(titles(d.today.deleted.value), ['two']);
    d.today.restore(two!);
    assert.deepEqual(titles(d.today.deleted.value), []);
    assert.deepEqual(open(d), ['two']);
  });

  it('purge deletes for good what is in Recently deleted: one cell, and the task is on no list, its subtasks with it, and in no reminder', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('call the bank ~2')!;
    const sub = d.today.addSubtask(id, 'find the number')!;
    d.today.edit(id, { time: '15:30' });
    d.today.edit(sub, { due: TODAY, time: '15:00' });
    d.today.remove(id);
    assert.deepEqual(titles(d.today.deleted.value), ['call the bank']);
    await d.engine.saved();
    log.length = 0;
    d.today.purge(id);
    await d.engine.saved();
    assert.deepEqual(log.flatMap((write) => write.cells!.map((c) => [c.row, c.field, c.value])), [[id, 'deleted', GONE]]);
    const everywhere = () => [d.today.list, d.today.later, d.today.upcoming, d.today.done, d.today.deleted].flatMap((list) => titles(list.value));
    assert.deepEqual(everywhere(), []);
    assert.equal(d.today.next.value, null);
    assert.deepEqual(d.today.timed.value, []);
    assert.equal(d.today.figures().left_laps, 0);
    // Not after thirty days either, nor after a restart: it does not come back by waiting.
    w.time.advance(31 * DAY);
    assert.deepEqual(everywhere(), []);
    const again = await w.restart(d);
    assert.deepEqual([again.today.list, again.today.deleted].flatMap((list) => titles(list.value)), []);
    assert.equal(row(again, id)?.deleted, GONE);
    assert.equal(row(again, sub)?.deleted, undefined, 'the subtask is not written: it goes with its parent, as for a delete');
  });

  it('purge is only for what is in Recently deleted: a task still alive, a subtask, one whose thirty days ran out, one already gone, nobody', async () => {
    const w = world();
    const d = await w.device('a');
    const [alive, parent, old, gone] = ['alive', 'parent', 'old', 'gone'].map((t) => d.today.add(t)!);
    const sub = d.today.addSubtask(parent!, 'a step')!;
    d.today.remove(sub);
    d.today.remove(old!);
    w.time.advance(30 * DAY);
    d.today.remove(gone!);
    d.today.purge(gone!);
    const cells = d.engine.cells();
    for (const id of [alive, sub, old, gone, 'nobody']) d.today.purge(id!);
    assert.deepEqual(d.engine.cells(), cells);
    assert.deepEqual(open(d), ['alive', 'parent']);
  });

  it('what purge writes is a time every build takes for a real one, long past the thirty days: a build that reads `deleted` through the 2020 floor hides the row too', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('call the bank')!;
    d.today.remove(id);
    d.today.purge(id);
    const written = row(d, id)?.deleted as number;
    assert.equal(written, Date.UTC(2020, 0, 1));
    // The reader as it was before this build: a time under the floor read as "never deleted".
    const oldReader = (v: unknown): number | null => (isMoment(v) ? v : null);
    const read = oldReader(written);
    assert.equal(read, written, 'deleted, to that reader');
    assert.ok(read !== null && d.engine.now() - read >= 30 * DAY, 'and off its shelf');
    assert.equal(oldReader(1), null, 'where 1 would have read as alive');
  });

  it('a deleted time no clock could show is deleted long ago, not "never deleted": the task is on no screen', async () => {
    const w = world();
    const d = await w.device('a');
    for (const [i, deleted] of [1, 5, 0, -1, 86400000].entries()) d.engine.write('task', `t${i}`, { title: `deleted at ${deleted}`, deleted, order: 'V' });
    // And what is not a time at all says nothing: that task is alive.
    d.engine.write('task', 'odd', { title: 'deleted: yes', deleted: 'yes', order: 'W' });
    assert.deepEqual(open(d), ['deleted: yes']);
    assert.deepEqual(d.today.deleted.value, []);
  });

  it('one device restores a task while another deletes it for good: the later of the two stands on both, whichever arrives first', async () => {
    for (const later of ['purge', 'restore'] as const) {
      for (const first of ['a', 'b'] as const) {
        const w = world();
        const a = await w.device('a');
        const id = a.today.add('call the bank')!;
        a.today.remove(id);
        const b = await w.device('b');
        w.exchange(a, b);
        a.disconnect();
        b.disconnect();
        const act = { restore: () => a.today.restore(id), purge: () => b.today.purge(id) };
        act[later === 'purge' ? 'restore' : 'purge']();
        w.time.advance(5000);
        act[later]();
        const [fromA, fromB] = [a.engine.cells(), b.engine.cells()];
        if (first === 'a') (b.receive(fromA), a.receive(fromB));
        else (a.receive(fromB), b.receive(fromA));
        for (const d of [a, b]) {
          const where = `${later} later, ${first}'s cells first, on ${d.name}`;
          assert.equal(row(d, id)?.deleted, later === 'purge' ? GONE : null, where);
          assert.deepEqual(open(d), later === 'purge' ? [] : ['call the bank'], where);
          assert.deepEqual(d.today.deleted.value, [], where);
        }
        assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
      }
    }
  });

  it('deleted for good survives the copy a person saves and brings back: it is gone on the device that reads it too', async () => {
    const w = world();
    const d = await w.device('a');
    const [gone, kept] = ['gone for good', 'kept'].map((t) => d.today.add(t)!);
    const habit = d.habits.add('stretch', 127, 1)!;
    const project = d.today.addProject('Dropped', 'you')!;
    d.today.remove(gone!);
    d.today.purge(gone!);
    d.habits.remove(habit);
    d.habits.purge(habit);
    d.today.removeProject(project);
    d.engine.write('project', project, { deleted: GONE });
    const text = d.settings.exportAll();
    const b = await w.device('b');
    assert.equal(b.settings.importAll(text).ok, true);
    assert.deepEqual(open(b), ['kept']);
    assert.deepEqual([b.today.deleted.value, b.today.projects.value, b.habits.list.value, b.habits.archived.value, b.habits.deleted.value], [[], [], [], [], []]);
    assert.deepEqual([row(b, gone!)?.deleted, b.engine.rows('habit').value.get(habit)?.deleted, b.engine.rows('project').value.get(project)?.deleted], [GONE, GONE, GONE]);
    // And the copy is not what brings it back on the device that made it.
    assert.deepEqual(d.settings.importAll(text), { ok: true, cells: 0 });
    assert.deepEqual(open(d), ['kept']);
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

  it('a day that is not on the calendar, or a time no clock could show, reads as unset: nothing walks off into it', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('task', 't1', { title: 'the 45th of the 13th month', due: '2026-13-45', repeat: { every: 'day' }, order: 'V' });
    d.engine.write('task', 't2', { title: 'the 31st of February', due: '2026-02-31', order: 'W' });
    d.engine.write('task', 't3', { title: 'done in the year three billion', done: 1e20, order: 'X' });
    assert.deepEqual(open(d), ['the 45th of the 13th month', 'the 31st of February', 'done in the year three billion']);
    assert.deepEqual(d.today.list.value.map((t) => [t.due, t.done, t.deleted]), Array(3).fill([null, false, null]));
    assert.deepEqual(d.today.done.value, []);
    // Marking the repeating one done makes its next from today, not from the day that was never real.
    d.today.setDone('t1', true);
    assert.equal(d.today.upcoming.value[0]?.due, TOMORROW);
    d.today.edit('t2', { due: '2026-02-31' });
    assert.equal(d.engine.rows('task').value.get('t2')?.due, '2026-02-31', 'and such a day is never written from here');
  });

  it('fields a newer build wrote differently read as unset, never as something to trip on', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('task', 't1', { title: 'odd fields', estimate: 'four', due: 'next week', repeat: { every: 'month' }, when: 9, time: 1530, notes: null, order: 3, project: 'gone', work_ms: '25m', short_ms: 999, long_ms: 86400001 });
    assert.deepEqual(d.today.next.value, {
      id: 't1', title: 'odd fields', notes: '', project: null, estimate: null, laps: 0, squares: [], running: false,
      due: null, when: null, time: null, repeat: null, lengths: { work_ms: null, short_ms: null, long_ms: null }, done: false, deleted: null, subtasks: [],
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

  it('wake() after a sleep over midnight: the day is right at once, and a task added then is on today\'s list, not "tomorrow"', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('for tomorrow')!;
    d.today.edit(id, { due: TOMORROW });
    // The lid is shut for twenty hours. No timer runs.
    w.time.jump(20 * HOUR);
    assert.equal(d.today.day.value, TODAY, 'still showing yesterday');
    d.today.wake();
    assert.equal(d.today.day.value, TOMORROW);
    assert.equal(next(d)?.title, 'for tomorrow');
    d.today.add('added on waking');
    assert.deepEqual(open(d), ['for tomorrow', 'added on waking']);
    assert.deepEqual(d.today.upcoming.value, []);
    // One wait, for the midnight after: the old one is gone, not left to fire late.
    assert.equal(w.time.waiting(), 1);
    w.time.advance(18 * HOUR);
    assert.equal(d.today.day.value, '2026-11-26');
  });

  it('a task added before anything woke Today still lands on the real day\'s list', async () => {
    const w = world();
    const d = await w.device('a');
    void d.today;
    w.time.jump(20 * HOUR);
    const id = d.today.add('typed straight after opening the lid')!;
    assert.equal(d.engine.rows('task').value.get(id)?.due, TOMORROW);
    assert.equal(d.today.day.value, TOMORROW);
    assert.equal(next(d)?.id, id);
    assert.deepEqual(d.today.upcoming.value, []);
  });

  it('wake() on the same day changes nothing', async () => {
    const w = world();
    const d = await w.device('a');
    let changes = 0;
    const stop = d.today.day.subscribe(() => changes++);
    w.time.advance(HOUR);
    d.today.wake();
    stop();
    assert.equal(changes, 1);
    assert.equal(w.time.waiting(), 1);
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

  it('a stopped lap is a lap and a part square, a lap set aside neither, and the lap in progress fills as it runs without anyone writing', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('pointers ~4')!;
    lap(d, 'lap-a', id, T0 - 2 * HOUR);
    lap(d, 'lap-b', id, T0 - 90 * MIN, { ended: T0 - 90 * MIN + 15 * MIN, outcome: 'stopped' });
    lap(d, 'lap-c', id, T0 - 60 * MIN, { outcome: 'void' });
    assert.deepEqual(d.today.next.value?.squares, [1, 0.6]);
    assert.equal(d.today.next.value?.laps, 2);

    d.focus.start(id);
    await d.settle();
    const cells = d.engine.cells();
    assert.deepEqual(d.today.running.value?.squares, [1, 0.6, 0]);
    w.time.advance(10 * MIN);
    assert.deepEqual(d.today.running.value?.squares, [1, 0.6, 0.4]);
    assert.equal(d.today.running.value?.laps, 2, 'the lap in progress is a square that fills, and no lap yet');
    assert.deepEqual(d.engine.cells(), cells, 'the square moved and nothing was written');
    // At the bell the square is whole and the lap counts.
    w.time.advance(15 * MIN);
    assert.deepEqual(next(d)?.squares, [1, 0.6, 1]);
    assert.equal(next(d)?.laps, 3);
  });

  it('a lap taken out of the count while the timer still shows it over is no lap of its task: the row has the last word', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('pointers ~4')!;
    d.focus.start(id);
    await d.settle();
    w.time.advance(LAP + MIN);
    assert.deepEqual([next(d)?.laps, next(d)?.squares], [1, [1]]);
    // "Don't count it", from the timeline, before the break is begun.
    d.progress.setAside('run-1');
    assert.equal(d.focus.view().over, true);
    assert.deepEqual([next(d)?.laps, next(d)?.squares], [0, []]);
    assert.equal(d.today.figures().laps, 0);
    d.progress.countAgain('run-1');
    assert.deepEqual([next(d)?.laps, next(d)?.squares], [1, [1]]);
  });

  it('a lap stopped on a task is one of its laps at once, and one less is left on the plan', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('pointers ~4')!;
    d.focus.start(id);
    w.time.advance(10 * MIN);
    assert.equal(d.today.figures().left_laps, 4);
    d.focus.stop();
    assert.deepEqual([next(d)?.laps, next(d)?.squares], [1, [0.4]]);
    assert.equal(d.today.figures().left_laps, 3);
    // Taken back: the task has no lap again, and its square goes on filling.
    w.time.advance(2000);
    d.focus.undo();
    w.time.advance(5 * MIN);
    const running = d.today.running.value!;
    assert.equal(running.laps, 0);
    assert.equal(running.squares.length, 1);
    assert.ok(running.squares[0]! > 0.6 && running.squares[0]! < 0.61);
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
    assert.deepEqual(titles(b.today.later.value), ['pointers'], 'its row stays in the list while its square fills');
    assert.deepEqual(open(b), ['pointers', 'arrays']);

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
      fills: [1],
      left_laps: 3 + 2,
      left_ms: 5 * LAP,
      target: 8,
      // The ghost's stopped lap is a lap.
      ghost: { day: '2026-11-17', total_ms: 60 * MIN, laps: 3 },
    });
    // The bell: the lap counts at once, and one less is left on its task.
    w.time.advance(15 * MIN);
    const after = d.today.figures();
    assert.equal(after.laps, 2);
    assert.deepEqual(after.fills, [1, 1]);
    assert.equal(after.done_ms, 50 * MIN);
    assert.equal(after.left_laps, 3 + 1);
  });

  it('a lap that rang stays a lap while its extension runs: in the day\'s laps, in the target bar and on its task, and once when it is stopped', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('pointers ~4')!;
    d.focus.start(id);
    await d.settle();
    w.time.advance(LAP + MIN);
    const rung = () => [d.today.figures().laps, d.today.figures().fills, d.focus.lapsToday(), d.today.list.value[0]!.laps, d.today.list.value[0]!.squares];
    assert.deepEqual(rung(), [1, [1], 1, 1, [1]]);
    d.focus.extend();
    assert.equal(d.focus.view().over, false);
    w.time.advance(2 * MIN);
    assert.deepEqual(rung(), [1, [1], 1, 1, [1]], 'two minutes into the extension');
    assert.equal(d.today.figures().left_laps, 3);
    assert.equal(d.today.figures().done_ms, 28 * MIN, 'and its minutes go on counting');
    d.focus.pause();
    w.time.advance(10 * MIN);
    assert.deepEqual(rung(), [1, [1], 1, 1, [1]], 'paused in the extension');
    d.focus.stop();
    assert.deepEqual(rung(), [1, [1], 1, 1, [1]], 'stopped: the one lap it always was');
    assert.equal(d.session('run-1')?.outcome, 'rang');
    // The same through a second bell, on a device that holds only the first bell's row.
    d.focus.start(id);
    await d.settle();
    w.time.advance(LAP + MIN);
    d.focus.extend();
    w.time.advance(MIN);
    assert.deepEqual(rung(), [2, [1, 1], 2, 2, [1, 1]]);
  });

  it('fills are today\'s laps, oldest first, each as full as it ran: a lap not counted is not among them', async () => {
    const w = world();
    const d = await w.device('a');
    lap(d, 'lap-c', 'whatever', T0 - HOUR, { ended: T0 - HOUR + 5 * MIN, outcome: 'stopped' });
    lap(d, 'lap-a', 'whatever', T0 - 3 * HOUR);
    lap(d, 'lap-b', 'whatever', T0 - 2 * HOUR, { outcome: 'void' });
    lap(d, 'yesterday', 'whatever', T0 - DAY);
    d.engine.write('session', 'rest', { kind: 'short', task: null, started: T0 - 30 * MIN, ended: T0 - 25 * MIN, planned_ms: 5 * MIN, paused_ms: 0, outcome: 'rang', device: d.engine.device });
    assert.deepEqual(d.today.figures().fills, [1, 0.2]);
    assert.equal(d.today.figures().laps, 2);
  });

  it('on a first day there is no ghost, no target reads as 0, and what is left follows the lap length in settings', async () => {
    const w = world();
    const d = await w.device('a');
    d.today.add('pointers ~3');
    d.engine.write('settings', 'current', { work_ms: 50 * MIN });
    assert.deepEqual(d.today.figures(), { done_ms: 0, laps: 0, fills: [], left_laps: 3, left_ms: 150 * MIN, target: 0, ghost: null });
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
      id: next, project: null, title: 'read', notes: 'K&R', estimate: 2, repeat: { every: 'day' }, when: 'after dinner', time: null, work_ms: null, short_ms: null, long_ms: null, order: 'V', due: TOMORROW,
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

  it('a repeat carries its time: the next one is at the same time on its own day, and a next one whose time was changed is the person\'s', async () => {
    const w = world();
    const { d, id } = await daily(w);
    d.today.edit(id, { time: '18:00' });
    d.today.setDone(id, true);
    const next = `${id}-20261125`;
    assert.equal(row(d, next)?.time, '18:00');
    assert.deepEqual(d.today.upcoming.value.map((t) => [t.due, t.time]), [[TOMORROW, '18:00']]);
    assert.deepEqual(d.today.timed.value, [{ id: next, title: 'read', day: TOMORROW, time: '18:00' }]);
    // Untouched, it goes when the done is taken back, and comes back with it.
    d.today.setDone(id, false);
    assert.deepEqual(titles(d.today.upcoming.value), []);
    d.today.setDone(id, true);
    // Moved to another time, it is the person's own, and stays.
    d.today.edit(next, { time: '19:30' });
    d.today.setDone(id, false);
    assert.deepEqual(d.today.upcoming.value.map((t) => t.time), ['19:30']);
    assert.equal(row(d, next)?.deleted, null);
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

describe('done while its lap runs', () => {
  const IDLE = { phase: 'idle', run: null, task: null, started: null, paused_at: null, paused_ms: 0, planned_ms: 0 };

  it('ends the lap as stop does: a stopped row for the task and an idle timer, in the same store transaction as the done, and the same on another device', async () => {
    const w = world();
    const log: Write[] = [];
    const a = await w.device('a', { log });
    const b = await w.device('b');
    const id = a.today.add('Q/A session ~2')!;
    a.focus.start(id);
    await a.settle();
    w.time.advance(10 * MIN);
    log.length = 0;
    a.today.setDone(id, true);
    await a.engine.saved();
    assert.equal(log.length, 1, 'one store transaction');
    assert.deepEqual(log[0]!.cells!.map((c) => c.dataset).toSorted(), [...Array(8).fill('session'), 'task', 'timer']);
    w.exchange(a, b);
    for (const d of [a, b]) {
      assert.deepEqual(d.focus.state.value, { ...IDLE, set_index: 1 }, d.name);
      assert.deepEqual(d.session('run-1'), { id: 'run-1', kind: 'work', task: id, started: T0, ended: T0 + 10 * MIN, planned_ms: LAP, paused_ms: 0, outcome: 'stopped', device: a.engine.device });
      assert.deepEqual(titles(d.today.done.value), ['Q/A session']);
      assert.deepEqual([d.today.done.value[0]!.laps, d.today.done.value[0]!.squares], [1, [0.4]]);
      assert.equal(d.today.running.value, null);
      assert.equal(d.focus.lapsToday(), 1);
    }
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('a paused lap is ended too, where its pause began', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('Q/A session')!;
    d.focus.start(id);
    w.time.advance(6 * MIN);
    d.focus.pause();
    w.time.advance(20 * MIN);
    d.today.setDone(id, true);
    assert.equal(d.focus.state.value.phase, 'idle');
    assert.deepEqual([d.session('run-1')?.outcome, d.session('run-1')?.ended], ['stopped', T0 + 6 * MIN]);
  });

  it('a repeating task done mid-lap still makes its next one, in the same transaction, and the lap stays with the one that was done', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('read ~2')!;
    d.today.edit(id, { repeat: { every: 'day' } });
    d.focus.start(id);
    await d.settle();
    w.time.advance(15 * MIN);
    log.length = 0;
    d.today.setDone(id, true);
    await d.engine.saved();
    assert.equal(log.length, 1);
    assert.equal(d.focus.state.value.phase, 'idle');
    assert.equal(d.session('run-1')?.task, id);
    assert.deepEqual(d.today.upcoming.value.map((t) => [t.id, t.due, t.laps]), [[`${id}-20261125`, TOMORROW, 0]]);
    assert.equal(d.today.done.value[0]?.laps, 1);
  });

  it('taken back within ten seconds, with the timer untouched: the same run goes on, in the same place of the set, and the task is open and running', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('Q/A session')!;
    d.focus.start(id);
    await d.settle();
    w.time.advance(10 * MIN);
    const before = d.focus.state.value;
    d.today.setDone(id, true);
    assert.equal(d.focus.undoable.value, true);
    w.time.advance(4000);
    await d.engine.saved();
    log.length = 0;
    d.today.setDone(id, false);
    await d.engine.saved();
    assert.equal(log.length, 1, 'the task and the timer, one store transaction');
    assert.deepEqual(d.focus.state.value, before);
    assert.equal(d.focus.ran(), 10 * MIN + 4000, 'the seconds in between ran');
    assert.equal(d.today.running.value?.id, id);
    assert.deepEqual(titles(d.today.done.value), []);
    assert.equal(d.focus.lapsToday(), 0, 'open again, it is not a lap yet');
    // And it rings as the one lap it is.
    await d.settle();
    w.time.advance(LAP);
    assert.deepEqual(d.sessions(), ['run-1']);
    assert.deepEqual([d.session('run-1')?.outcome, d.session('run-1')?.ended], ['rang', T0 + LAP]);
  });

  it('taken back after the ten seconds, or once the timer has been written again, or on another device: only the task opens', async () => {
    // Later.
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.today.add('Q/A session')!;
    a.focus.start(id);
    w.time.advance(10 * MIN);
    a.today.setDone(id, true);
    w.time.advance(10000);
    a.today.setDone(id, false);
    assert.equal(a.focus.state.value.phase, 'idle');
    assert.deepEqual(open(a), ['Q/A session']);

    // The timer was written since: another lap begun and stopped. That stop is not this done's to take back.
    a.focus.start(id);
    w.time.advance(MIN);
    a.today.setDone(id, true);
    w.time.advance(1000);
    a.focus.start();
    w.time.advance(1000);
    a.focus.stop();
    assert.equal(a.focus.undoable.value, true, 'an undo is on offer, for the other stop');
    const idle = a.focus.state.value;
    a.today.setDone(id, false);
    assert.deepEqual(a.focus.state.value, idle);
    assert.deepEqual(open(a), ['Q/A session']);

    // On another device, a second after.
    w.time.advance(DAY);
    a.focus.start(id);
    w.time.advance(MIN);
    a.today.setDone(id, true);
    w.exchange(a, b);
    w.time.advance(1000);
    b.today.setDone(id, false);
    assert.equal(b.focus.state.value.phase, 'idle');
    assert.deepEqual(open(b), ['Q/A session']);
    w.exchange(a, b);
    assert.equal(a.focus.state.value.phase, 'idle');
  });

  it('the stop is taken back only by the done that made it: not by another task opened again, and not by the same task done a second time', async () => {
    const w = world();
    const d = await w.device('a');
    const [mine, other] = ['mine', 'other'].map((title) => d.today.add(title)!);
    d.today.setDone(other!, true);
    d.focus.start(mine);
    w.time.advance(10 * MIN);
    d.today.setDone(mine!, true);
    const idle = d.focus.state.value;
    assert.equal(idle.phase, 'idle');
    w.time.advance(2000);
    d.today.setDone(other!, false);
    assert.deepEqual(d.focus.state.value, idle, 'another task opened again');
    // Opened on another device a moment later, and done here again: the lap stays ended.
    d.receive([{ stamp: `${new Date(d.engine.now() + 1000).toISOString()}-0000-b2c3d4e5f6071829`, dataset: 'task', row: mine!, field: 'done', value: null }]);
    w.time.advance(2000);
    d.today.setDone(mine!, true);
    assert.deepEqual(d.focus.state.value, idle, 'done a second time');
    assert.deepEqual(titles(d.today.done.value), ['mine']);
  });

  it('a lap whose bell has gone is left alone: it rang, and its break is still offered', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('Q/A session')!;
    d.focus.start(id);
    await d.settle();
    w.time.advance(LAP + MIN);
    const over = d.focus.state.value;
    d.today.setDone(id, true);
    assert.deepEqual(d.focus.state.value, over);
    assert.equal(d.focus.undoable.value, false);
    assert.deepEqual(d.focus.view().next, { phase: 'short', set_index: 0 });
    assert.equal(d.session('run-1')?.outcome, 'rang');
    // And taking that done back touches no timer either.
    d.today.setDone(id, false);
    assert.deepEqual(d.focus.state.value, over);
  });

  it('done from another device than the one the lap was started on: that device writes the stop, and the first writes no row of its own', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.today.add('Q/A session')!;
    a.focus.start(id);
    await a.settle();
    w.exchange(a, b);
    w.time.advance(12 * MIN);
    b.today.setDone(id, true);
    assert.equal(b.focus.state.value.phase, 'idle');
    assert.equal(b.session('run-1')?.device, b.engine.device);
    w.exchange(a, b);
    for (const d of [a, b]) {
      assert.equal(d.focus.state.value.phase, 'idle');
      assert.deepEqual([d.session('run-1')?.outcome, d.session('run-1')?.ended, d.session('run-1')?.device], ['stopped', T0 + 12 * MIN, b.engine.device]);
      assert.deepEqual(titles(d.today.done.value), ['Q/A session']);
    }
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
    // Done there while this one was offline, lap still running here: when they meet the stop stands.
    const c = await w.device('c');
    w.exchange(a, c);
    const other = a.today.add('another')!;
    a.focus.start(other);
    await a.settle();
    w.exchange(a, c);
    a.disconnect();
    w.time.advance(5 * MIN);
    c.today.setDone(other, true);
    w.time.advance(MIN);
    assert.equal(a.focus.state.value.phase, 'work');
    w.exchange(a, c);
    assert.equal(a.focus.state.value.phase, 'idle');
    assert.equal(a.session(a.sessions().at(-1)!)?.device, c.engine.device);
  });

  it('a lap on another task, a break, a subtask done, and a task marked not done end nothing', async () => {
    const w = world();
    const d = await w.device('a');
    const [mine, other] = ['mine', 'other'].map((t) => d.today.add(t)!);
    const step = d.today.addSubtask(mine!, 'a step')!;
    d.focus.start(mine);
    w.time.advance(MIN);
    const running = d.focus.state.value;
    d.today.setDone(other!, true);
    d.today.setDone(other!, false);
    d.today.editSubtask(step, { done: true });
    d.today.setDone(step, false);
    d.today.setDone(step, true);
    assert.deepEqual(d.focus.state.value, running);
    assert.deepEqual(d.sessions(), []);
    // In the break after a lap on the task, the task done ends no break.
    w.time.advance(LAP);
    d.focus.start();
    const resting = d.focus.state.value;
    assert.equal(resting.phase, 'short');
    d.today.setDone(mine!, true);
    assert.deepEqual(d.focus.state.value, resting);
    // A break that names a task, as another build might write it, is still a break.
    d.today.setDone(mine!, false);
    d.engine.write('timer', 'current', { state: { ...resting, task: mine } });
    d.today.setDone(mine!, true);
    assert.equal(d.focus.state.value.phase, 'short');
    // A lap begun on a task that is already done goes on when the task is opened again.
    d.focus.skipBreak(mine);
    w.time.advance(MIN);
    d.today.setDone(mine!, false);
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.task, mine);
    // And a lap begun on a subtask's own id is not ended by ticking the subtask.
    d.focus.skipBreak(step);
    d.today.setDone(step, false);
    w.time.advance(MIN);
    d.today.setDone(step, true);
    assert.equal(d.focus.state.value.phase, 'work');
    assert.equal(d.focus.state.value.task, step);
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

describe('an estimate', () => {
  it('stops at thirty-two laps: a larger one typed or set is taken as thirty-two, and a row that already holds more is read as it is until its estimate is next edited', async () => {
    const w = world();
    const d = await w.device('a');
    assert.equal(ESTIMATE_MAX, 32);
    const typed = d.today.add('the whole book ~40')!;
    assert.equal(row(d, typed)?.estimate, 32);
    assert.equal(row(d, d.today.add('a chapter ~32')!)?.estimate, 32);
    assert.equal(row(d, d.today.add('a section ~12')!)?.estimate, 12);
    d.today.edit(typed, { estimate: 31 });
    assert.equal(row(d, typed)?.estimate, 31);
    d.today.edit(typed, { estimate: 33 });
    assert.equal(row(d, typed)?.estimate, 32);
    d.today.edit(typed, { estimate: 1000 });
    assert.equal(row(d, typed)?.estimate, 32);
    // From an older build: forty laps guessed.
    d.engine.write('task', typed, { estimate: 40 });
    const stamp = d.engine.stamp('task', typed, 'estimate');
    assert.equal(d.today.list.value.find((t) => t.id === typed)?.estimate, 40);
    d.today.edit(typed, { title: 'the whole book, slowly' });
    assert.equal(d.engine.stamp('task', typed, 'estimate'), stamp, 'an edit of something else leaves it');
    d.today.edit(typed, { estimate: 40 });
    assert.equal(row(d, typed)?.estimate, 32);
    d.today.edit(typed, { estimate: null });
    assert.equal(row(d, typed)?.estimate, null);
  });
});

describe('a task\'s own lengths', () => {
  const lengths = (d: Device, id: string) => [d.today.list, d.today.upcoming].flatMap((list) => list.value).find((t) => t.id === id)!.lengths;

  it('are none until set; each is set and cleared by itself, in one write, held to what settings holds a length to', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('read the chapter ~3')!;
    assert.deepEqual(lengths(d, id), { work_ms: null, short_ms: null, long_ms: null });
    await d.engine.saved();
    log.length = 0;
    d.today.edit(id, { work_ms: 60 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN });
    await d.engine.saved();
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => [c.field, c.value]), [['work_ms', 60 * MIN], ['short_ms', 10 * MIN], ['long_ms', 30 * MIN]]);
    assert.deepEqual(lengths(d, id), { work_ms: 60 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN });
    d.today.edit(id, { short_ms: null });
    assert.deepEqual(lengths(d, id), { work_ms: 60 * MIN, short_ms: null, long_ms: 30 * MIN });
    assert.equal(row(d, id)?.short_ms, null);
    // A lap of 99 minutes at most; a break up to a day, as in settings; a second at least.
    d.today.edit(id, { work_ms: LAP_MAX_MS, short_ms: 1000, long_ms: 86400000 });
    assert.deepEqual(lengths(d, id), { work_ms: 99 * MIN, short_ms: 1000, long_ms: 86400000 });
    const cells = d.engine.cells();
    for (const bad of [{ work_ms: LAP_MAX_MS + 1 }, { work_ms: 100 * MIN }, { work_ms: 999 }, { work_ms: 1500000.5 }, { work_ms: '25' }, { short_ms: 0 }, { short_ms: -1 }, { long_ms: 86400001 }, { long_ms: NaN }, {}]) {
      d.today.edit(id, bad as never);
    }
    assert.deepEqual(d.engine.cells(), cells, 'what is no length is ignored, as other bad input is');
  });

  it('a stored value that is no length reads as none and is left as it is; a longer lap another build wrote is read as it is', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('read')!;
    d.engine.write('task', id, { work_ms: 'an hour', short_ms: 5, long_ms: 120 * MIN });
    assert.deepEqual(lengths(d, id), { work_ms: null, short_ms: null, long_ms: 120 * MIN });
    for (const odd of [500, 86400001, 1500000.5]) {
      d.engine.write('task', id, { work_ms: odd });
      assert.equal(lengths(d, id).work_ms, null, String(odd));
      assert.equal(d.focus.lengthsFor(id).work_ms, LAP);
    }
    d.engine.write('task', id, { work_ms: 120 * MIN });
    assert.equal(lengths(d, id).work_ms, 120 * MIN);
    assert.deepEqual(d.focus.lengthsFor(id), { work_ms: 120 * MIN, short_ms: 5 * MIN, long_ms: 120 * MIN });
    d.today.edit(id, { title: 'read on' });
    assert.equal(row(d, id)?.short_ms, 5, 'not rewritten by an edit of something else');
  });

  it('lengthsFor is what a run begun now for the task would get: its own, each falling back by itself to the account\'s', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('read')!;
    const account = { work_ms: LAP, short_ms: 5 * MIN, long_ms: 15 * MIN };
    assert.deepEqual(d.focus.lengthsFor(id), account);
    assert.deepEqual(d.focus.lengthsFor(null), account);
    assert.deepEqual(d.focus.lengthsFor('a task this device never heard of'), account);
    d.today.edit(id, { work_ms: 60 * MIN });
    assert.deepEqual(d.focus.lengthsFor(id), { ...account, work_ms: 60 * MIN });
    d.today.edit(id, { long_ms: 30 * MIN });
    d.settings.set({ work_ms: 50 * MIN, short_ms: 10 * MIN, long_ms: 20 * MIN });
    assert.deepEqual(d.focus.lengthsFor(id), { work_ms: 60 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN });
    assert.deepEqual(d.focus.lengthsFor(null), { work_ms: 50 * MIN, short_ms: 10 * MIN, long_ms: 20 * MIN });
    assert.deepEqual(d.focus.lengths.value, { work_ms: 50 * MIN, short_ms: 10 * MIN, long_ms: 20 * MIN }, 'lengths stays the account\'s');
  });

  it('a lap begun on the task takes its lap length, and the break after a lap on it its break length; a lap for nothing takes the account\'s', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('read')!;
    d.today.edit(id, { work_ms: 60 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN });
    d.focus.start(id);
    assert.equal(d.focus.state.value.planned_ms, 60 * MIN);
    w.time.advance(60 * MIN);
    assert.equal(d.session('run-1')?.planned_ms, 60 * MIN);
    d.focus.start();
    assert.deepEqual([d.focus.state.value.phase, d.focus.state.value.planned_ms], ['short', 10 * MIN]);
    w.time.advance(10 * MIN);
    // The next lap is for nothing in particular: the account's length, and its break the account's too.
    d.focus.start();
    assert.deepEqual([d.focus.state.value.task, d.focus.state.value.planned_ms], [null, LAP]);
    w.time.advance(LAP);
    d.focus.start();
    assert.deepEqual([d.focus.state.value.phase, d.focus.state.value.planned_ms], ['short', 5 * MIN]);
    // Skipping a break, straight onto the task again; then lap four on it, and its long break.
    d.focus.skipBreak(id);
    assert.equal(d.focus.state.value.planned_ms, 60 * MIN);
    w.time.advance(60 * MIN);
    d.focus.skipBreak(id);
    assert.equal(d.focus.state.value.set_index, 3);
    w.time.advance(60 * MIN);
    d.focus.start();
    assert.deepEqual([d.focus.state.value.phase, d.focus.state.value.planned_ms], ['long', 30 * MIN]);
  });

  it('a length is read once, when the run begins: a task edited mid-lap changes the next run and not this one', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('read')!;
    d.focus.start(id);
    w.time.advance(5 * MIN);
    d.today.edit(id, { work_ms: 60 * MIN, short_ms: 10 * MIN });
    assert.equal(d.focus.state.value.planned_ms, LAP);
    assert.equal(d.focus.view().left_ms, 20 * MIN);
    w.time.advance(20 * MIN);
    d.focus.start();
    assert.equal(d.focus.state.value.planned_ms, 10 * MIN, 'the break is the next run');
    d.today.edit(id, { short_ms: 15 * MIN });
    assert.equal(d.focus.state.value.planned_ms, 10 * MIN);
    w.time.advance(10 * MIN);
    d.focus.start(id);
    assert.equal(d.focus.state.value.planned_ms, 60 * MIN);
  });

  it('breaks and laps that start by themselves take the task\'s lengths too: the break of the lap that rang, the lap of the task it goes on with', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('settings', 'current', { auto_break: true, auto_work: true });
    const id = d.today.add('read')!;
    d.today.add('something else');
    d.today.edit(id, { work_ms: 50 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN });
    d.focus.start(id);
    await d.settle();
    w.time.advance(50 * MIN);
    assert.deepEqual(d.focus.state.value, { phase: 'short', run: 'run-1_', task: null, started: T0 + 50 * MIN, paused_at: null, paused_ms: 0, planned_ms: 10 * MIN, set_index: 0 });
    await d.settle();
    w.time.advance(10 * MIN);
    // It goes on with the task at the top of the list, the one the lap before the break was on: at that task's length.
    assert.deepEqual(d.focus.state.value, { phase: 'work', run: 'run-1__', task: id, started: T0 + 60 * MIN, paused_at: null, paused_ms: 0, planned_ms: 50 * MIN, set_index: 1 });
    // A lap for nothing, and the break and the lap after it, are the account's.
    d.focus.stop();
    d.focus.start();
    await d.settle();
    w.time.advance(LAP);
    assert.deepEqual([d.focus.state.peek().phase, d.focus.state.peek().planned_ms], ['short', 5 * MIN]);
    await d.settle();
    w.time.advance(5 * MIN);
    assert.deepEqual([d.focus.state.peek().phase, d.focus.state.peek().task, d.focus.state.peek().planned_ms], ['work', null, LAP]);
  });

  it('planned, left counts each task\'s laps at that task\'s lap length, and the account\'s where it has none', async () => {
    const w = world();
    const d = await w.device('a');
    const [long, plain, none] = ['an hour each ~3', 'plain ~2', 'no estimate'].map((t) => d.today.add(t)!);
    d.today.edit(long!, { work_ms: 60 * MIN });
    d.today.edit(none!, { work_ms: 90 * MIN });
    assert.deepEqual([d.today.figures().left_laps, d.today.figures().left_ms], [5, 3 * 60 * MIN + 2 * LAP]);
    lap(d, 'lap-a', long!, T0 - 2 * HOUR, { planned_ms: 60 * MIN, ended: T0 - HOUR });
    assert.deepEqual([d.today.figures().left_laps, d.today.figures().left_ms], [4, 2 * 60 * MIN + 2 * LAP]);
    d.settings.set({ work_ms: 50 * MIN });
    assert.equal(d.today.figures().left_ms, 2 * 60 * MIN + 2 * 50 * MIN);
    d.today.edit(long!, { work_ms: null });
    assert.equal(d.today.figures().left_ms, 4 * 50 * MIN);
  });

  it('the next of a repeating task copies all three, and one whose lengths were changed is the person\'s', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('read ~2')!;
    d.today.edit(id, { repeat: { every: 'day' }, work_ms: 60 * MIN, long_ms: 30 * MIN });
    d.today.setDone(id, true);
    const next = `${id}-20261125`;
    assert.deepEqual([row(d, next)?.work_ms, row(d, next)?.short_ms, row(d, next)?.long_ms], [60 * MIN, null, 30 * MIN]);
    assert.deepEqual(lengths(d, next), { work_ms: 60 * MIN, short_ms: null, long_ms: 30 * MIN });
    d.today.setDone(id, false);
    assert.deepEqual(titles(d.today.upcoming.value), [], 'untouched, it goes with the done');
    d.today.setDone(id, true);
    d.today.edit(next, { short_ms: 10 * MIN });
    d.today.setDone(id, false);
    assert.deepEqual(titles(d.today.upcoming.value), ['read']);
  });

  it('set on one device: a lap started on the other before it hears is the account\'s length, and after it hears the task\'s', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.today.add('read')!;
    w.exchange(a, b);
    a.today.edit(id, { work_ms: 60 * MIN, short_ms: 10 * MIN });
    b.focus.start(id);
    assert.equal(b.focus.state.value.planned_ms, LAP, 'b has not heard');
    w.exchange(a, b);
    // Hearing of the edit changes nothing of the lap that is running, on either device.
    assert.equal(b.focus.state.value.planned_ms, LAP);
    assert.equal(a.focus.state.value.planned_ms, LAP);
    assert.deepEqual(b.focus.lengthsFor(id), { work_ms: 60 * MIN, short_ms: 10 * MIN, long_ms: 15 * MIN });
    w.time.advance(LAP);
    b.focus.start();
    assert.deepEqual([b.focus.state.value.phase, b.focus.state.value.planned_ms], ['short', 10 * MIN]);
    w.time.advance(10 * MIN);
    b.focus.start(id);
    assert.equal(b.focus.state.value.planned_ms, 60 * MIN);
    w.exchange(a, b);
    assert.deepEqual(a.focus.state.value, b.focus.state.value);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('two devices set the same task\'s lengths offline, one the lap and one the break: both are kept', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.today.add('read')!;
    w.exchange(a, b);
    a.today.edit(id, { work_ms: 60 * MIN });
    w.time.advance(1000);
    b.today.edit(id, { short_ms: 10 * MIN });
    w.exchange(a, b);
    for (const d of [a, b]) assert.deepEqual(lengths(d, id), { work_ms: 60 * MIN, short_ms: 10 * MIN, long_ms: null });
  });

  it('both see a bell and one has not heard of the task\'s new break length: each starts the break it knows, and when they meet there is one state on both, one run, and no stray row', async () => {
    for (const heardFirst of ['a', 'b'] as const) {
      const w = world();
      const a = await w.device('a');
      const b = await w.device('b');
      a.engine.write('settings', 'current', { auto_break: true });
      const id = a.today.add('read')!;
      await a.settle();
      w.exchange(a, b);
      // b starts the lap and goes offline with it: the timer is its own, so it will write the bell.
      b.focus.start(id);
      await b.settle();
      w.exchange(a, b);
      b.disconnect();
      // On a, the task's break becomes ten minutes. b does not hear.
      w.time.advance(MIN);
      a.today.edit(id, { short_ms: 10 * MIN });
      await a.settle();
      w.time.advance(LAP - MIN);
      assert.deepEqual([a.focus.state.value.run, a.focus.state.value.planned_ms], ['run-1_', 10 * MIN]);
      assert.deepEqual([b.focus.state.value.run, b.focus.state.value.planned_ms], ['run-1_', 5 * MIN]);
      const [fromA, fromB] = [a.engine.cells(), b.engine.cells()];
      if (heardFirst === 'a') (b.receive(fromA), a.receive(fromB));
      else (a.receive(fromB), b.receive(fromA));
      await b.connect();
      assert.deepEqual(a.focus.state.value, b.focus.state.value, 'one state, whichever cell arrived first');
      // The same cell, stamped at the same moment by each: the device id in the stamp decides, the same way everywhere.
      const winner = a.engine.device > b.engine.device ? 10 * MIN : 5 * MIN;
      assert.deepEqual([a.focus.state.value.run, a.focus.state.value.planned_ms], ['run-1_', winner]);
      assert.deepEqual(a.sessions(), ['run-1'], 'the lap, once; the break is still running');
      assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
      // And the break rings as the one it is on both.
      w.time.advance(10 * MIN);
      assert.deepEqual(a.session('run-1_')?.planned_ms, winner);
      w.exchange(a, b);
      assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
    }
  });
});

describe('a task\'s time', () => {
  it('is set and cleared by edit; a time on a task with no day lands on today, in the same store transaction', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('call the bank')!;
    d.today.edit(id, { due: null });
    await d.engine.saved();
    log.length = 0;
    d.today.edit(id, { time: '15:30' });
    await d.engine.saved();
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => [c.field, c.value]), [['time', '15:30'], ['due', TODAY]]);
    assert.deepEqual([next(d)?.due, next(d)?.time], [TODAY, '15:30']);
    // With a day already on it, only the time is written.
    d.today.edit(id, { due: TOMORROW });
    await d.engine.saved();
    log.length = 0;
    d.today.edit(id, { time: '09:05' });
    await d.engine.saved();
    assert.deepEqual(log[0]!.cells!.map((c) => [c.field, c.value]), [['time', '09:05']]);
    assert.equal(row(d, id)?.due, TOMORROW);
    d.today.edit(id, { time: null });
    assert.equal(row(d, id)?.time, null);
    assert.equal(row(d, id)?.due, TOMORROW, 'clearing the time leaves the day');
    // A time and a day given together are taken as given; a time with the day cleared in the same edit is today's.
    d.today.edit(id, { due: '2026-12-01', time: '08:00' });
    assert.deepEqual([row(d, id)?.due, row(d, id)?.time], ['2026-12-01', '08:00']);
    d.today.edit(id, { due: null, time: '08:00' });
    assert.equal(row(d, id)?.due, TODAY);
  });

  it('anything that is not a time of day is ignored, and writes no day either', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('call the bank')!;
    d.today.edit(id, { due: null });
    const cells = d.engine.cells();
    for (const time of ['24:00', '15:60', '3:30', '15.30', '15:30:00', ' 15:30', '', 'after dinner', 1530, undefined]) d.today.edit(id, { time: time as never });
    assert.deepEqual(d.engine.cells(), cells);
    for (const time of ['00:00', '23:59', '07:05']) {
      d.today.edit(id, { time });
      assert.equal(next(d)?.time, time);
    }
  });

  it('set after the device slept over midnight, with no day: the day is the real one, not the one the list still showed', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('call the bank')!;
    d.today.edit(id, { due: null });
    w.time.jump(DAY);
    d.today.edit(id, { time: '15:30' });
    assert.equal(row(d, id)?.due, TOMORROW);
    assert.equal(d.today.day.value, TOMORROW);
  });

  it('clearing the day clears the time with it, in the same store transaction: a day picked later does not bring 15:30 back', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.today.add('call the bank')!;
    d.today.edit(id, { time: '15:30' });
    await d.engine.saved();
    log.length = 0;
    d.today.edit(id, { due: null });
    await d.engine.saved();
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => [c.field, c.value]), [['due', null], ['time', null]]);
    assert.deepEqual(d.today.timed.value, []);
    d.today.edit(id, { due: TOMORROW });
    assert.equal(d.today.upcoming.value[0]?.time, null);
    assert.deepEqual(d.today.timed.value, []);
    // Moving the day keeps the time; only clearing it lets the time go.
    d.today.edit(id, { time: '15:30' });
    d.today.edit(id, { due: '2026-11-30' });
    assert.equal(row(d, id)?.time, '15:30');
  });

  it('clearing the day of a task with no time writes no time, and a stored value this build cannot read is left as it is', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('call the bank')!;
    d.today.edit(id, { due: null });
    assert.equal('time' in row(d, id)!, false);
    d.engine.write('task', id, { due: TODAY, time: 'teatime' });
    const stamp = d.engine.stamp('task', id, 'time');
    d.today.edit(id, { due: null });
    assert.equal(row(d, id)?.time, 'teatime');
    assert.equal(d.engine.stamp('task', id, 'time'), stamp);
  });

  it('a time with no day, as two devices can leave it, shows as none and reminds of nothing until a day is set', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('call the bank')!;
    d.receive([{ stamp: `2026-11-24T04:31:00.000Z-0000-b2c3d4e5f6071829`, dataset: 'task', row: id, field: 'due', value: null }]);
    d.receive([{ stamp: `2026-11-24T04:31:10.000Z-0000-c3d4e5f607182930`, dataset: 'task', row: id, field: 'time', value: '15:30' }]);
    assert.equal(row(d, id)?.time, '15:30');
    assert.equal(next(d)?.time, null);
    assert.deepEqual(d.today.timed.value, []);
    d.today.edit(id, { due: TOMORROW });
    assert.equal(d.today.upcoming.value[0]?.time, '15:30');
  });

  it('a stored value that is no time of day is kept, sent on, and read as none; an edit elsewhere on the task does not touch it', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('call the bank')!;
    await d.settle();
    for (const odd of ['25:00', 'teatime', 1530, { h: 15 }]) {
      d.engine.write('task', id, { time: odd });
      assert.equal(next(d)?.time, null, JSON.stringify(odd));
      assert.deepEqual(d.today.timed.value, []);
      await d.engine.saved();
      assert.deepEqual(d.wire().sent.at(-1)!.cells.map((c) => [c.field, c.value]), [['time', odd]], 'sent on as it is');
      await d.settle();
      d.today.edit(id, { title: 'call the bank today' });
      assert.deepEqual(row(d, id)?.time, odd, 'and not rewritten');
      await d.settle();
    }
  });

  it('two devices offline, one moves the day and the other sets the time: both are kept, in either order of arrival', async () => {
    for (const order of ['a first', 'b first']) {
      const w = world();
      const a = await w.device('a');
      const id = a.today.add('call the bank')!;
      const b = await w.device('b');
      w.exchange(a, b);
      a.disconnect();
      b.disconnect();
      a.today.edit(id, { due: '2026-11-26' });
      w.time.advance(10000);
      b.today.edit(id, { time: '18:00' });
      const [fromA, fromB] = [a.engine.cells(), b.engine.cells()];
      if (order === 'a first') (b.receive(fromA), a.receive(fromB));
      else (a.receive(fromB), b.receive(fromA));
      for (const d of [a, b]) assert.deepEqual([row(d, id)?.due, row(d, id)?.time], ['2026-11-26', '18:00'], `${order}, on ${d.name}`);
      assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
      assert.deepEqual(a.today.timed.value, [{ id, title: 'call the bank', day: '2026-11-26', time: '18:00' }]);
    }
  });

  it('two devices offline, one clears the day and the other sets a time on the day it still sees: nothing is lost, and the time waits for a day', async () => {
    const w = world();
    const a = await w.device('a');
    const id = a.today.add('call the bank')!;
    const b = await w.device('b');
    w.exchange(a, b);
    a.today.edit(id, { due: null });
    w.time.advance(10000);
    b.today.edit(id, { time: '18:00' });
    w.exchange(a, b);
    for (const d of [a, b]) {
      assert.deepEqual([row(d, id)?.due, row(d, id)?.time], [null, '18:00']);
      assert.equal(d.today.next.value?.time, null);
    }
  });
});

describe('what the phone reminds of', () => {
  it('timed is every open task with a day and a time, subtasks too, by day and time; done, deleted and dayless ones are not in it', async () => {
    const w = world();
    const d = await w.device('a');
    assert.deepEqual(d.today.timed.value, []);
    const bank = d.today.add('call the bank')!;
    const read = d.today.add('read')!;
    const page = d.today.addSubtask(read, 'page 40')!;
    const plain = d.today.add('no time on this one')!;
    d.today.edit(bank, { time: '15:30' });
    d.today.edit(read, { due: TOMORROW, time: '07:00' });
    d.today.edit(page, { time: '09:00' });
    assert.deepEqual(d.today.timed.value, [
      { id: page, title: 'page 40', day: TODAY, time: '09:00' },
      { id: bank, title: 'call the bank', day: TODAY, time: '15:30' },
      { id: read, title: 'read', day: TOMORROW, time: '07:00' },
    ]);
    const ids = () => d.today.timed.value.map((t) => t.id);
    d.today.setDone(bank, true);
    assert.deepEqual(ids(), [page, read]);
    d.today.setDone(bank, false);
    d.today.remove(bank);
    assert.deepEqual(ids(), [page, read]);
    d.today.restore(bank);
    d.today.editSubtask(page, { done: true });
    assert.deepEqual(ids(), [bank, read]);
    d.today.editSubtask(page, { done: false });
    // A subtask shows inside its parent only: with the parent deleted it is on no screen, and rings on no phone.
    d.today.remove(read);
    assert.deepEqual(ids(), [bank]);
    d.today.restore(read);
    assert.deepEqual(ids(), [page, bank, read]);
    d.today.edit(plain, { time: null });
    assert.deepEqual(ids(), [page, bank, read]);
  });

  it('timed changes when a task does, and not with the clock: a lap running does not hand the phone a new list every few seconds', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.add('call the bank')!;
    d.today.edit(id, { time: '15:30' });
    const before = d.today.timed.value;
    d.focus.start(id);
    void d.today.list.value;
    w.time.advance(5 * MIN);
    void d.today.list.value;
    assert.equal(d.today.timed.value, before);
    d.today.edit(id, { time: '16:00' });
    assert.notEqual(d.today.timed.value, before);
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

  it('a project is renamed: trimmed, cut at 24 characters by whole characters, and an empty name changes nothing', async () => {
    const w = world();
    const d = await w.device('a');
    assert.equal(PROJECT_NAME_MAX, 24);
    const id = d.today.addProject('  The C Programming Language, second edition  ', 'teal')!;
    const name = () => d.today.projects.value.find((p) => p.id === id)?.name;
    assert.equal(name(), 'The C Programming Langua');
    d.today.editProject(id, { name: '  K&R ' });
    assert.equal(name(), 'K&R');
    const cells = d.engine.cells();
    d.today.editProject(id, { name: '   ' });
    d.today.editProject(id, { name: '' });
    assert.deepEqual(d.engine.cells(), cells);
    d.today.editProject(id, { name: 'exactly twenty-four long' });
    assert.equal(name(), 'exactly twenty-four long');
    d.today.editProject(id, { name: `${'a'.repeat(23)}📚📚` });
    assert.equal(name(), `${'a'.repeat(23)}📚`, 'the 24th character is the whole book, not half of it');
    // Cut where a space was the 24th: no name ends in one.
    d.today.editProject(id, { name: `${'b'.repeat(23)} and more` });
    assert.equal(name(), 'b'.repeat(23));
    // A longer name another build wrote is shown as it is.
    d.engine.write('project', id, { name: 'A name of more than twenty-four characters' });
    assert.equal(name(), 'A name of more than twenty-four characters');
  });

  it('a project is deleted and its tasks show none; the Undo, here or on another device, gives each its project back', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.today.addProject('The C book', 'teal')!;
    const tasks = ['pointers', 'arrays'].map((t) => a.today.add(t)!);
    for (const task of tasks) a.today.edit(task, { project: id });
    const shown = (d: Device) => d.today.list.value.map((t) => t.project?.name ?? null);
    assert.deepEqual(shown(a), ['The C book', 'The C book']);
    w.time.advance(1000);
    a.today.removeProject(id);
    assert.equal(a.engine.rows('project').value.get(id)?.deleted, T0 + 1000);
    assert.deepEqual(a.today.projects.value, []);
    assert.deepEqual(shown(a), [null, null]);
    assert.deepEqual(tasks.map((task) => row(a, task)?.project), [id, id], 'the tasks are not written: each still says which project it was');
    w.exchange(a, b);
    assert.deepEqual(shown(b), [null, null]);
    w.time.advance(1000);
    b.today.restoreProject(id);
    assert.equal(b.engine.rows('project').value.get(id)?.deleted, null);
    w.exchange(a, b);
    for (const d of [a, b]) {
      assert.deepEqual(shown(d), ['The C book', 'The C book']);
      assert.deepEqual(d.today.projects.value, [{ id, name: 'The C book', color: 'teal' }]);
    }
    // Nothing to delete or bring back: nothing is written.
    const cells = a.engine.cells();
    a.today.restoreProject(id);
    a.today.restoreProject('nobody');
    a.today.removeProject('nobody');
    assert.deepEqual(a.engine.cells(), cells);
    a.today.removeProject(id);
    const once = a.engine.cells();
    a.today.removeProject(id);
    assert.deepEqual(a.engine.cells(), once);
  });

  it('a project with a colour this build does not know is shown in ink, and one with no name yet is not shown', async () => {
    const w = world();
    const d = await w.device('a');
    d.engine.write('project', 'p1', { name: 'From a newer build', color: 'heat-9', order: 'V' });
    d.engine.write('project', 'p2', { color: 'you', order: 'W' });
    assert.deepEqual(d.today.projects.value, [{ id: 'p1', name: 'From a newer build', color: 'ink' }]);
  });

  it('an unknown colour is never rewritten by a device that only read it: renaming or archiving the project leaves the cell and its stamp', async () => {
    const w = world();
    const d = await w.device('a');
    for (const [i, odd] of ['mauve', '#abc', '#12345g', 7, null].entries()) {
      const id = `p${i}`;
      d.engine.write('project', id, { name: 'From a newer build', color: odd, order: 'V' });
      const stamp = d.engine.stamp('project', id, 'color');
      const task = d.today.add('in it')!;
      d.today.edit(task, { project: id });
      assert.equal(d.today.projects.value.find((p) => p.id === id)?.color, 'ink', 'shown, in ink');
      assert.equal(d.today.list.value.find((t) => t.id === task)?.project?.color, 'ink');
      d.today.editProject(id, { name: 'Renamed' });
      d.today.editProject(id, { archived: true });
      d.today.editProject(id, { archived: false });
      assert.deepEqual(d.engine.rows('project').value.get(id)?.color, odd);
      assert.equal(d.engine.stamp('project', id, 'color'), stamp);
    }
  });

  it('the twelve colours by name, and a picked one as a hex, written in lower case', async () => {
    const w = world();
    const d = await w.device('a');
    assert.deepEqual(COLORS, ['you', 'rest', 'ink', 'ghost', 'heat-2', 'amber', 'olive', 'teal', 'sky', 'indigo', 'plum', 'clay']);
    for (const color of COLORS) {
      const id = d.today.addProject(color, color)!;
      assert.equal(d.engine.rows('project').value.get(id)?.color, color);
    }
    assert.deepEqual(d.today.projects.value.map((p) => p.color), COLORS);
    const picked = d.today.addProject('Picked', '#C0FFEE')!;
    assert.equal(d.engine.rows('project').value.get(picked)?.color, '#c0ffee');
    assert.equal(d.today.projects.value.at(-1)?.color, '#c0ffee');
    d.today.editProject(picked, { color: '#AB12cd' });
    assert.equal(d.engine.rows('project').value.get(picked)?.color, '#ab12cd');
    d.today.editProject(picked, { color: 'clay' });
    assert.equal(d.today.projects.value.at(-1)?.color, 'clay');
    // A hex another device wrote in capitals is the same colour, shown in the one spelling.
    d.engine.write('project', picked, { color: '#C0FFEE' });
    assert.equal(d.today.projects.value.at(-1)?.color, '#c0ffee');
  });

  it('anything else is refused: no project is made of it, and an edit with it writes nothing', async () => {
    const w = world();
    const d = await w.device('a');
    const id = d.today.addProject('The C book', 'teal')!;
    const cells = d.engine.cells();
    const refused = ['#abc', '#ABC', 'mauve', 'You', 'heat-9', '#12345g', '#1234567', 'c0ffee', ' #c0ffee', 'rgb(1,2,3)', '', 7, null];
    for (const color of refused) {
      assert.equal(isColor(color), false, JSON.stringify(color));
      assert.equal(d.today.addProject('Another', color as never), null);
      d.today.editProject(id, { color: color as never });
    }
    assert.deepEqual(d.engine.cells(), cells);
    for (const color of [...COLORS, '#c0ffee', '#C0FFEE', '#000000']) assert.equal(isColor(color), true, color);
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
