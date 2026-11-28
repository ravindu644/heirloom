import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clock, focus, progress, result, ring } from './strings.ts';

test('the long break is earned by four laps, and from the second of the day by four more', () => {
  assert.equal(result.set(4), 'Four laps. The long break is earned!');
  assert.equal(result.set(8), 'Four more laps. The long break is earned!');
  assert.equal(result.set(0), 'Four laps. The long break is earned!');
});

test('the countdown in the notification names the lap by the day when it is for no task', () => {
  assert.equal(ring.lapOn(null, 3, null), 'Lap 3 today');
  assert.equal(ring.lapOn('Essay', 2, 4), 'Lap 2, 4 estimated: Essay');
});

const MIN = 60000;

test('the clock reads minutes under 100 minutes and hours from there', () => {
  assert.equal(clock(25 * MIN), '25:00');
  assert.equal(clock(100 * MIN - 1000), '99:59');
  assert.equal(clock(100 * MIN), '1:40:00');
  assert.equal(clock(360 * MIN - 1000), '5:59:59');
  assert.equal(clock(360 * MIN), '6:00:00');
  // A second that has begun is still shown whole.
  assert.equal(clock(100 * MIN - 400), '1:40:00');
});

test('a stop says how far the lap ran as the clock says it, and a break after midnight follows the lap before it', () => {
  assert.equal(focus.stopped(3, 30000), 'Lap 3 today stopped in its first minute.');
  // To the nearest minute, as every duration is said.
  assert.equal(focus.stopped(3, 12 * MIN + 59000), 'Lap 3 today stopped at 13 min.');
  assert.equal(focus.stopped(3, 12 * MIN + 29000), 'Lap 3 today stopped at 12 min.');
  assert.equal(focus.stopped(3, 59 * MIN + 40000), 'Lap 3 today stopped at 1h.');
  assert.equal(focus.stopped(3, 59 * MIN), 'Lap 3 today stopped at 59 min.');
  assert.equal(focus.stopped(1, 280 * MIN), 'Lap 1 today stopped at 4h 40m.');
  assert.equal(focus.stopped(1, 120 * MIN), 'Lap 1 today stopped at 2h.');
  assert.equal(focus.stoppedAfter(2), 'Stopped after lap 2 today.');
  assert.equal(focus.stoppedAfter(0), "Stopped after yesterday's lap.");
});

test('a task in Estimates says the day it was done, so a repeating one done twice reads as two days', () => {
  assert.equal(progress.doneOn('2026-11-28', '2026-11-28'), 'today');
  assert.equal(progress.doneOn('2026-11-27', '2026-11-28'), 'yesterday');
  assert.equal(progress.doneOn('2026-11-25', '2026-11-28'), 'Wed 25 Nov');
  assert.equal(progress.doneOn('2026-11-12', '2026-11-28'), 'Thu 12 Nov');
  assert.equal(progress.guesses([{ ratio: 1.3 }]), 'This week: 1.3.');
});

test('setting a lap aside says what left which day, and the fold counts as the heading does', () => {
  assert.equal(progress.off(10 * 60000, '2026-11-24', '2026-11-24'), '10 minutes off today');
  // No zero parts: a lead part under a minute is said as the row says it, and an other day under a minute is left out.
  assert.equal(progress.off(20000, '2026-11-24', '2026-11-24', { ms: 30000, day: '2026-11-23' }), 'Under a minute off today');
  assert.equal(progress.off(32 * 60000, '2026-11-24', '2026-11-24', { ms: 14 * 60000, day: '2026-11-23' }), '32 minutes off today, 14 off Monday');
  assert.equal(progress.off(14 * 60000, '2026-11-23', '2026-11-24', { ms: 32 * 60000, day: '2026-11-24' }), '14 minutes off Monday, 32 off today');
  assert.equal(progress.earlier(4, 1, 75 * 60000), '4 earlier laps, 1 not counted, 1h 15m');
  assert.equal(progress.earlier(4, 0, 100 * 60000), '4 earlier laps, 1h 40m');
  assert.equal(progress.earlier(2, 2, 0), '2 earlier laps, 2 not counted');
  assert.equal(progress.focused(7, true, 'running'), 'focused today, in 7 laps, and one running');
});

test('a duration is said to the nearest minute: 46m55s is 47m everywhere; under a minute of a lap is said in words', () => {
  assert.equal(progress.total(46 * MIN + 55000), '47m');
  assert.equal(progress.total(46 * MIN + 29000), '46m');
  assert.equal(progress.total(59 * MIN + 30000), '1h');
  assert.equal(progress.off(46 * MIN + 55000, '2026-11-24', '2026-11-24'), '47 minutes off today');
  assert.equal(progress.off(40000, '2026-11-24', '2026-11-24'), 'Under a minute off today');
  assert.equal(focus.stopped(2, 40000), 'Lap 2 today stopped in its first minute.');
});

test('a lap row says its facts in one line, every count the difference of the times shown', () => {
  const t = (h: number, m: number) => new Date(2026, 10, 28, h, m).getTime();
  assert.equal(progress.facts({ from: t(11, 3), to: t(11, 19), mins: 16 }), '11:03 to 11:19, 16 minutes');
  assert.equal(progress.facts({ from: t(23, 46), to: t(0, 31), fromDay: '2026-11-27', mins: 45, part: 31 }), '23:46 Fri to 00:31, 31 of 45 minutes today');
  assert.equal(progress.facts({ from: t(23, 46), to: t(0, 31), toDay: '2026-11-29', mins: 45, part: 14, here: true }), '23:46 to 00:31 Sun, 14 of 45 minutes here');
  assert.equal(progress.facts({ from: t(15, 40), to: t(16, 5), mins: 25, already: 15, two: true }), '15:40 to 16:05, 25 minutes, 15 of them already counted, ran on two devices');
  assert.equal(progress.facts({ from: t(12, 40), to: t(12, 52), mins: 12, aside: true }), '12:40 to 12:52, 12 minutes, not counted');
  assert.equal(progress.facts({ from: t(11, 3), to: t(11, 19), mins: 16, done: true }), '11:03 to 11:19, 16 minutes. Task done.');
  assert.equal(progress.facts({ from: t(15, 48), to: null, mins: 8 }), '15:48 to now, 8 minutes');
  assert.equal(progress.facts({ from: t(15, 48), to: t(16, 2), paused: true, mins: 14 }), '15:48, paused at 16:02, 14 minutes');
  assert.equal(progress.facts({ from: t(23, 59), to: t(0, 1), fromDay: '2026-11-27', mins: 1, part: 1 }), '23:59 Fri to 00:01, 1 of 1 minute today');
});
