// Progress on the real engine, with days made by hand: see world.ts for the devices.
// "Now" is 10:00 on Tuesday 2026-11-24 in Sri Lanka unless a test moves the clock. The Monday of
// this week is the 23rd, and of last week the 16th.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cell } from '../core/merge.ts';
import { eventStamp } from '../core/hlc.ts';
import { projectShares } from '../core/progress.ts';
import { race } from '../core/stats.ts';
import type { Session } from '../core/stats.ts';
import { T0 } from './fakes.ts';
import { LAP, MIN, OFFSET, world } from './world.ts';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type World = ReturnType<typeof world>;
type Device = Awaited<ReturnType<World['device']>>;

// A moment on a local day: at('2026-11-17', 9, 50) is ten to ten that morning.
const at = (day: string, hour: number, minute = 0) => Date.parse(day) - OFFSET * MIN + hour * HOUR + minute * MIN;

let made = 0;
// One session row. A lap of 25 minutes that rang, unless told otherwise.
function lap(d: Device, day: string, hour: number, minute = 0, over: Record<string, unknown> = {}) {
  const started = at(day, hour, minute);
  const id = (over.id as string | undefined) ?? `s${++made}`;
  const row = { kind: 'work', task: null, started, ended: started + LAP, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: d.engine.device, ...over };
  delete (row as { id?: unknown }).id;
  d.engine.write('session', id, row);
  return id;
}
// `count` laps back to back on a day, from six in the morning.
const laps = (d: Device, day: string, count: number) => {
  for (let n = 0; n < count; n++) lap(d, day, 6, n * 25);
};
// A lap stopped after `minutes`.
const stopped = (d: Device, day: string, hour: number, minute: number, minutes: number, over: Record<string, unknown> = {}) =>
  lap(d, day, hour, minute, { ended: at(day, hour, minute) + minutes * MIN, outcome: 'stopped', ...over });

async function one() {
  const w = world();
  const d = await w.device('a');
  return { w, d, p: d.progress };
}

describe('this week against last week', () => {
  // Last week: two laps on Monday; on Tuesday 09:00 to 09:25 and 09:50 to 10:15; one on Wednesday.
  // So by Tuesday 10:00 the ghost had 50 + 35 minutes, and 125 by the end of its week.
  function lastWeek(d: Device) {
    laps(d, '2026-11-16', 2);
    lap(d, '2026-11-17', 9, 0);
    lap(d, '2026-11-17', 9, 50);
    lap(d, '2026-11-18', 14);
  }

  it('behind at the same weekday and time', async () => {
    const { d, p } = await one();
    lastWeek(d);
    laps(d, '2026-11-23', 1);
    lap(d, '2026-11-24', 9, 0);
    const week = p.week();
    assert.equal(week.monday, '2026-11-23');
    assert.equal(week.you_ms, 50 * MIN);
    assert.equal(week.ghost_now_ms, 85 * MIN);
    assert.equal(week.ghost_total_ms, 125 * MIN);
    assert.equal(week.split_ms, -35 * MIN);
  });

  it('level: the same minutes by the same moment', async () => {
    const { d, p } = await one();
    lastWeek(d);
    laps(d, '2026-11-23', 2);
    lap(d, '2026-11-24', 9, 0);
    stopped(d, '2026-11-24', 9, 50, 10);
    assert.equal(p.week().you_ms, 85 * MIN);
    assert.equal(p.week().split_ms, 0);
  });

  it('ahead, with the lap in progress counted and the ghost moving on with the clock', async () => {
    const { w, d, p } = await one();
    lastWeek(d);
    laps(d, '2026-11-23', 3);
    lap(d, '2026-11-24', 9, 0);
    d.focus.start();
    w.time.advance(5 * MIN);
    // 10:05: the ghost was 15 minutes into its second Tuesday lap.
    assert.deepEqual(p.week(), {
      monday: '2026-11-23',
      days: [
        { day: '2026-11-23', you_ms: 75 * MIN, ghost_ms: 50 * MIN },
        { day: '2026-11-24', you_ms: 105 * MIN, ghost_ms: 100 * MIN },
        { day: '2026-11-25', you_ms: null, ghost_ms: 125 * MIN },
        { day: '2026-11-26', you_ms: null, ghost_ms: 125 * MIN },
        { day: '2026-11-27', you_ms: null, ghost_ms: 125 * MIN },
        { day: '2026-11-28', you_ms: null, ghost_ms: 125 * MIN },
        { day: '2026-11-29', you_ms: null, ghost_ms: 125 * MIN },
      ],
      you_ms: 105 * MIN,
      ghost_now_ms: 90 * MIN,
      ghost_total_ms: 125 * MIN,
      split_ms: 15 * MIN,
    });
  });

  it('a Monday with nothing yet: you are at 0, and the ghost only has what it had by this time last Monday', async () => {
    const { w, d, p } = await one();
    lap(d, '2026-11-23', 9, 45);
    lap(d, '2026-11-24', 11);
    // On to the next Monday, 10:00.
    w.time.advance(6 * DAY);
    const week = p.week();
    assert.equal(week.monday, '2026-11-30');
    assert.deepEqual(week.days[0], { day: '2026-11-30', you_ms: 0, ghost_ms: 25 * MIN });
    assert.deepEqual(week.days.slice(1).map((day) => day.you_ms), [null, null, null, null, null, null]);
    assert.equal(week.you_ms, 0);
    assert.equal(week.ghost_now_ms, 15 * MIN);
    assert.equal(week.ghost_total_ms, 50 * MIN);
    assert.equal(week.split_ms, -15 * MIN);
  });

  it('last week empty: there is nobody to be ahead of, so no split', async () => {
    const { d, p } = await one();
    lap(d, '2026-11-09', 9);
    lap(d, '2026-11-23', 9);
    const week = p.week();
    assert.equal(week.you_ms, 25 * MIN);
    assert.equal(week.ghost_total_ms, 0);
    assert.equal(week.ghost_now_ms, 0);
    assert.equal(week.split_ms, null);
  });

  it('minutes two devices ran at once count once in the week, and a lap set aside not at all', async () => {
    const { d, p } = await one();
    lap(d, '2026-11-23', 9, 0);
    lap(d, '2026-11-23', 9, 10, { device: 'b2c3d4e5f6071829' });
    lap(d, '2026-11-23', 11, 0, { outcome: 'void' });
    assert.equal(p.week().you_ms, 35 * MIN);
  });
});

describe('the year and since the first lap', () => {
  it('a cell\'s level at 0, 1, 3, 4, 6, 7, 8 and 9 laps, and a day whose one lap was stopped has a lap', async () => {
    const { d, p } = await one();
    const counts = [1, 0, 3, 4, 6, 7, 8, 9];
    counts.forEach((count, n) => laps(d, `2026-11-${10 + n}`, count));
    stopped(d, '2026-11-18', 9, 0, 12);
    const cells = p.since.value.cells;
    assert.equal(p.since.value.first, '2026-11-10');
    assert.equal(cells.length, 15, 'one cell a day from the first to today');
    assert.deepEqual(cells.slice(0, 9).map((cell) => [cell.day.slice(8), cell.laps, cell.level]), [
      ['10', 1, 1], ['11', 0, 0], ['12', 3, 1], ['13', 4, 2], ['14', 6, 2], ['15', 7, 3], ['16', 8, 3], ['17', 9, 4], ['18', 1, 1],
    ]);
    assert.equal(cells[8]!.focus_ms, 12 * MIN);
    assert.equal(cells[14]!.day, '2026-11-24');
    assert.equal(cells[14]!.level, 0);
  });

  it('rest days carry the rest mark in the cells; a miss does not', async () => {
    const { d, p } = await one();
    // Monday the 16th kept, then three empty days, then Friday kept.
    for (const day of ['2026-11-16', '2026-11-20', '2026-11-23']) laps(d, day, 1);
    const cells = new Map(p.since.value.cells.map((cell) => [cell.day, cell.rest]));
    assert.deepEqual(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map((day) => cells.get(day)), [true, true, false, false]);
  });

  it('totals, and days kept counted as the streak counts them: to yesterday while today has no lap', async () => {
    const { d, p } = await one();
    laps(d, '2026-11-20', 2);
    stopped(d, '2026-11-21', 9, 0, 10);
    laps(d, '2026-11-23', 1);
    const since = p.since.value;
    assert.equal(since.focus_ms, 85 * MIN);
    assert.equal(since.laps, 4, 'the stopped lap is a lap');
    assert.deepEqual([since.kept, since.of], [2, 4], 'the 20th to the 23rd; the stopped day has a lap and is not kept: a day is earned at a bell');
    // The 20th to today as dots: the 21st, with its stopped lap, is a rest day and not a kept one.
    assert.deepEqual(p.streak.value.recent.slice(-5).map((dot) => dot.state), ['kept', 'rest', 'rest', 'kept', 'open']);
    laps(d, '2026-11-24', 1);
    assert.deepEqual([p.since.value.kept, p.since.value.of], [3, 5]);
  });

  it('a session from a clock that died, or with a time no date can be, is not read: the year does not start in 1970 and nothing throws', async () => {
    const { d, p } = await one();
    laps(d, '2026-11-23', 1);
    const row = { kind: 'work', task: null, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: d.engine.device };
    d.engine.write('session', 'dead-clock', { ...row, started: 0, ended: LAP });
    d.engine.write('session', 'no-such-time', { ...row, started: 1e20, ended: 1e20 + LAP });
    d.engine.write('session', 'not-a-number', { ...row, started: 'yesterday', ended: T0 });
    assert.equal(p.since.value.first, '2026-11-23');
    assert.equal(p.since.value.cells.length, 2);
    assert.equal(p.since.value.laps, 1);
    assert.equal(p.week().you_ms, LAP);
    assert.equal(d.focus.race().you_ms, 0);
    assert.equal(p.timeline('1970-01-01').length, 0);
    assert.equal(d.engine.rows('session').value.size, 4, 'kept and sent on, only not counted');
  });

  it('before any session there is nothing: no first day, no cells, no steadiest weekday', async () => {
    const { p } = await one();
    assert.deepEqual(p.since.value, { first: null, focus_ms: 0, laps: 0, kept: 0, of: 0, steadiest: null, cells: [] });
    assert.deepEqual(p.bests.value, { day: null, week: null });
    assert.deepEqual(p.streak.value.recent.map((dot) => dot.state), [...Array(13).fill('empty'), 'open']);
  });

  it('the steadiest weekday: the highest share, a tie to the one kept more often, then to the earlier', async () => {
    const { d, p } = await one();
    // From Monday the 2nd to yesterday: four Mondays, three of every other weekday.
    // Mondays 3 of 4. Tuesdays and Thursdays 3 of 3. Fridays 2 of 3.
    for (const day of ['02', '09', '23', '03', '10', '17', '05', '12', '19', '06', '13']) laps(d, `2026-11-${day}`, 1);
    assert.deepEqual(p.since.value.steadiest, { weekday: 1, kept: 3, of: 3 }, 'Tuesday and Thursday tie on everything: the earlier');
    // The missing Monday: now 4 of 4, the same share as Tuesday, kept more often.
    laps(d, '2026-11-16', 1);
    assert.deepEqual(p.since.value.steadiest, { weekday: 0, kept: 4, of: 4 });
  });

  it('the steadiest weekday on a tied share is the one kept more often, even when it is the later weekday', async () => {
    const { d, p } = await one();
    // From Tuesday the 3rd to today, a Tuesday with a lap: four Tuesdays kept, and three Mondays kept.
    for (const day of ['03', '10', '17', '24', '09', '16', '23']) laps(d, `2026-11-${day}`, 1);
    assert.deepEqual(p.since.value.steadiest, { weekday: 1, kept: 4, of: 4 });
  });

  it('no steadiest weekday until one has come round three times', async () => {
    const { d, p } = await one();
    for (const day of ['10', '11', '12', '17', '18', '19', '20', '21', '22', '23']) laps(d, `2026-11-${day}`, 1);
    // Two weeks: only Tuesday the 10th, 17th... and today is not counted yet.
    assert.equal(p.since.value.steadiest, null);
    laps(d, '2026-11-24', 1);
    assert.deepEqual(p.since.value.steadiest, { weekday: 1, kept: 3, of: 3 });
  });
});

describe('the streak', () => {
  // Week of the 9th: kept Mon, Tue, Thu, Sun; Wed and Fri are rest days, Saturday is a miss.
  // Week of the 16th: kept all but Saturday, a rest day. Then Monday the 23rd kept.
  async function threeWeeks() {
    const all = await one();
    for (const day of ['09', '10', '12', '15', '16', '17', '18', '19', '20', '22', '23']) laps(all.d, `2026-11-${day}`, 1);
    return all;
  }

  it('kept of, across a miss: the run since the miss, and the days kept of the days so far', async () => {
    const { p } = await threeWeeks();
    const s = p.streak.value;
    assert.equal(s.streak, 8, 'the 15th to the 23rd, less the rest day');
    assert.deepEqual([s.kept, s.of], [11, 15]);
    assert.equal(s.missed, true);
  });

  it('the last 14 days as dots: kept, rest, the miss, and today open until it has a lap', async () => {
    const { d, p } = await threeWeeks();
    assert.deepEqual(p.streak.value.recent.map((dot) => `${dot.day.slice(8)} ${dot.state}`), [
      '11 rest', '12 kept', '13 rest', '14 empty', '15 kept', '16 kept', '17 kept', '18 kept', '19 kept', '20 kept', '21 rest', '22 kept', '23 kept', '24 open',
    ]);
    laps(d, '2026-11-24', 1);
    const s = p.streak.value;
    assert.equal(s.recent.at(-1)!.state, 'kept');
    assert.equal(s.streak, 9);
    assert.deepEqual([s.kept, s.of], [12, 16]);
  });

  it('rest days alone are not a miss', async () => {
    const { d, p } = await one();
    for (const day of ['16', '17', '19', '21', '22', '23']) laps(d, `2026-11-${day}`, 1);
    const s = p.streak.value;
    assert.equal(s.missed, false);
    assert.equal(s.streak, 6);
    assert.deepEqual([s.kept, s.of], [6, 8]);
  });

  it('a miss more than 45 days back is behind the window: kept of looks only that far', async () => {
    const { w, d, p } = await one();
    // A lone lap, then weeks of nothing, then every day for the 45 days up to yesterday.
    laps(d, '2026-09-01', 1);
    for (let n = 45; n >= 1; n--) laps(d, new Date(T0 + OFFSET * MIN - n * DAY).toISOString().slice(0, 10), 1);
    const s = p.streak.value;
    assert.deepEqual([s.kept, s.of], [45, 45]);
    assert.equal(s.missed, false);
    assert.equal(s.streak, 45);
    void w;
  });

  it('the streak follows the pinned rest days in settings, and says which they are', async () => {
    const { d, p } = await one();
    // Week of the 16th: Tuesday, Wednesday and Sunday empty. Unpinned, Sunday is the third: a miss.
    for (const day of ['16', '19', '20', '21', '23']) laps(d, `2026-11-${day}`, 1);
    const dots = () => p.streak.value.recent.slice(5, 12).map((dot) => `${dot.day.slice(8)} ${dot.state}`);
    assert.deepEqual([p.streak.value.streak, p.streak.value.pinned], [1, []]);
    // Sunday pinned holds one place, so Tuesday rests and Wednesday is the miss.
    d.settings.set({ rest_days: 64 });
    assert.deepEqual([p.streak.value.streak, p.streak.value.pinned], [4, [6]]);
    assert.deepEqual(dots(), ['16 kept', '17 rest', '18 empty', '19 kept', '20 kept', '21 kept', '22 rest']);
    assert.deepEqual(p.since.value.cells.filter((c) => c.rest).map((c) => c.day), ['2026-11-17', '2026-11-22']);
    // Every day set reads as Monday and Tuesday: Monday was kept, so its place goes back to the week.
    d.settings.set({ rest_days: 127 });
    assert.deepEqual([p.streak.value.streak, p.streak.value.pinned], [1, [0, 1]]);
    assert.deepEqual(dots(), ['16 kept', '17 rest', '18 rest', '19 kept', '20 kept', '21 kept', '22 empty']);
  });

  it('at local midnight the streak moves on by itself: yesterday\'s open day is empty, the new day is open', async () => {
    const { w, d, p } = await one();
    laps(d, '2026-11-23', 1);
    let changes = 0;
    const stop = p.streak.subscribe(() => changes++);
    assert.equal(p.streak.value.recent.at(-1)!.day, '2026-11-24');
    w.time.advance(14 * HOUR);
    assert.deepEqual(p.streak.value.recent.slice(-2), [{ day: '2026-11-24', state: 'rest' }, { day: '2026-11-25', state: 'open' }]);
    assert.equal(changes, 2);
    stop();
  });

  it('wake() after a sleep over midnight: the day is right at once', async () => {
    const { w, d, p } = await one();
    laps(d, '2026-11-23', 1);
    assert.equal(p.streak.value.recent.at(-1)!.day, '2026-11-24');
    w.time.jump(20 * HOUR);
    assert.equal(p.streak.value.recent.at(-1)!.day, '2026-11-24', 'still yesterday: no timer ran');
    p.wake();
    assert.equal(p.streak.value.recent.at(-1)!.day, '2026-11-25');
    assert.equal(p.since.value.cells.at(-1)!.day, '2026-11-25');
    assert.equal(p.lookBack().day, '2026-11-25');
  });
});

describe('bests', () => {
  it('the day and the week with the most focus, the earlier one on a tie; today and this week may be it', async () => {
    const { d, p } = await one();
    laps(d, '2026-11-03', 3);
    laps(d, '2026-11-12', 3);
    laps(d, '2026-11-13', 1);
    // Two weeks of 100 minutes: the 2nd to the 8th, and the 9th to the 15th.
    laps(d, '2026-11-05', 1);
    assert.deepEqual(p.bests.value, {
      day: { day: '2026-11-03', focus_ms: 75 * MIN },
      week: { monday: '2026-11-02', focus_ms: 100 * MIN },
    });
    laps(d, '2026-11-23', 2);
    laps(d, '2026-11-24', 4);
    assert.deepEqual(p.bests.value, {
      day: { day: '2026-11-24', focus_ms: 100 * MIN },
      week: { monday: '2026-11-23', focus_ms: 150 * MIN },
    });
  });
});

describe('by project', () => {
  it('this week\'s time and laps per project, the week before beside it, and no project for the rest', async () => {
    const { w, d, p } = await one();
    const c = d.today.addProject('The C book', 'you')!;
    const react = d.today.addProject('React', 'rest')!;
    const old = d.today.addProject('Only last week', 'ink')!;
    const never = d.today.addProject('Nothing in either week', 'ghost')!;
    const task = (title: string, project: string | null) => {
      const id = d.today.add(title)!;
      d.today.edit(id, { project });
      return id;
    };
    const [pointers, hooks, thesis, loose, stale] = [task('pointers', c), task('hooks', react), task('thesis', old), task('loose', null), task('stale', never)];

    // Today and the six days before: the 18th to the 24th.
    lap(d, '2026-11-18', 9, 0, { task: pointers });
    lap(d, '2026-11-20', 9, 0, { task: pointers });
    stopped(d, '2026-11-20', 10, 0, 10, { task: pointers });
    lap(d, '2026-11-22', 9, 0, { task: hooks });
    lap(d, '2026-11-23', 9, 0, { task: loose });
    lap(d, '2026-11-23', 10, 0);
    lap(d, '2026-11-23', 11, 0, { task: 'a-task-this-device-never-heard-of' });
    // The seven days before those: the 11th to the 17th.
    lap(d, '2026-11-11', 9, 0, { task: pointers });
    lap(d, '2026-11-17', 9, 0, { task: thesis });
    lap(d, '2026-11-17', 10, 0, { task: thesis });
    // Older than both windows.
    lap(d, '2026-11-10', 9, 0, { task: stale });
    lap(d, '2026-11-10', 10, 0, { task: hooks });
    // In the window, but set aside: it counts for no project, so that project is still left out.
    lap(d, '2026-11-21', 9, 0, { task: stale, outcome: 'void' });

    assert.deepEqual(p.projects(), [
      { project: null, focus_ms: 75 * MIN, laps: 3, before_ms: 0, all_ms: 75 * MIN },
      // Two laps that rang and one stopped after ten minutes: three laps.
      { project: { id: c, name: 'The C book', color: 'you' }, focus_ms: 60 * MIN, laps: 3, before_ms: 25 * MIN, all_ms: 85 * MIN },
      // All time reaches back past both windows: the lap on the 10th is in it.
      { project: { id: react, name: 'React', color: 'rest' }, focus_ms: 25 * MIN, laps: 1, before_ms: 0, all_ms: 50 * MIN },
      { project: { id: old, name: 'Only last week', color: 'ink' }, focus_ms: 0, laps: 0, before_ms: 50 * MIN, all_ms: 50 * MIN },
    ]);
    // "Nothing in either week" has a lap, long ago. Its all-time figure is not 0, and it is still left out of this list.
    assert.equal(p.projects().some((share) => share.project?.id === never), false);

    // A lap in progress on a task counts under its project as it runs.
    d.focus.start(hooks);
    w.time.advance(10 * MIN);
    const running = p.projects().find((share) => share.project?.id === react)!;
    assert.deepEqual([running.focus_ms, running.all_ms], [35 * MIN, 60 * MIN], 'in this week and in all time alike');
    assert.equal(running.laps, 1, 'its minutes count as it runs; it is a lap when it ends');
    // Its row is written at the bell: the figure does not jump or count the lap twice.
    w.time.advance(15 * MIN);
    assert.equal(p.projects().find((share) => share.project?.id === react)!.all_ms, 75 * MIN);
    assert.equal(p.projects().find((share) => share.project?.id === react)!.laps, 2);
    // Five more minutes on the lap, two of them run: the row of its first bell is not counted on top of the lap itself.
    w.time.advance(MIN);
    d.focus.extend();
    w.time.advance(2 * MIN);
    assert.equal(p.projects().find((share) => share.project?.id === react)!.all_ms, 78 * MIN);
    d.focus.stop();
    // The task moves to another project, and its time goes with it.
    d.today.edit(hooks, { project: c });
    assert.equal(p.projects().find((share) => share.project?.id === c)!.all_ms, 163 * MIN);
    assert.equal(p.projects().some((share) => share.project?.id === react), false);
  });
});

describe('by project, the rule alone', () => {
  it('sessions older than the fourteen days count in neither window, whoever hands them over', () => {
    const session = (id: string, day: string, project: string): Session & { project: string } => ({
      id, kind: 'work', task: null, started: at(day, 9), ended: at(day, 9, 25), planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: 'a1b2c3d4e5f60718', project,
    });
    const all = [session('s1', '2026-11-24', 'c'), session('s2', '2026-11-12', 'c'), session('s3', '2026-11-10', 'c'), session('s4', '2026-11-10', 'old'), session('s5', '2026-11-25', 'c')];
    assert.deepEqual(projectShares(all, (s) => (s as (typeof all)[number]).project, '2026-11-24', OFFSET), [
      { project: 'c', focus_ms: LAP, laps: 1, before_ms: LAP },
    ]);
  });
});

describe('estimates', () => {
  it('one task over and one under: laps run for each lap guessed, and the tasks newest first', async () => {
    const { w, d, p } = await one();
    const add = (line: string) => d.today.add(line)!;
    const [over, under, noGuess, gone, open] = [add('over ~2'), add('under ~4'), add('no guess'), add('gone ~3'), add('still open ~5')];
    for (const [task, count] of [[over, 3], [under, 2], [noGuess, 1], [gone, 3], [open, 1]] as const) {
      for (let n = 0; n < count; n++) lap(d, '2026-11-23', 6 + n, 0, { task });
    }
    d.today.setDone(over, true);
    w.time.advance(MIN);
    d.today.setDone(under, true);
    d.today.setDone(noGuess, true);
    d.today.setDone(gone, true);
    d.today.remove(gone);
    assert.deepEqual(p.estimates.value, {
      ratio: 5 / 6,
      tasks: [
        { id: under, title: 'under', estimate: 4, laps: 2 },
        { id: over, title: 'over', estimate: 2, laps: 3 },
      ],
      weeks: [...['10-05', '10-12', '10-19', '10-26', '11-02', '11-09', '11-16'].map((monday) => ({ monday: `2026-${monday}`, ratio: null })), { monday: '2026-11-23', ratio: 5 / 6 }],
    });
  });

  it('the laps run are the laps the task shows: one stopped early is one of them, one not counted is not', async () => {
    const { d, p } = await one();
    const task = d.today.add('pointers ~2')!;
    lap(d, '2026-11-23', 6, 0, { task });
    stopped(d, '2026-11-23', 7, 0, 10, { task });
    stopped(d, '2026-11-23', 8, 0, 1, { task });
    lap(d, '2026-11-23', 9, 0, { task, outcome: 'void' });
    d.today.setDone(task, true);
    assert.equal(p.estimates.value.ratio, 3 / 2);
    assert.deepEqual(p.estimates.value.tasks, [{ id: task, title: 'pointers', estimate: 2, laps: 3 }]);
    assert.deepEqual(p.lookBack().done, [{ id: task, title: 'pointers', estimate: 2, laps: 3 }]);
  });

  it('no task done with an estimate: no ratio', async () => {
    const { d, p } = await one();
    d.today.setDone(d.today.add('no guess')!, true);
    assert.deepEqual([p.estimates.value.ratio, p.estimates.value.tasks], [null, []]);
    assert.deepEqual(p.estimates.value.weeks.map((week) => week.ratio), Array(8).fill(null));
  });

  it('accuracy over time: the last eight weeks, oldest first, each its own ratio, and none for a week with no such task', async () => {
    const { d, p } = await one();
    let n = 0;
    // A task done on a day, with its guess and the laps it took.
    const done = (day: string, estimate: number | null, laps: number, over: object = {}) => {
      const id = `t${++n}`;
      d.engine.write('task', id, { title: id, estimate, done: at(day, 18), ...over });
      for (let k = 0; k < laps; k++) lap(d, day, 8 + k, 0, { task: id });
      return id;
    };
    done('2026-09-25', 1, 3);                           // nine weeks back: before the eight
    done('2026-10-05', 2, 1);                           // the first of the eight, its Monday
    done('2026-10-11', 2, 2);                           // the same week, its Sunday
    done('2026-10-12', 1, 1);                           // the Monday after: the next week, not this one
    done('2026-11-10', 2, 4);                           // the week of the 9th: twice the guess
    done('2026-11-12', null, 5);                        // no estimate: not counted
    done('2026-11-13', 1, 9, { deleted: T0 });          // deleted: not counted
    done('2026-11-24', 4, 2);                           // this week: half the guess
    assert.deepEqual(p.estimates.value.weeks, [
      { monday: '2026-10-05', ratio: 3 / 4 },
      { monday: '2026-10-12', ratio: 1 },
      { monday: '2026-10-19', ratio: null },
      { monday: '2026-10-26', ratio: null },
      { monday: '2026-11-02', ratio: null },
      { monday: '2026-11-09', ratio: 2 },
      { monday: '2026-11-16', ratio: null },
      { monday: '2026-11-23', ratio: 0.5 },
    ]);
    // The one ratio above them is still the last 28 days: the 27th of October on.
    assert.equal(p.estimates.value.ratio, 6 / 6);
  });

  it('only the last 28 days are looked at, and only the eight done most recently are listed', async () => {
    const { w, d, p } = await one();
    const old = d.today.add('a month ago ~1')!;
    lap(d, '2026-11-24', 6, 0, { task: old });
    lap(d, '2026-11-24', 7, 0, { task: old });
    d.today.setDone(old, true);
    w.time.advance(27 * DAY);
    assert.equal(p.estimates.value.ratio, 2);
    w.time.advance(DAY);
    assert.equal(p.estimates.value.ratio, null);
    for (let n = 1; n <= 9; n++) {
      d.today.setDone(d.today.add(`task ${n} ~1`)!, true);
      w.time.advance(MIN);
    }
    assert.deepEqual(p.estimates.value.tasks.map((t) => t.title), ['task 9', 'task 8', 'task 7', 'task 6', 'task 5', 'task 4', 'task 3', 'task 2']);
    assert.equal(p.estimates.value.ratio, 0);
  });
});

describe('a day\'s timeline', () => {
  // A morning: a lap on a task, its break, a lap set aside, and a lap another device was running at the same time as the fourth.
  async function morning() {
    const all = await one();
    const { d } = all;
    const project = d.today.addProject('The C book', 'you')!;
    const task = d.today.add('pointers')!;
    d.today.edit(task, { project });
    const first = lap(d, '2026-11-23', 9, 0, { task });
    const rest = lap(d, '2026-11-23', 9, 25, { kind: 'short', ended: at('2026-11-23', 9, 30), planned_ms: 5 * MIN });
    const aside = lap(d, '2026-11-23', 9, 30, { outcome: 'void', ended: at('2026-11-23', 9, 40) });
    const here = lap(d, '2026-11-23', 10, 0, { paused_ms: 5 * MIN, ended: at('2026-11-23', 10, 30) });
    const there = stopped(d, '2026-11-23', 10, 20, 15, { device: 'b2c3d4e5f6071829' });
    lap(d, '2026-11-22', 9, 0);
    return { ...all, project, task, ids: { first, rest, aside, here, there } };
  }

  it('every session whose time touches the day, oldest first: the break and the lap set aside are in it, and the pair is marked', async () => {
    const { p, project, task, ids } = await morning();
    const view = { id: project, name: 'The C book', color: 'you' };
    assert.deepEqual(p.timeline('2026-11-23'), [
      { id: ids.first, kind: 'work', outcome: 'rang', started: at('2026-11-23', 9), ended: at('2026-11-23', 9, 25), ran_ms: LAP, task: { id: task, title: 'pointers' }, project: view, overlap: false, row: 0 },
      { id: ids.rest, kind: 'short', outcome: 'rang', started: at('2026-11-23', 9, 25), ended: at('2026-11-23', 9, 30), ran_ms: 5 * MIN, task: null, project: null, overlap: false, row: 0 },
      { id: ids.aside, kind: 'work', outcome: 'void', started: at('2026-11-23', 9, 30), ended: at('2026-11-23', 9, 40), ran_ms: 10 * MIN, task: null, project: null, overlap: false, row: 0 },
      { id: ids.here, kind: 'work', outcome: 'rang', started: at('2026-11-23', 10), ended: at('2026-11-23', 10, 30), ran_ms: LAP, task: null, project: null, overlap: true, row: 0 },
      { id: ids.there, kind: 'work', outcome: 'stopped', started: at('2026-11-23', 10, 20), ended: at('2026-11-23', 10, 35), ran_ms: 15 * MIN, task: null, project: null, overlap: true, row: 1 },
    ]);
    assert.equal(p.timeline('2026-11-22').length, 1);
    assert.deepEqual(p.timeline('2026-11-21'), []);
  });

  it('a lap across midnight: its minutes on both days, the lap on the day it rang, and in both days\' timelines', async () => {
    const { w, d, p } = await one();
    // 23:46 on Monday to 00:32 on Tuesday, then a lap begun at 23:50 last night still running at 00:10 on Wednesday.
    const late = lap(d, '2026-11-23', 23, 46, { ended: at('2026-11-24', 0, 32), planned_ms: 46 * MIN });
    const cells = () => p.since.value.cells.map((cell) => [cell.day, cell.focus_ms, cell.laps]);
    assert.deepEqual(cells(), [['2026-11-23', 14 * MIN, 0], ['2026-11-24', 32 * MIN, 1]]);
    assert.deepEqual([p.lookBack().focus_ms, p.lookBack().laps, d.focus.lapsToday()], [32 * MIN, 1, 1]);
    assert.deepEqual(p.timeline('2026-11-23').map((entry) => entry.id), [late]);
    assert.deepEqual(p.timeline('2026-11-24').map((entry) => entry.id), [late]);
    // Monday's 14 minutes are in the week once, and Tuesday's 32.
    assert.equal(p.week().you_ms, 46 * MIN);

    // The lap in progress, begun at 23:50 on Tuesday, is Wednesday's from midnight on and drawn in both days.
    w.time.advance(at('2026-11-24', 23, 50) - d.engine.now());
    d.focus.start();
    w.time.advance(20 * MIN);
    const run = d.focus.state.value.run;
    assert.deepEqual([p.lookBack().day, p.lookBack().focus_ms, p.lookBack().laps], ['2026-11-25', 10 * MIN, 0]);
    assert.deepEqual(p.timeline('2026-11-25').map((entry) => [entry.id, entry.live]), [[run, 'running']]);
    assert.deepEqual(p.timeline('2026-11-24').map((entry) => entry.id), [late, run]);
    // At its bell at 00:15, a lap of Wednesday's; Tuesday keeps its ten minutes and its one lap.
    w.time.advance(5 * MIN);
    await d.settle();
    assert.deepEqual(cells().slice(-2), [['2026-11-24', 42 * MIN, 1], ['2026-11-25', 15 * MIN, 1]]);
    assert.equal(d.focus.lapsToday(), 1);
  });

  it('a lap stays in its day when its task is deleted; the task is named while it is in Recently deleted, and not once it is gone for good', async () => {
    const { w, d, p } = await one();
    const task = d.today.add('pointers ~1')!;
    lap(d, '2026-11-23', 9, 0, { task });
    const named = () => p.timeline('2026-11-23').map((entry) => entry.task?.title ?? null);
    d.today.setDone(task, true);
    assert.deepEqual(named(), ['pointers']);
    d.today.remove(task);
    assert.deepEqual(named(), ['pointers'], 'still to be found, and brought back');
    assert.deepEqual(p.lookBack().done, []);
    d.today.purge(task);
    assert.deepEqual(named(), [null]);
    assert.equal(p.timeline('2026-11-23').length, 1, 'the lap itself is the day\'s, and stays');
    assert.equal(p.since.value.laps, 1);
    assert.equal(p.estimates.value.ratio, null);
    assert.deepEqual(p.lookBack().done, []);
    void w;
  });

  it('a task deleted while its lap runs: the lap goes on, named with its project in the day until the task is gone for good; its minutes stay in the day and the project', async () => {
    const { w, d, p } = await one();
    const programming = d.today.addProject('Programming', 'you')!;
    const view = { id: programming, name: 'Programming', color: 'you' };
    const task = d.today.add('Q/A heirloom')!;
    d.today.edit(task, { project: programming });
    const share = () => p.projects().find((s) => s.project?.id === programming);
    const loose = () => p.projects().find((s) => s.project === null);
    const day = () => p.timeline('2026-11-24').map((e) => ({ task: e.task?.title ?? null, project: e.project?.id ?? null, ran: e.ran_ms, live: e.live ?? null }));

    d.focus.start(task);
    w.time.advance(5 * MIN);
    d.today.remove(task);
    w.time.advance(15 * MIN);
    // (a) Running: the lap is the task's still, on every screen that names it.
    assert.equal(d.focus.state.value.task, task, 'the delete leaves the lap as it is');
    // Not one of today's open tasks now: the strip names the lap from the task's own row (ui/today/today.tsx).
    assert.equal(d.today.running.value, null);
    assert.deepEqual([share()?.focus_ms, share()?.all_ms], [20 * MIN, 20 * MIN]);
    assert.equal(loose(), undefined, 'none of it is for no project');
    assert.equal(p.week().you_ms, 20 * MIN);
    assert.deepEqual(day(), [{ task: 'Q/A heirloom', project: programming, ran: 20 * MIN, live: 'running' }], 'the day has the lap as far as it has run');
    // Paused, it says so and ends where it stopped.
    d.focus.pause();
    w.time.advance(3 * MIN);
    assert.deepEqual(day(), [{ task: 'Q/A heirloom', project: programming, ran: 20 * MIN, live: 'paused' }]);
    d.focus.resume();

    // (b) Stopped: its row names the task, and the minutes are the project's.
    d.focus.stop();
    assert.deepEqual(day(), [{ task: 'Q/A heirloom', project: programming, ran: 20 * MIN, live: null }]);
    assert.deepEqual(share(), { project: view, focus_ms: 20 * MIN, laps: 1, before_ms: 0, all_ms: 20 * MIN });
    assert.equal(loose(), undefined);

    // Gone for good: named by nothing, task or project, and the minutes are still the day's, the week's and the project's.
    d.today.purge(task);
    assert.deepEqual(day(), [{ task: null, project: null, ran: 20 * MIN, live: null }]);
    assert.equal(p.week().you_ms, 20 * MIN);
    assert.deepEqual(share(), { project: view, focus_ms: 20 * MIN, laps: 1, before_ms: 0, all_ms: 20 * MIN });
    assert.equal(loose(), undefined);
  });

  it('a lap past its bell with no row yet, on a device offline with another device\'s timer, is in the day as rang, ending at its bell', async () => {
    const { w, d: a } = await one();
    const b = await w.device('b');
    a.focus.start();
    await a.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(LAP + MIN);
    assert.deepEqual(
      b.progress.timeline('2026-11-24').map((e) => [e.outcome, e.ran_ms, e.live]),
      [['rang', LAP, 'rang']],
    );
  });

  it('a lap that overlaps one two starts further on is still marked: a long lap here, a short one here, and one elsewhere', async () => {
    const { d, p } = await one();
    const long = lap(d, '2026-11-23', 9, 0, { ended: at('2026-11-23', 9, 40), planned_ms: 40 * MIN });
    const short = stopped(d, '2026-11-23', 9, 5, 5);
    const elsewhere = stopped(d, '2026-11-23', 9, 20, 10, { device: 'b2c3d4e5f6071829' });
    assert.deepEqual(p.timeline('2026-11-23').map((entry) => [entry.id, entry.overlap]), [[long, true], [short, false], [elsewhere, true]]);
    assert.deepEqual(p.timeline('2026-11-23').map((entry) => entry.row), [0, 0, 1], 'the first to start is on row 0, the one that began during it on row 1');
  });

  it('a second pair later in the day starts on row 0 again, and a chain of three alternates', async () => {
    const { d, p } = await one();
    const other = { device: 'b2c3d4e5f6071829' };
    // 09:00 here, 09:10 there, 09:30 here again while the other still runs; then a pair in the afternoon.
    lap(d, '2026-11-23', 9, 0);
    lap(d, '2026-11-23', 9, 10, { ...other, ended: at('2026-11-23', 9, 50), planned_ms: 40 * MIN });
    lap(d, '2026-11-23', 9, 30);
    lap(d, '2026-11-23', 14, 0, other);
    lap(d, '2026-11-23', 14, 5);
    assert.deepEqual(p.timeline('2026-11-23').map((entry) => [entry.overlap, entry.row]), [[true, 0], [true, 1], [true, 0], [true, 0], [true, 1]]);
  });

  it('setting aside one of an overlapping pair is the way out: the mark goes from both, and the minutes are no longer counted once too few', async () => {
    const { p, ids } = await morning();
    const focus = () => p.since.value.cells.find((cell) => cell.day === '2026-11-23')!.focus_ms;
    // 09:00 to 09:25, then 10:05 to 10:35 with the two as one stretch.
    assert.equal(focus(), 55 * MIN);
    p.setAside(ids.there);
    assert.deepEqual(p.timeline('2026-11-23').slice(-2).map((entry) => [entry.outcome, entry.overlap]), [['rang', false], ['void', false]]);
    assert.equal(focus(), 50 * MIN);
  });

  it('set aside then count again: a lap that rang is rang again, a stopped one stopped, each one write of one cell', async () => {
    const { d, p, ids } = await morning();
    const outcome = (id: string) => d.engine.rows('session').value.get(id)?.outcome;
    for (const [id, was] of [[ids.first, 'rang'], [ids.there, 'stopped'], [ids.here, 'rang']] as const) {
      const before = d.engine.cells().length;
      const stamps = () => d.engine.cells().filter((c) => c.row === id).map((c) => c.stamp);
      const untouched = stamps();
      p.setAside(id);
      assert.equal(outcome(id), 'void');
      assert.equal(stamps().filter((stamp, i) => stamp !== untouched[i]).length, 1, 'one cell written');
      p.countAgain(id);
      assert.equal(outcome(id), was, 'a paused lap that ran its whole plan rang');
      assert.equal(d.engine.cells().length, before);
    }
  });

  it('a lap set aside before its bell and counted again is stopped; a break, or a lap that is already what it is, is left alone', async () => {
    const { d, p, ids } = await morning();
    p.countAgain(ids.aside);
    assert.equal(d.engine.rows('session').value.get(ids.aside)?.outcome, 'stopped');
    // Thirty minutes on the clock, ten of them paused: twenty of a twenty-five minute plan were run.
    const paused = lap(d, '2026-11-22', 14, 0, { paused_ms: 10 * MIN, ended: at('2026-11-22', 14, 30), outcome: 'void' });
    p.countAgain(paused);
    assert.equal(d.engine.rows('session').value.get(paused)?.outcome, 'stopped', 'pauses are not running time');
    const cells = d.engine.cells();
    p.setAside(ids.rest);
    p.countAgain(ids.first);
    p.setAside('nobody');
    p.countAgain('nobody');
    assert.deepEqual(d.engine.cells(), cells);
  });
});

describe('the look back', () => {
  it('today\'s focus and laps with the lap in progress, the tasks done today in order, and the note', async () => {
    const { w, d, p } = await one();
    const [first, second] = [d.today.add('pointers ~2')!, d.today.add('arrays')!];
    d.today.add('still open');
    lap(d, '2026-11-24', 8, 0, { task: first });
    lap(d, '2026-11-24', 8, 30, { task: first });
    lap(d, '2026-11-23', 8, 0, { task: second });
    d.today.setDone(second, true);
    w.time.advance(MIN);
    d.today.setDone(first, true);
    p.setNote('2026-11-24', '  Pointers finally clicked.  ');
    d.focus.start();
    w.time.advance(9 * MIN);
    assert.deepEqual(p.lookBack(), {
      day: '2026-11-24',
      focus_ms: 59 * MIN,
      laps: 2,
      done: [
        { id: second, title: 'arrays', estimate: null, laps: 1 },
        { id: first, title: 'pointers', estimate: 2, laps: 2 },
      ],
      note: 'Pointers finally clicked.',
    });
  });

  it('any day\'s note can be read, and `today` is the local day as a signal', async () => {
    const { w, p } = await one();
    assert.equal(p.today.value, '2026-11-24');
    assert.equal(p.note('2026-11-20'), '');
    p.setNote('2026-11-20', 'The day pointers made sense.');
    assert.equal(p.note('2026-11-20'), 'The day pointers made sense.');
    assert.equal(p.note('2026-11-24'), '');
    w.time.advance(14 * HOUR);
    assert.equal(p.today.value, '2026-11-25');
  });

  it('the note is the day row\'s: empty is an empty string, a long one is cut at 280, and what is not a day is not written', async () => {
    const { d, p } = await one();
    assert.equal(p.lookBack().note, '');
    p.setNote('2026-11-24', 'x'.repeat(300));
    assert.equal(p.lookBack().note.length, 280);
    p.setNote('2026-11-24', '');
    assert.deepEqual(d.engine.rows('day').value.get('2026-11-24'), { id: '2026-11-24', note: '' });
    p.setNote('tomorrow', 'no');
    assert.equal(d.engine.rows('day').value.size, 1);
  });

  it('two devices write the same day\'s note offline: the later one stands on both, and nothing breaks', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    a.disconnect();
    b.disconnect();
    a.progress.setNote('2026-11-24', 'written on the phone');
    w.time.advance(MIN);
    b.progress.setNote('2026-11-24', 'written on the laptop, later');
    w.exchange(a, b);
    assert.equal(a.progress.lookBack().note, 'written on the laptop, later');
    assert.equal(b.progress.lookBack().note, 'written on the laptop, later');
    assert.deepEqual(w.sorted(a.engine), w.sorted(b.engine));
    // A day row is a dataset the server has never heard of: it is pushed like any other.
    await a.connect();
    assert.equal(a.engine.unsent.value, 0);
  });
});

describe('keeping the work down', () => {
  // Two years of use: 3,000 laps, arriving from the server in one go.
  function history(d: Device): Cell[] {
    const cells: Cell[] = [];
    for (let n = 0; n < 3000; n++) {
      const started = T0 - (n + 1) * 5 * HOUR;
      const row = { kind: 'work', task: null, started, ended: started + LAP, planned_ms: LAP, paused_ms: 0, outcome: 'rang', device: d.engine.device };
      for (const [field, value] of Object.entries(row)) cells.push({ stamp: eventStamp(started, d.engine.device), dataset: 'session', row: `h${n}`, field, value });
    }
    return cells;
  }

  it('the history is worked through once for all four signals, and again only when a session changed and someone is reading', async () => {
    const { w, d, p } = await one();
    d.receive(history(d));
    assert.equal(p.recomputed(), 0, 'nobody has looked yet');
    assert.equal(p.since.value.laps, 3000);
    void p.streak.value;
    void p.bests.value;
    void p.estimates.value;
    void p.week();
    void p.timeline('2026-11-23');
    assert.equal(p.recomputed(), 1);

    // Typing a task's title, forty keystrokes, with the Progress screen reading after each.
    const task = d.today.add('p')!;
    for (let n = 0; n < 40; n++) {
      d.today.edit(task, { title: `pointers chapter ${n}` });
      void p.since.value;
      void p.streak.value;
      void p.estimates.value;
    }
    // Starting, pausing and running a lap, read on every tick.
    d.focus.start(task);
    for (let n = 0; n < 60; n++) {
      w.time.advance(1000);
      void p.week();
      void p.projects();
      void p.lookBack();
      void p.since.value;
    }
    d.focus.pause();
    d.today.setTarget(8);
    p.setNote('2026-11-24', 'a note');
    void p.since.value;
    assert.equal(p.recomputed(), 1, 'none of that touched a session row');

    // A session row changes while nobody reads: nothing is worked out until someone does.
    d.focus.stop();
    lap(d, '2026-11-24', 8);
    lap(d, '2026-11-24', 9);
    assert.equal(p.recomputed(), 1);
    assert.equal(p.since.value.laps, 3003, 'the two written here, and the lap that was stopped');
    void p.streak.value;
    void p.bests.value;
    assert.equal(p.recomputed(), 2);

    // Midnight changes the day, not the sessions.
    w.time.advance(DAY);
    void p.since.value;
    void p.streak.value;
    assert.equal(p.recomputed(), 2);
  });

  it('the race on a tick reads two days of sessions, and says exactly what the rule says over all of them', async () => {
    const { w, d } = await one();
    const all = () => [...d.engine.rows('session').value.values()] as unknown as Session[];
    const whole = () => race(all(), d.focus.state.value, d.engine.now(), OFFSET);
    // No lap last Tuesday: the ghost is the latest day before today that has focus.
    lap(d, '2026-11-10', 9, 0);
    lap(d, '2026-11-21', 9, 30);
    // A day with only a lap set aside is nobody's ghost, though it is the latest day there is.
    lap(d, '2026-11-22', 11, 0, { outcome: 'void' });
    lap(d, '2026-11-24', 8, 0);
    d.focus.start();
    w.time.advance(7 * MIN);
    assert.equal(d.focus.race().ghost?.day, '2026-11-21');
    assert.deepEqual(d.focus.race(), whole());
    // A lap last Tuesday: now that day is the ghost.
    lap(d, '2026-11-17', 9, 50);
    assert.equal(d.focus.race().ghost?.day, '2026-11-17');
    assert.deepEqual(d.focus.race(), whole());
    assert.deepEqual(d.today.figures().ghost, { day: '2026-11-17', total_ms: LAP, laps: 1 });
  });

  it('close() leaves no timer waiting', async () => {
    const { w, d, p } = await one();
    void p.streak.value;
    d.close();
    assert.equal(w.time.waiting(), 0);
  });
});
