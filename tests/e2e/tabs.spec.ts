// Two tabs of one browser are one device with one database: only one may run the engine.
import { accountWith, digits, ready, signIn, username } from './app.ts';
import { expect, test } from './devices.ts';

test('a second tab says heirloom is open elsewhere and shows no timer; closing the first hands it the running lap', async ({ deviceA: a }) => {
  const name = username('tabs');
  await accountWith(name);
  await signIn(a.page, name);
  await ready(a.page);
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await expect(a.page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(a.page.getByRole('status')).toHaveText('');

  const second = await a.context.newPage();
  await second.goto('/');
  await expect(second.getByText('heirloom is open in another tab of this browser. Close that one and this one takes over by itself.')).toBeVisible();
  await expect(digits(second)).toHaveCount(0);
  await expect(second.getByRole('button')).toHaveCount(0);

  await a.page.close();
  await expect(second.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 5000 });
  await expect(second.getByText('Lap 1 of 4, focus')).toBeVisible();
  // Counting down, from the lap the first tab started: the clock rounds up, so it reads 25:00 for the first second.
  await expect(digits(second)).toHaveText(/^24:5\d$/, { timeout: 3000 });
});
