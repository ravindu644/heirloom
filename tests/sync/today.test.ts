// Today's day turns over by itself at local midnight (protocol section 12). In a browser the day
// comes from the engine's server time and the zone, so neither the page's clock nor its zone can
// bring midnight close; here the offset from UTC is handed in, and can put midnight 2 s away.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { localDay } from '../../client/src/core/stats.ts';
import { createToday } from '../../client/src/sync/today.ts';
import { account, startServer, stopAll, until } from './harness.ts';
import type { Server } from './harness.ts';

let server: Server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await stopAll();
  await server.stop();
});

const DAY = 86400000;

test('a task due tomorrow moves to Today by itself at local midnight', async () => {
  const d = await account(server, 'midnight');
  await until(() => d.engine.sync.value === 'in-step', 5000, 'the device did not come up');
  // An offset from UTC that puts this device 2 s before its local midnight. Real zones are whole
  // minutes; the arithmetic does not care.
  const now = d.engine.now();
  let offsetMs = DAY - (now % DAY) - 2000;
  if (offsetMs > DAY / 2) offsetMs -= DAY;
  const utcOffsetMin = offsetMs / 60000;
  let ids = 0;
  const today = createToday(d.engine, {
    utcOffsetMin: () => utcOffsetMin,
    id: () => `t${++ids}`,
    schedule: (run, ms) => {
      const t = setTimeout(run, ms);
      return () => clearTimeout(t);
    },
  });

  const first = today.day.value;
  // Through a function: an assert on `.value` would narrow it for the rest of the test.
  const next = () => today.next.value?.id ?? null;
  const tomorrow = localDay(now + DAY, utcOffsetMin);
  const id = today.add('revise ~2')!;
  today.edit(id, { due: tomorrow });
  assert.deepEqual(today.upcoming.value.map((t) => t.id), [id]);
  assert.equal(next(), null);

  await until(() => today.day.value !== first, 5000, `the day stayed ${first} past midnight`);
  assert.equal(today.day.value, tomorrow);
  assert.equal(next(), id);
  assert.deepEqual(today.upcoming.value, []);
  today.close();
  await d.engine.stop();
});
