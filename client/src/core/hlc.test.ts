// What the contract fixtures do not pin about the clock.

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ZERO, follows, stamp } from './hlc.ts';

it('a time with a fraction of a millisecond is floored, in the stamp and in the clock', () => {
  const first = stamp(ZERO, 1795494600000.75, 'a1b2c3d4e5f60718');
  assert.equal(first.stamp, '2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718');
  assert.deepEqual(first.clock, { ms: 1795494600000, counter: 0 });
  // The same millisecond again is the same millisecond: the counter goes up, the time does not.
  const second = stamp(first.clock, 1795494600000.9, 'a1b2c3d4e5f60718');
  assert.equal(second.stamp, '2026-11-24T04:30:00.000Z-0001-a1b2c3d4e5f60718');
});

it('follows: the very next stamp the same device made, and nothing else', () => {
  const at = (counter: string, device = 'a1b2c3d4e5f60718', time = '2026-11-24T04:30:00.000Z') => `${time}-${counter}-${device}`;
  assert.equal(follows(at('0004'), at('0005')), true);
  assert.equal(follows(at('00ff'), at('0100')), true);
  assert.equal(follows(at('0004'), at('0004')), false, 'the same stamp');
  assert.equal(follows(at('0004'), at('0006')), false, 'one was made in between');
  assert.equal(follows(at('0005'), at('0004')), false, 'the other way round');
  assert.equal(follows(at('0004'), at('0005', 'b2c3d4e5f6071829')), false, 'another device');
  assert.equal(follows(at('0004'), at('0005', 'a1b2c3d4e5f60718', '2026-11-24T04:30:00.001Z')), false, 'another millisecond');
  assert.equal(follows(at('0004'), at('0000', 'a1b2c3d4e5f60718', '2026-11-24T04:30:00.001Z')), false, 'the next millisecond, with room left on the counter: another reading of the clock');
});

it('follows across a full counter: the stamp after ffff is the first of the next millisecond, and that is still the very next one', () => {
  const full = { ms: 1795494600000, counter: 0xfffe };
  const a = stamp(full, 1795494600000, 'a1b2c3d4e5f60718');
  const b = stamp(a.clock, 1795494600000, 'a1b2c3d4e5f60718');
  assert.deepEqual([a.stamp, b.stamp], ['2026-11-24T04:30:00.000Z-ffff-a1b2c3d4e5f60718', '2026-11-24T04:30:00.001Z-0000-a1b2c3d4e5f60718']);
  assert.equal(follows(a.stamp, b.stamp), true);
  assert.equal(follows(a.stamp, '2026-11-24T04:30:00.001Z-0001-a1b2c3d4e5f60718'), false);
  assert.equal(follows(a.stamp, '2026-11-24T04:30:00.002Z-0000-a1b2c3d4e5f60718'), false);
  assert.equal(follows(a.stamp, '2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718'), false);
});
