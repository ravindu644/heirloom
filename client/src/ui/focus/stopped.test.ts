import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stopSaid } from './stopped.ts';

const MIN = 60000;
const stop = { phase: 'work', task: null, ran_ms: 12 * MIN, counted: true } as const;

test('a stop is said from the record of it: numbered when counted, never when taken back', () => {
  assert.equal(stopSaid(stop, 3), 'Lap 3 today stopped at 12 min.');
  assert.equal(stopSaid({ ...stop, ran_ms: 20000, counted: false }, 2), 'Stopped in its first minute. Not counted as a lap.');
  // A lap is the day's it ended on: one begun before midnight and stopped after it is today's.
  assert.equal(stopSaid({ ...stop, ran_ms: 80 * MIN }, 1), 'Lap 1 today stopped at 1h 20m.');
  assert.equal(stopSaid(stop, 3, true), 'Stopped after lap 3 today.');
  assert.equal(stopSaid({ ...stop, phase: 'short' }, 3), 'Stopped after lap 3 today.');
  // A break that ran past midnight follows yesterday's lap: today has none yet.
  assert.equal(stopSaid({ ...stop, phase: 'long' }, 0), "Stopped after yesterday's lap.");
});
