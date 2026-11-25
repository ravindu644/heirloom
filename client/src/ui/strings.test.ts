import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clock, focus } from './strings.ts';

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

test('a lap is counted by the day, against the target where there is one', () => {
  assert.equal(focus.lap(3, 5), 'Lap 3 of 5 today');
  assert.equal(focus.lap(5, 5), 'Lap 5 of 5 today');
  assert.equal(focus.lap(6, 5), 'Lap 6 today, past your target of 5');
  assert.equal(focus.lap(3, 0), 'Lap 3 today');
});

test('a stop says how far the lap ran as the clock says it, and a lap from yesterday has no number', () => {
  assert.equal(focus.stopped(3, 30000), 'Lap 3 today stopped in its first minute.');
  assert.equal(focus.stopped(3, 12 * MIN + 59000), 'Lap 3 today stopped at 12 min.');
  assert.equal(focus.stopped(3, 59 * MIN), 'Lap 3 today stopped at 59 min.');
  assert.equal(focus.stopped(1, 280 * MIN), 'Lap 1 today stopped at 4h 40m.');
  assert.equal(focus.stopped(1, 120 * MIN), 'Lap 1 today stopped at 2h.');
  assert.equal(focus.stopped(0, 80 * MIN), "Yesterday's lap stopped at 1h 20m.");
  assert.equal(focus.stoppedAfter(2), 'Stopped after lap 2 today.');
  assert.equal(focus.stoppedAfter(0), "Stopped after yesterday's lap.");
  assert.equal(focus.breakAfter(5 * MIN, false), '5 min break after');
  assert.equal(focus.breakAfter(15 * MIN, true), '15 min long break after');
});
