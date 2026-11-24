// Proves the rail itself. If these fail, no "A sees what B did" test above them means anything.
import { expect, test } from './devices.ts';

test('one device goes offline and comes back without taking the other with it', async ({ deviceA, deviceB }) => {
  await deviceA.setOffline(true);
  await expect(deviceA.page.goto('/healthz')).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);

  const seenByB = await deviceB.page.goto('/healthz');
  expect(seenByB?.status()).toBe(200);
  expect(await seenByB?.json()).toMatchObject({ ok: true });

  await deviceA.setOffline(false);
  expect((await deviceA.page.goto('/healthz'))?.status()).toBe(200);
});

test('what one device stores, the others do not see', async ({ deviceA, deviceB, deviceC }) => {
  const devices = [deviceA, deviceB, deviceC];
  for (const d of devices) await d.page.goto('/healthz');
  await deviceA.page.evaluate(() => localStorage.setItem('e2e', 'written on A'));

  const read = (d: (typeof devices)[number]) => d.page.evaluate(() => localStorage.getItem('e2e'));
  expect(await Promise.all(devices.map(read))).toEqual(['written on A', null, null]);
});
