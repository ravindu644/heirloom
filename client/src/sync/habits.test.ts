// Habits on the real engine, with days made by hand: see world.ts for the devices.
// "Now" is 10:00 on Tuesday 2026-11-24 in Sri Lanka unless a test moves the clock. The Monday of
// this week is the 23rd.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cell } from '../core/merge.ts';
import { eventStamp } from '../core/hlc.ts';
import { GONE } from '../core/real.ts';
import type { Write } from '../store/store.ts';
import { T0 } from './fakes.ts';
import { MIN, OFFSET, world } from './world.ts';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TODAY = '2026-11-24';
const EVERY_DAY = 127;
const WEEKDAYS = 31;

type Device = Awaited<ReturnType<ReturnType<typeof world>['device']>>;
const at = (day: string, hour: number, minute = 0) => Date.parse(day) - OFFSET * MIN + hour * HOUR + minute * MIN;

let made = 0;
// A check-in on a day gone by, as the row it left.
const past = (d: Device, habit: string, day: string, hour = 8) => {
  const id = `c${++made}`;
  d.engine.write('checkin', id, { habit, day, at: at(day, hour) });
  return id;
};
const on = (d: Device, habit: string, days: string[]) => days.forEach((day) => past(d, habit, `2026-11-${day}`));
const view = (d: Device, id: string) => [...d.habits.list.value, ...d.habits.archived.value, ...d.habits.deleted.value].find((h) => h.id === id)!;
const titles = (list: { title: string }[]) => list.map((h) => h.title);
const rows = (d: Device) => [...d.engine.rows('checkin').value.values()];

async function one() {
  const w = world();
  const d = await w.device('a');
  return { w, d, h: d.habits };
}

describe('checking in', () => {
  it('one tap is one row: the habit, the day and the moment, written together under an id of its own', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.habits.add('Read', EVERY_DAY, 1)!;
    await d.engine.saved();
    log.length = 0;
    const row = d.habits.checkIn(id)!;
    await d.engine.saved();
    assert.deepEqual(rows(d), [{ id: row, habit: id, day: TODAY, at: T0 }]);
    assert.equal(log.length, 1);
    assert.deepEqual(log[0]!.cells!.map((c) => c.field), ['habit', 'day', 'at']);
    assert.deepEqual(view(d, id).today, { day: TODAY, planned: true, count: 1, done: true, rest: false });
    // Not one cell of the habit itself was touched: a check-in never changes a number.
    assert.equal(log[0]!.cells!.every((c) => c.dataset === 'checkin'), true);
  });

  it('a target of three needs three, and shows the count on the way', async () => {
    const { d, h } = await one();
    const id = h.add('Glass of water', EVERY_DAY, 3)!;
    assert.deepEqual([view(d, id).today.count, view(d, id).today.done], [0, false]);
    h.checkIn(id);
    h.checkIn(id);
    assert.deepEqual([view(d, id).today.count, view(d, id).today.done], [2, false]);
    assert.deepEqual(h.today.value, { done: 0, planned: 1 });
    h.checkIn(id);
    assert.deepEqual([view(d, id).today.count, view(d, id).today.done], [3, true]);
    assert.deepEqual(h.today.value, { done: 1, planned: 1 });
    // More than the target is still done, and still counted.
    h.checkIn(id);
    assert.deepEqual([view(d, id).today.count, view(d, id).today.done], [4, true]);
    assert.equal(rows(d).length, 4);
  });

  it('undo takes back the latest of today, by marking it: no row is removed, and yesterday\'s is never touched', async () => {
    const { w, d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    const yesterday = past(d, id, '2026-11-23');
    const first = h.checkIn(id)!;
    w.time.advance(MIN);
    const second = h.checkIn(id)!;
    h.undo(id);
    assert.equal(typeof d.engine.rows('checkin').value.get(second)?.deleted, 'number');
    assert.equal(d.engine.rows('checkin').value.get(first)?.deleted, undefined);
    assert.equal(view(d, id).today.count, 1);
    h.undo(id);
    assert.equal(view(d, id).today.count, 0);
    assert.equal(rows(d).length, 3, 'all three rows are still there');
    // Nothing left of today: undo does nothing, and yesterday stands.
    const cells = d.engine.cells();
    h.undo(id);
    h.undo('nobody');
    assert.deepEqual(d.engine.cells(), cells);
    assert.equal(d.engine.rows('checkin').value.get(yesterday)?.deleted, undefined);
    assert.equal(view(d, id).record[0]!.count, 1);
  });

  it('two devices check in offline for the same habit: two rows, and both count', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.habits.add('Stretch', EVERY_DAY, 2)!;
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    a.habits.checkIn(id);
    w.time.advance(MIN);
    b.habits.checkIn(id);
    assert.equal(view(a, id).today.done, false);
    w.exchange(a, b);
    assert.equal(rows(a).length, 2);
    assert.deepEqual([view(a, id).today.count, view(a, id).today.done], [2, true]);
    assert.deepEqual([view(b, id).today.count, view(b, id).today.done], [2, true]);
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
  });

  it('two devices check in when one more would have reached the target: it ends done with one to spare, and neither tap is lost', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.habits.add('Glass of water', EVERY_DAY, 3)!;
    a.habits.checkIn(id);
    a.habits.checkIn(id);
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    a.habits.checkIn(id);
    b.habits.checkIn(id);
    w.exchange(a, b);
    assert.deepEqual([view(a, id).today.count, view(a, id).today.done], [4, true]);
    assert.deepEqual(view(b, id).today, view(a, id).today);
    assert.equal(rows(b).length, 4);
  });

  it('a habit that is not there, or was deleted, takes no check-in', async () => {
    const { d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    h.remove(id);
    assert.equal(h.checkIn(id), null);
    assert.equal(h.checkIn('nobody'), null);
    assert.deepEqual(rows(d), []);
  });
});

describe('a habit\'s days', () => {
  it('a check-in on a day the habit is not planned for shows on that day and feeds nothing else', async () => {
    const { d, h } = await one();
    const id = h.add('Deep work', WEEKDAYS, 1)!;
    on(d, id, ['19', '20', '21', '23']);
    const habit = view(d, id);
    // Saturday the 21st: there, counted on its day, and no part of the streak.
    assert.deepEqual(habit.record.find((day) => day.day === '2026-11-21'), { day: '2026-11-21', planned: false, count: 1, done: true, rest: false });
    assert.equal(habit.streak, 3);
    assert.deepEqual([habit.kept, habit.of], [3, 3]);
    assert.deepEqual(h.today.value, { done: 0, planned: 1 });
    // A Monday habit, tapped today, a Tuesday: shown on today, and not one of today's planned habits.
    const mondays = h.add('Plan the week', 1, 1)!;
    h.checkIn(mondays);
    assert.deepEqual(view(d, mondays).today, { day: TODAY, planned: false, count: 1, done: true, rest: false });
    assert.equal(view(d, mondays).streak, 0);
    assert.deepEqual(h.today.value, { done: 0, planned: 1 });
  });

  it('a weekday habit\'s streak skips the weekend: neither a rest day nor a miss', async () => {
    const { d, h } = await one();
    const id = h.add('Deep work', WEEKDAYS, 1)!;
    on(d, id, ['16', '17', '18', '19', '20', '23']);
    const habit = view(d, id);
    assert.equal(habit.streak, 6);
    assert.deepEqual([habit.kept, habit.of], [6, 6]);
    assert.equal(habit.missed, false);
    assert.deepEqual(habit.record.filter((day) => !day.planned).map((day) => [day.day.slice(8), day.rest]), [['21', false], ['22', false]]);
    h.checkIn(id);
    assert.equal(view(d, id).streak, 7);
  });

  it('a miss inside the 45 days sets `missed`, and kept of says how the days really went', async () => {
    const { d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    // The week of the 9th: Mon, Tue, Thu and Sun. Wed and Fri are rest days; Saturday is the third empty day, a miss.
    on(d, id, ['09', '10', '12', '15', '16', '17', '18', '19', '20', '21', '22', '23']);
    const habit = view(d, id);
    assert.equal(habit.missed, true);
    assert.equal(habit.streak, 9, 'since the miss on the 14th');
    assert.deepEqual([habit.kept, habit.of], [12, 15]);
    assert.deepEqual(habit.record.slice(2, 6).map((day) => [day.day.slice(8), day.done, day.rest]), [['11', false, true], ['12', true, false], ['13', false, true], ['14', false, false]]);
  });

  it('rest days alone are not a miss', async () => {
    const { d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    on(d, id, ['16', '17', '19', '21', '22', '23']);
    assert.equal(view(d, id).missed, false);
    assert.deepEqual([view(d, id).kept, view(d, id).of], [6, 8]);
  });

  it('changing the target changes which past days read as done: today\'s target is used for every day', async () => {
    const { d, h } = await one();
    const id = h.add('Glass of water', EVERY_DAY, 1)!;
    on(d, id, ['21', '22', '22', '23', '23', '23']);
    assert.deepEqual(view(d, id).record.map((day) => day.done), [true, true, true, false]);
    assert.equal(view(d, id).streak, 3);
    h.edit(id, { target: 2 });
    assert.deepEqual(view(d, id).record.map((day) => [day.count, day.done]), [[1, false], [2, true], [3, true], [0, false]]);
    assert.equal(view(d, id).streak, 2);
    h.edit(id, { target: 3 });
    assert.deepEqual(view(d, id).record.map((day) => day.done), [false, false, true, false]);
    assert.equal(view(d, id).streak, 1);
  });

  it('this week, Monday first: what was done, today, and the days to come empty', async () => {
    const { d, h } = await one();
    const id = h.add('Deep work', WEEKDAYS, 1)!;
    on(d, id, ['23']);
    // A device with its clock a few days fast checked in for Thursday. That day has not come: it shows nothing yet.
    on(d, id, ['26']);
    assert.deepEqual(view(d, id).week, [
      { day: '2026-11-23', planned: true, count: 1, done: true, rest: false },
      { day: '2026-11-24', planned: true, count: 0, done: false, rest: false },
      { day: '2026-11-25', planned: true, count: 0, done: false, rest: false },
      { day: '2026-11-26', planned: true, count: 0, done: false, rest: false },
      { day: '2026-11-27', planned: true, count: 0, done: false, rest: false },
      { day: '2026-11-28', planned: false, count: 0, done: false, rest: false },
      { day: '2026-11-29', planned: false, count: 0, done: false, rest: false },
    ]);
  });

  it('before any check-in there is no record, no streak and nothing kept', async () => {
    const { d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    const habit = view(d, id);
    assert.deepEqual(habit.record, []);
    assert.deepEqual([habit.streak, habit.kept, habit.of, habit.missed], [0, 0, 0, false]);
    assert.deepEqual(habit.today, { day: TODAY, planned: true, count: 0, done: false, rest: false });
  });

  it('at local midnight today rolls over with nobody tapping: the count starts again and yesterday is in the record', async () => {
    const { w, d, h } = await one();
    assert.equal(h.day.value, TODAY);
    const id = h.add('Read', EVERY_DAY, 1)!;
    h.checkIn(id);
    let changes = 0;
    const stop = h.today.subscribe(() => changes++);
    assert.deepEqual(h.today.value, { done: 1, planned: 1 });
    w.time.advance(14 * HOUR);
    assert.deepEqual(h.today.value, { done: 0, planned: 1 });
    assert.equal(changes, 2);
    stop();
    assert.equal(h.day.value, '2026-11-25');
    assert.equal(view(d, id).deleted, null);
    assert.equal(view(d, id).today.day, '2026-11-25');
    assert.deepEqual(view(d, id).record.map((day) => [day.day, day.done]), [[TODAY, true], ['2026-11-25', false]]);
    assert.equal(view(d, id).streak, 1, 'today is not over, so it is not an empty day');
  });

  it('wake() after a sleep over midnight: today is right at once, and a tap then is for the real day', async () => {
    const { w, d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    h.checkIn(id);
    w.time.jump(20 * HOUR);
    assert.equal(view(d, id).today.day, TODAY);
    h.wake();
    assert.equal(view(d, id).today.day, '2026-11-25');
    assert.equal(view(d, id).today.count, 0);
    w.time.jump(20 * HOUR);
    // Even with nobody calling wake: the row gets the day it really is.
    const row = h.checkIn(id)!;
    assert.equal(d.engine.rows('checkin').value.get(row)?.day, '2026-11-26');
  });
});

describe('this week against last', () => {
  it('check-ins from Monday to now, and last week\'s from its Monday to the same weekday and time', async () => {
    const { w, d, h } = await one();
    const read = h.add('Read', EVERY_DAY, 1)!;
    const water = h.add('Glass of water', EVERY_DAY, 3)!;
    // Last week: Monday two, Tuesday one at 08:00 and one at 11:00, Wednesday one.
    past(d, read, '2026-11-16');
    past(d, water, '2026-11-16');
    past(d, read, '2026-11-17', 8);
    past(d, water, '2026-11-17', 11);
    past(d, read, '2026-11-18');
    // This week: Monday one, and today.
    past(d, read, '2026-11-23');
    assert.deepEqual(h.week(), { now: 1, before: 3 });
    h.checkIn(read);
    h.checkIn(water);
    assert.deepEqual(h.week(), { now: 3, before: 3 });
    // An hour on, last Tuesday's 11:00 one is behind us too.
    w.time.advance(HOUR + MIN);
    assert.deepEqual(h.week(), { now: 3, before: 4 });
    // One taken back is not counted; one for a habit put away is not either.
    h.undo(water);
    assert.deepEqual(h.week(), { now: 2, before: 4 });
    h.edit(water, { archived: true });
    assert.deepEqual(h.week(), { now: 2, before: 2 });
  });
});

describe('the list', () => {
  it('a new habit goes to the end; what no habit could hold reads as every day and once', async () => {
    const { d, h } = await one();
    const read = h.add('  Read  ', WEEKDAYS, 2)!;
    const odd = h.add('Odd', 0, 0.5)!;
    assert.equal(h.add('   ', EVERY_DAY, 1), null);
    assert.deepEqual(d.engine.rows('habit').value.get(read), { id: read, title: 'Read', days: WEEKDAYS, target: 2, order: 'V' });
    assert.deepEqual(d.engine.rows('habit').value.get(odd), { id: odd, title: 'Odd', days: EVERY_DAY, target: 1, order: 'W' });
    assert.deepEqual(titles(h.list.value), ['Read', 'Odd']);
  });

  it('a check-in for a day that is not on the calendar, or from a clock that died, is not read: the record neither breaks nor runs back to 1970', async () => {
    const { d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    on(d, id, ['22', '23']);
    d.engine.write('checkin', 'bad-month', { habit: id, day: '2026-13-45', at: T0 });
    d.engine.write('checkin', 'bad-day', { habit: id, day: '2026-02-31', at: T0 });
    d.engine.write('checkin', 'dead-clock', { habit: id, day: '1970-01-01', at: 0 });
    d.engine.write('checkin', 'no-such-time', { habit: id, day: TODAY, at: 1e20 });
    const habit = view(d, id);
    assert.deepEqual(habit.record.map((day) => [day.day.slice(8), day.count]), [['22', 1], ['23', 1], ['24', 0]]);
    assert.deepEqual([habit.streak, habit.kept, habit.of], [2, 2, 2]);
    assert.deepEqual(h.week(), { now: 1, before: 0 });
    // The rows are still held and sent on: only not counted.
    assert.equal(d.engine.rows('checkin').value.size, 6);
  });

  it('a row with no title yet is not a habit; a target or days that is missing or malformed reads as 1 and every day', async () => {
    const { d, h } = await one();
    d.engine.write('habit', 'half', { days: WEEKDAYS, order: 'V' });
    d.engine.write('habit', 'odd', { title: 'From a newer build', days: 300, target: 'three', remind: '7.30', order: 'W' });
    d.engine.write('checkin', 'broken', { habit: 'odd', day: 'today' });
    assert.deepEqual(titles(h.list.value), ['From a newer build']);
    const odd = view(d, 'odd');
    assert.deepEqual([odd.days, odd.target, odd.remind, odd.today.count], [EVERY_DAY, 1, null, 0]);
    assert.equal(h.checkIn('half'), null);
  });

  it('edit writes only what was given and could be held, in one write', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const id = d.habits.add('Read', EVERY_DAY, 1)!;
    await d.engine.saved();
    log.length = 0;
    d.habits.edit(id, { title: ' Read 20 pages ', days: WEEKDAYS, target: 2, remind: '07:30' });
    await d.engine.saved();
    assert.equal(log.length, 1);
    const habit = view(d, id);
    assert.deepEqual([habit.title, habit.days, habit.target, habit.remind], ['Read 20 pages', WEEKDAYS, 2, '07:30']);
    const cells = d.engine.cells();
    d.habits.edit(id, { title: '  ', days: 0, target: 0, remind: '25:00' });
    d.habits.edit('nobody', { title: 'x' });
    assert.deepEqual(d.engine.cells(), cells);
    d.habits.edit(id, { remind: null });
    assert.equal(view(d, id).remind, null);
  });

  it('archive takes it off the list and keeps its record; it comes back as it was', async () => {
    const { d, h } = await one();
    const id = h.add('Read', EVERY_DAY, 1)!;
    h.add('Stretch', EVERY_DAY, 1);
    on(d, id, ['21', '22', '23']);
    h.edit(id, { archived: true });
    assert.deepEqual(titles(h.list.value), ['Stretch']);
    assert.deepEqual(titles(h.archived.value), ['Read']);
    assert.equal(h.archived.value[0]!.record.length, 4);
    assert.equal(h.archived.value[0]!.streak, 3);
    assert.deepEqual(h.today.value, { done: 0, planned: 1 }, 'it is no longer one of today\'s');
    assert.equal(rows(d).length, 3);
    h.edit(id, { archived: false });
    assert.deepEqual(titles(h.list.value), ['Read', 'Stretch']);
    assert.deepEqual(h.archived.value, []);
  });

  it('purge deletes for good a habit that is on the shelf: one cell, on no list again, and its check-ins are not written', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const [id, alive, shelved] = ['stretch', 'read', 'walk'].map((title) => d.habits.add(title, EVERY_DAY, 1)!);
    d.habits.edit(id!, { remind: '07:30' });
    d.habits.checkIn(id!);
    d.habits.remove(id!);
    d.habits.edit(shelved!, { archived: true });
    assert.deepEqual(d.habits.deleted.value.map((h) => h.title), ['stretch']);
    await d.engine.saved();
    log.length = 0;
    d.habits.purge(id!);
    await d.engine.saved();
    assert.deepEqual(log.flatMap((write) => write.cells!.map((c) => [c.dataset, c.row, c.field, c.value])), [['habit', id, 'deleted', GONE]]);
    assert.deepEqual([d.habits.list.value, d.habits.archived.value, d.habits.deleted.value].map((list) => list.map((h) => h.title)), [['read'], ['walk'], []]);
    // Its reminder is made from `list`, so it rings on no phone. And waiting, or a restart, does not bring it back.
    w.time.advance(31 * DAY);
    const again = await w.restart(d);
    assert.deepEqual([again.habits.list.value, again.habits.archived.value, again.habits.deleted.value].map((list) => list.length), [1, 1, 0]);
    // Only what is on the shelf: a habit still alive, an archived one, one already gone, nobody.
    const cells = again.engine.cells();
    for (const other of [alive, shelved, id, 'nobody']) again.habits.purge(other!);
    assert.deepEqual(again.engine.cells(), cells);
  });

  it('one device restores a habit while another deletes it for good: the later of the two stands on both', async () => {
    for (const later of ['purge', 'restore'] as const) {
      const w = world();
      const a = await w.device('a');
      const id = a.habits.add('stretch', EVERY_DAY, 1)!;
      a.habits.remove(id);
      const b = await w.device('b');
      w.exchange(a, b);
      const act = { restore: () => a.habits.restore(id), purge: () => b.habits.purge(id) };
      act[later === 'purge' ? 'restore' : 'purge']();
      w.time.advance(5000);
      act[later]();
      w.exchange(a, b);
      for (const d of [a, b]) {
        assert.deepEqual(d.habits.list.value.map((h) => h.title), later === 'purge' ? [] : ['stretch'], `${later} later, on ${d.name}`);
        assert.deepEqual(d.habits.deleted.value, []);
      }
      assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
    }
  });

  it('delete and restore: thirty days in Recently deleted, the check-ins kept, and edits made on another device in between kept too', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const id = a.habits.add('Read', EVERY_DAY, 1)!;
    on(a, id, ['22', '23']);
    await a.settle();
    w.exchange(a, b);
    a.disconnect();
    b.disconnect();
    a.habits.remove(id);
    w.time.advance(MIN);
    b.habits.edit(id, { title: 'Read 20 pages' });
    w.exchange(a, b);
    assert.deepEqual(a.habits.list.value, []);
    assert.deepEqual(titles(a.habits.deleted.value), ['Read 20 pages']);
    // It says when it was deleted, so the screen can say when it goes for good. A live habit says null.
    assert.equal(a.habits.deleted.value[0]!.deleted, T0);
    assert.equal(a.habits.deleted.value[0]!.streak, 2);
    w.time.advance(MIN);
    a.habits.restore(id);
    w.exchange(a, b);
    assert.deepEqual(titles(b.habits.list.value), ['Read 20 pages']);
    assert.equal(view(b, id).record.length, 3);
    // Left deleted, it is gone from the list of the recently deleted after thirty days.
    b.habits.remove(id);
    w.time.advance(30 * DAY);
    assert.deepEqual(b.habits.deleted.value, []);
  });

  it('reorder: before another or to the end, one key written; two on one key make room as tasks do', async () => {
    const w = world();
    const log: Write[] = [];
    const d = await w.device('a', { log });
    const h = d.habits;
    const ids = ['one', 'two', 'three'].map((title) => h.add(title, EVERY_DAY, 1)!);
    await d.engine.saved();
    log.length = 0;
    h.move(ids[2]!, ids[0]!);
    assert.deepEqual(titles(h.list.value), ['three', 'one', 'two']);
    h.move(ids[2]!, null);
    assert.deepEqual(titles(h.list.value), ['one', 'two', 'three']);
    await d.engine.saved();
    assert.equal(log.flatMap((write) => write.cells ?? []).length, 2);
    // Another device added one at the end offline and picked the key "three" already has.
    d.engine.write('habit', 'tie', { title: 'tie', days: EVERY_DAY, target: 1, order: d.engine.rows('habit').value.get(ids[2]!)!.order });
    assert.deepEqual(titles(h.list.value), ['one', 'two', 'three', 'tie']);
    await d.engine.saved();
    log.length = 0;
    h.move(ids[0]!, 'tie');
    assert.deepEqual(titles(h.list.value), ['two', 'three', 'one', 'tie']);
    await d.engine.saved();
    assert.equal(log.length, 1, 'one store transaction');
    assert.deepEqual(log[0]!.cells!.map((c) => c.row), [ids[0], 'tie'], 'the moved one, and the one that made room');
  });

  it('archived habits are ordered among themselves', async () => {
    const { h } = await one();
    const ids = ['one', 'two', 'three'].map((title) => h.add(title, EVERY_DAY, 1)!);
    for (const id of ids) h.edit(id, { archived: true });
    h.move(ids[2]!, ids[0]!);
    assert.deepEqual(titles(h.archived.value), ['three', 'one', 'two']);
  });
});

describe('keeping the work down', () => {
  // A year of ten habits, checked in most days: about 3,300 rows, arriving in one go.
  function year(d: Device, habits: string[]): Cell[] {
    const cells: Cell[] = [];
    let n = 0;
    for (const habit of habits) {
      for (let back = 1; back <= 365; back++) {
        if ((back + habit.length) % 10 === 0) continue;
        const moment = T0 - back * DAY;
        const day = new Date(moment + OFFSET * MIN).toISOString().slice(0, 10);
        for (const [field, value] of Object.entries({ habit, day, at: moment })) cells.push({ stamp: eventStamp(moment, d.engine.device), dataset: 'checkin', row: `y${n}`, field, value });
        n += 1;
      }
    }
    return cells;
  }

  it('every check-in is gone through once, and again only when a check-in changed and someone is reading', async () => {
    const { w, d, h } = await one();
    const ids = Array.from({ length: 10 }, (_, n) => h.add(`habit ${n}`, EVERY_DAY, 1)!);
    d.receive(year(d, ids));
    const before = h.recomputed();
    assert.equal(h.list.value.length, 10);
    assert.equal(h.list.value[0]!.record.length, 366);
    void h.today.value;
    void h.archived.value;
    void h.week();
    assert.equal(h.recomputed(), before + 1);

    // A minute of ticks, a title typed, a habit moved, a reminder set, the day turning over.
    for (let n = 0; n < 60; n++) {
      w.time.advance(1000);
      void h.week();
      void h.today.value;
    }
    for (let n = 0; n < 20; n++) {
      h.edit(ids[0]!, { title: `Read ${n} pages` });
      void h.list.value;
    }
    h.move(ids[3]!, null);
    h.edit(ids[1]!, { remind: '07:30', target: 2 });
    void h.list.value;
    w.time.advance(DAY);
    void h.list.value;
    void h.week();
    assert.equal(h.recomputed(), before + 1, 'none of that touched a check-in row');

    // Check-ins made with nobody reading cost nothing until someone does.
    h.checkIn(ids[0]!);
    h.checkIn(ids[1]!);
    assert.equal(h.recomputed(), before + 1);
    assert.equal(h.list.value.find((habit) => habit.id === ids[0])!.today.count, 1);
    void h.week();
    void h.today.value;
    assert.equal(h.recomputed(), before + 2);
  });

  it('close() leaves no timer waiting', async () => {
    const { w, d, h } = await one();
    void h.list.value;
    d.close();
    assert.equal(w.time.waiting(), 0);
  });
});
