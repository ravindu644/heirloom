// When reminders fall, in the device's own zone: planned days, today when not done, summer time,
// stable ids, and the cap.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIRST_ID, LAST_ID, MAX_DUE, upcoming } from './reminders.ts';

const habit = (id: string, time: string, days = 0b1111111, doneToday = false) => ({ habit: id, title: id, body: '', time, days, doneToday });
const local = (ms: number) => new Date(ms).toString().slice(0, 21);

describe('upcoming reminders', () => {
  process.env.TZ = 'Asia/Colombo';
  // Tuesday 24 November 2026, 10:00 in Colombo.
  const now = Date.UTC(2026, 10, 24, 4, 30);

  it('skips today when done, keeps it when not, and a day the habit is not planned gets none', () => {
    assert.equal(local(upcoming([habit('a', '18:00')], now)[0]!.at), 'Tue Nov 24 2026 18:00');
    assert.equal(local(upcoming([habit('a', '18:00', 0b1111111, true)], now)[0]!.at), 'Wed Nov 25 2026 18:00');
    // Weekends only: Saturday and Sunday, twice in fourteen days.
    assert.deepEqual(upcoming([habit('a', '09:00', 0b1100000)], now).map((d) => local(d.at)), [
      'Sat Nov 28 2026 09:00', 'Sun Nov 29 2026 09:00', 'Sat Dec 05 2026 09:00', 'Sun Dec 06 2026 09:00',
    ]);
  });

  it('a reminder keeps its id from one day to the next, and ids stay in their range and apart', () => {
    const today = upcoming([habit('a', '18:00'), habit('b', '18:00')], now);
    const tomorrow = upcoming([habit('a', '18:00'), habit('b', '18:00')], now + 86_400_000);
    const before = new Map(today.map((d) => [d.sig, d.id]));
    const shared = tomorrow.filter((d) => before.has(d.sig));
    assert.equal(shared.length, 26);
    assert.ok(shared.every((d) => before.get(d.sig) === d.id));
    assert.equal(new Set(today.map((d) => d.id)).size, today.length);
    assert.ok(today.every((d) => d.id >= FIRST_ID && d.id <= LAST_ID));
  });

  it('a habit time that is not a time, or no planned days, gives nothing', () => {
    assert.deepEqual(upcoming([habit('a', '7:30'), habit('b', '25:00'), habit('c', '08:00', 0)], now), []);
  });

  it('keeps the nearest when there are too many', () => {
    const many = upcoming(Array.from({ length: 40 }, (_, i) => habit(`h${i}`, '20:00')), now);
    assert.equal(many.length, MAX_DUE);
    assert.ok(many.every((d, i) => i === 0 || many[i - 1]!.at <= d.at));
  });

  it('follows the wall clock across summer time', () => {
    process.env.TZ = 'Europe/London';
    try {
      // Tuesday 20 October 2026; summer time ends on Sunday the 25th.
      const due = upcoming([habit('a', '07:30')], Date.UTC(2026, 9, 20, 12));
      assert.ok(due.every((d) => local(d.at).endsWith('07:30')));
      const utcHours = new Set(due.map((d) => new Date(d.at).getUTCHours()));
      assert.deepEqual([...utcHours].sort(), [6, 7]);
    } finally {
      process.env.TZ = 'Asia/Colombo';
    }
  });
});
