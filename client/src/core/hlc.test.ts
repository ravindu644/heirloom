// What the contract fixtures do not pin about the clock.

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ZERO, stamp } from './hlc.ts';

it('a time with a fraction of a millisecond is floored, in the stamp and in the clock', () => {
  const first = stamp(ZERO, 1795494600000.75, 'a1b2c3d4e5f60718');
  assert.equal(first.stamp, '2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718');
  assert.deepEqual(first.clock, { ms: 1795494600000, counter: 0 });
  // The same millisecond again is the same millisecond: the counter goes up, the time does not.
  const second = stamp(first.clock, 1795494600000.9, 'a1b2c3d4e5f60718');
  assert.equal(second.stamp, '2026-11-24T04:30:00.000Z-0001-a1b2c3d4e5f60718');
});
