// One timer on two laptops, both online: what one does, the other shows, and the session rows the
// server ends up with (protocol sections 6 and 11).
import type { Page } from '@playwright/test';
import { accountWith, digits, lapLine, ready, sessions, sessionsWhen, signIn, startButton, startNow, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// Both signed in to one new account and showing the lap a tap would start, at the given length.
async function twoLaptops(a: Device, b: Device, tag: string, lengths: Parameters<typeof accountWith>[1] = {}) {
  const name = username(tag);
  await accountWith(name, lengths);
  for (const d of [a, b]) {
    await signIn(d.page, name);
    await ready(d.page);
    if (lengths.work_ms) await expect(digits(d.page)).toHaveText(`00:${String(lengths.work_ms / 1000).padStart(2, '0')}`);
  }
  return name;
}

// Read A, then B, then A: B must show one of A's two readings, so the second turned over together.
async function sameSecond(a: Page, b: Page) {
  const first = await digits(a).textContent();
  const other = await digits(b).textContent();
  const last = await digits(a).textContent();
  expect([first, last], `A showed ${first} then ${last}, B showed ${other}`).toContain(other);
}

// How long from the tap on one laptop until the other shows it. Fails past `ms`.
async function seen(t: typeof test, what: string, tap: () => Promise<void>, shows: () => Promise<void>) {
  const start = Date.now();
  await tap();
  await shows();
  const ms = Date.now() - start;
  t.info().annotations.push({ type: what, description: `${ms} ms` });
  console.log(`${what}: ${ms} ms`);
}

test('a lap started on A shows on B within a second; pause, resume and five more minutes go both ways', async ({ deviceA: a, deviceB: b }) => {
  await twoLaptops(a, b, 'live');
  const within = { timeout: 1000 };

  await seen(test, 'start on A, seen on B', () => startButton(a.page).click(), () => expect(button(b.page, 'Pause')).toBeVisible(within));
  // A plain lap: the line over the bar says nothing the digits do not.
  await expect(lapLine(b.page)).toHaveText('');
  await sameSecond(a.page, b.page);

  await seen(test, 'pause on B, seen on A', () => button(b.page, 'Pause').click(), () => expect(button(a.page, 'Resume')).toBeVisible(within));
  // Held: said under the digits only, and nothing over the bar.
  await expect(a.page.getByText(/^of \d\d:\d\d, paused since \d\d:\d\d$/).filter({ visible: true })).toBeVisible();
  await expect(lapLine(a.page)).toHaveText('');
  await sameSecond(a.page, b.page);

  await seen(test, 'resume on A, seen on B', () => button(a.page, 'Resume').click(), () => expect(button(b.page, 'Pause')).toBeVisible(within));

  await seen(
    test,
    'five more minutes on B, seen on A',
    () => button(b.page, '5 more minutes').click(),
    () => expect(a.page.getByText(/^of 30:00, ends at \d\d:\d\d$/)).toBeVisible(within),
  );
  await sameSecond(a.page, b.page);
});

test('a lap rings on both laptops, leaves one rang row, and the break started on B shows on A', async ({ deviceA: a, deviceB: b }) => {
  const name = await twoLaptops(a, b, 'rings', { work_ms: 4000, short_ms: 60000 });
  await startButton(a.page).click();
  for (const d of [a, b]) {
    await expect(button(d.page, 'Start 1 min break')).toBeVisible({ timeout: 8000 });
    await expect(lapLine(d.page)).toHaveText('');
    await expect(startNow(d.page)).toBeVisible();
  }
  // Both laptops were in step at the bell, so both may write the row: it must still be one.
  const [row] = await sessionsWhen(name, (rows) => rows.length > 0);
  await b.page.waitForTimeout(500);
  expect(await sessions(name)).toHaveLength(1);
  expect(row).toMatchObject({ kind: 'work', outcome: 'rang', planned_ms: 4000, paused_ms: 0 });
  expect((row!.ended as number) - (row!.started as number)).toBe(4000);

  await button(b.page, 'Start 1 min break').click();
  await expect(lapLine(a.page)).toHaveText('Short break', { timeout: 1000 });
  await expect(startNow(a.page)).toBeVisible();
  // A break is not stretched: the offer is for laps.
  for (const d of [a, b]) await expect(button(d.page, '5 more minutes')).toHaveCount(0);
});

test('a stop in the first minute is a start taken back: no row, and lap 1 is still next on both', async ({ deviceA: a, deviceB: b }) => {
  const name = await twoLaptops(a, b, 'short');
  await startButton(a.page).click();
  await expect(button(b.page, 'Pause')).toBeVisible();
  await button(a.page, 'Stop').click();
  // In the page twice, one copy display: none at any width (with the digits, or by the button on a phone).
  await expect(a.page.getByText('Stopped in its first minute. Not counted as a lap.').filter({ visible: true })).toBeVisible();
  // Protocol section 6: under 60000 ms of running it keeps its index, and section 11 writes no row.
  for (const d of [a, b]) await ready(d.page);
  await b.page.waitForTimeout(1000);
  expect(await sessions(name)).toEqual([]);
});

test('undo after a stop brings the lap back on both laptops, and it then rings as a full lap', async ({ deviceA: a, deviceB: b }) => {
  const name = await twoLaptops(a, b, 'undo', { work_ms: 8000, short_ms: 60000 });
  await startButton(a.page).click();
  await expect(button(b.page, 'Pause')).toBeVisible();
  await button(a.page, 'Stop').click();
  // Stopped in its first seconds: a start taken back, so lap 1 is next again.
  await ready(b.page);
  await button(a.page, 'Undo').click();
  for (const d of [a, b]) await expect(button(d.page, 'Pause')).toBeVisible({ timeout: 1000 });
  await sameSecond(a.page, b.page);

  for (const d of [a, b]) await expect(button(d.page, 'Start 1 min break')).toBeVisible({ timeout: 10000 });
  const rows = await sessionsWhen(name, (list) => list.some((row) => row.outcome === 'rang'));
  expect(rows).toHaveLength(1);
  // The seconds it spent stopped count as running: it is the whole lap, from the first start.
  expect(rows[0]).toMatchObject({ outcome: 'rang', planned_ms: 8000, paused_ms: 0 });
  expect((rows[0]!.ended as number) - (rows[0]!.started as number)).toBe(8000);
});
