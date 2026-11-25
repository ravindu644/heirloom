// Habits (protocol section 14) on two devices against the real server: a check-in is a row of its
// own, so two offline taps are two, and the streak is the same function of the same rows on both.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { streakWindow } from '../../client/src/core/streak.ts';
import { localDay } from '../../client/src/core/stats.ts';
import { createHabits } from '../../client/src/sync/habits.ts';
import { account, converge, offline, online, serverRows, signedIn, startServer, stopAll, until } from './harness.ts';
import type { Device, Server } from './harness.ts';

let server: Server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await stopAll();
  await server.stop();
});

const DAY = 86400000;
let ids = 0;
const habitsOn = (d: Device) =>
  createHabits(d.engine, {
    utcOffsetMin: () => 0,
    id: () => `h${++ids}`,
    schedule: (run, ms) => {
      const t = setTimeout(run, ms);
      return () => clearTimeout(t);
    },
  });

test('two devices check in offline: both rows kept everywhere, together they reach a target of 2, and undo takes back only the latest', async () => {
  const a = await account(server, 'habits1');
  const b = await signedIn(server, 'habits1');
  const [ha, hb] = [habitsOn(a), habitsOn(b)];
  const id = ha.add('read 20 pages', 127, 2)!;
  await converge([a, b]);
  const view = (h: typeof ha) => h.list.value.find((habit) => habit.id === id)!.today;

  offline(a);
  offline(b);
  ha.checkIn(id);
  hb.checkIn(id);
  for (const h of [ha, hb]) assert.deepEqual([view(h).count, view(h).done], [1, false], 'one tap alone must not reach 2');
  online(a);
  online(b);
  await converge([a, b]);

  for (const h of [ha, hb]) {
    assert.deepEqual([view(h).count, view(h).done], [2, true]);
    assert.deepEqual(h.today.value, { done: 1, planned: 1 });
  }
  const today = localDay(a.engine.now(), 0);
  let rows = [...(await serverRows(server, 'habits1', 'checkin')).values()];
  assert.equal(rows.length, 2);
  for (const row of rows) assert.deepEqual([row.habit, row.day, row.deleted ?? null], [id, today, null]);

  // Undo on A: the latest of the two, whichever device made it, and only that one.
  // Two taps in one millisecond tie: the app then takes the later id, and so must this.
  const latest = rows.toSorted((x, y) => (y.at as number) - (x.at as number) || ((x.id as string) < (y.id as string) ? 1 : -1))[0]!.id;
  ha.undo(id);
  await converge([a, b]);
  for (const h of [ha, hb]) assert.deepEqual([view(h).count, view(h).done], [1, false]);
  rows = [...(await serverRows(server, 'habits1', 'checkin')).values()];
  assert.deepEqual(rows.filter((row) => typeof row.deleted === 'number').map((row) => row.id), [latest]);
  ha.close();
  hb.close();
});

test('the streak after rest days and a miss reads the same on both devices, and as the streak rule says', async () => {
  const a = await account(server, 'habits2');
  const b = await signedIn(server, 'habits2');
  const [ha, hb] = [habitsOn(a), habitsOn(b)];
  const id = ha.add('walk', 127, 1)!;

  // Last week: Monday and Tuesday kept, Wednesday and Thursday rest, Friday a miss, the weekend
  // kept. This week: every day before today kept, today not yet.
  const now = a.engine.now();
  const today = localDay(now, 0);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const day = (back: number) => localDay(now - back * DAY, 0);
  const lastMonday = weekday + 7;
  const kept = [lastMonday, lastMonday - 1, lastMonday - 5, lastMonday - 6, ...Array.from({ length: weekday }, (_, i) => weekday - i)].map(day);
  kept.forEach((d, i) => a.engine.write('checkin', `past-${i}`, { habit: id, day: d, at: Date.parse(`${d}T09:00:00Z`) }));
  await converge([a, b]);

  const expect = streakWindow(today, kept, 127);
  assert.equal(expect.missed, true, 'the setup must hold a miss');
  assert.equal(expect.streak, 2 + weekday);
  const shown = (h: typeof ha) => {
    const v = h.list.value.find((habit) => habit.id === id)!;
    return { streak: v.streak, kept: v.kept, of: v.of, missed: v.missed };
  };
  assert.deepEqual(shown(ha), { streak: expect.streak, kept: expect.kept, of: expect.of, missed: true });
  assert.deepEqual(shown(hb), shown(ha));
  ha.close();
  hb.close();
});
