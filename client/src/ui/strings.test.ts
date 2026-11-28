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
  assert.equal(focus.stopped(3, 12 * MIN + 59000), 'Lap 3 today stopped at 12 min.');
  assert.equal(focus.stopped(3, 59 * MIN), 'Lap 3 today stopped at 59 min.');
  assert.equal(focus.stopped(1, 280 * MIN), 'Lap 1 today stopped at 4h 40m.');
  assert.equal(focus.stopped(1, 120 * MIN), 'Lap 1 today stopped at 2h.');
  assert.equal(focus.stoppedAfter(2), 'Stopped after lap 2 today.');
  assert.equal(focus.stoppedAfter(0), "Stopped after yesterday's lap.");
});

test('a task in Estimates says the day it was done, so a repeating one done twice reads as two days', () => {
  assert.equal(progress.doneOn('2026-11-28', '2026-11-28'), 'today');
  assert.equal(progress.doneOn('2026-11-27', '2026-11-28'), 'yesterday');
  assert.equal(progress.doneOn('2026-11-25', '2026-11-28'), 'Wed');
  assert.equal(progress.doneOn('2026-11-12', '2026-11-28'), 'Thu 12 Nov');
  assert.equal(progress.guesses([{ ratio: 1.3 }]), 'This week: 1.3.');
});
