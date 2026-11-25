import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stopSaid } from './stopped.ts';

const MIN = 60000;
// Noon, and noon the day before: a day apart in any time zone.
const now = new Date(2026, 10, 24, 12).getTime();
const stop = { phase: 'work', task: null, started: now - 12 * MIN, ran_ms: 12 * MIN, counted: true } as const;

test('a stop is said from the record of it: numbered when counted, never when taken back, and yesterday\'s as that', () => {
  assert.equal(stopSaid(stop, 3, now), 'Lap 3 today stopped at 12 min.');
  assert.equal(stopSaid({ ...stop, started: now - 20000, ran_ms: 20000, counted: false }, 2, now), 'Stopped in its first minute. Not counted as a lap.');
  assert.equal(stopSaid({ ...stop, started: now - 24 * 60 * MIN, ran_ms: 80 * MIN }, 0, now), "Yesterday's lap stopped at 1h 20m.");
  // Yesterday's even when today has laps of its own.
  assert.equal(stopSaid({ ...stop, started: now - 24 * 60 * MIN }, 2, now), "Yesterday's lap stopped at 12 min.");
  assert.equal(stopSaid(stop, 3, now, true), 'Stopped after lap 3 today.');
  assert.equal(stopSaid({ ...stop, phase: 'short' }, 3, now), 'Stopped after lap 3 today.');
  assert.equal(stopSaid({ ...stop, phase: 'long' }, 0, now), "Stopped after yesterday's lap.");
});
