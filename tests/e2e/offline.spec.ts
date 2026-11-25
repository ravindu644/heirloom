// Laptops without a connection: ARCHITECTURE section 4's "both devices offline, each runs the
// timer", the real IndexedDB across a reload, and what the screen says meanwhile.
import { stats } from '../../client/src/core/stats.ts';
import type { Session } from '../../client/src/core/stats.ts';
import { serverRows, until } from '../sync/harness.ts';
import { accountWith, digits, go, onDisk, ready, server, sessionsWhen, signIn, statusLine, taskRow, timerOnDisk, username } from './app.ts';
import { expect, test } from './devices.ts';

const offlineWords = /^No connection\. .* safe on this laptop\.$/;

test('both laptops offline each run a lap; back online, both laps are kept, the newer timer holds, the overlap is marked and counted once', async ({ deviceA: a, deviceB: b }) => {
  const name = username('twooff');
  await accountWith(name, { work_ms: 6000, short_ms: 60000 });
  for (const d of [a, b]) {
    await signIn(d.page, name);
    await ready(d.page);
    await expect(digits(d.page)).toHaveText('00:06');
  }

  for (const d of [a, b]) await d.setOffline(true);
  for (const d of [a, b]) await expect(statusLine(d.page)).toHaveText('No connection. Your laps are safe on this laptop.');
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await a.page.waitForTimeout(1500);
  await b.page.getByRole('button', { name: 'Start lap 1' }).click();
  // Neither saw the other's lap: each runs its own, and each rings with nobody to tell.
  for (const d of [a, b]) {
    await expect(d.page.getByRole('button', { name: 'Start 1 min break' })).toBeVisible({ timeout: 10000 });
    await expect(d.page.getByText('First lap of the day.')).toBeVisible();
    await expect(statusLine(d.page)).toHaveText(offlineWords);
  }

  for (const d of [a, b]) await d.setOffline(false);
  const rows = (await sessionsWhen(name, (list) => list.length === 2)) as unknown as Session[];
  for (const d of [a, b]) await expect(d.page.getByText('2 laps today.')).toBeVisible({ timeout: 5000 });

  // Nothing lost: each laptop's lap is its own full rang row.
  expect(rows.map((row) => row.outcome)).toEqual(['rang', 'rang']);
  expect(new Set(rows.map((row) => row.device)).size).toBe(2);
  for (const row of rows) expect(row.ended - row.started).toBe(6000);

  // The timer cell is B's: its start came later.
  const [first, later] = [...rows].sort((x, y) => x.started - y.started);
  const timer = (await serverRows(server, name, 'timer')).get('current')?.state as { run: string };
  expect(timer.run).toBe(later!.id);

  // The "ran on two devices" mark, and the shared seconds counted once.
  const counted = stats(rows, 0);
  expect(counted.overlaps).toEqual([[first!.id, later!.id].sort()]);
  const day = Object.values(counted.days);
  expect(day).toHaveLength(1);
  expect(day[0]).toEqual({ focus_ms: later!.ended - first!.started, laps: 2 });
});

test('a reload with no connection still opens the app (PRODUCT: works fully offline)', async ({ deviceA: a }) => {
  const name = username('reload');
  await accountWith(name);
  await signIn(a.page, name);
  await ready(a.page);
  await a.setOffline(true);
  // The lap is safe once its transaction commits, a few ms after the tap. A reload sooner than
  // that is a tab closed mid-write, which no store survives; this test is about the page coming back.
  const onDisk = timerOnDisk(a.page);
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  const ms = await onDisk;
  test.info().annotations.push({ type: 'tap to IndexedDB', description: `${ms.toFixed(1)} ms` });
  console.log(`tap to the timer cell committed in IndexedDB: ${ms.toFixed(1)} ms`);
  await a.page.reload();
  await expect(a.page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(statusLine(a.page)).toHaveText('No connection. 1 change is safe on this laptop.');
});

test('a lap started offline is in IndexedDB: it survives a reload with the server out of reach, and reaches B after', async ({ deviceA: a, deviceB: b }) => {
  const name = username('idb');
  await accountWith(name);
  for (const d of [a, b]) {
    await signIn(d.page, name);
    await ready(d.page);
  }
  await a.setOffline(true);
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await a.page.waitForTimeout(2000);
  const before = await digits(a.page).textContent();

  // Nothing caches the page yet (the test above), so the page alone comes back for the reload:
  // every API request still fails and the socket is still refused, so what shows is the store's.
  await a.context.route('**/api/**', (route) => route.abort('internetdisconnected'));
  await a.context.setOffline(false);
  await a.page.reload();
  await expect(a.page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(statusLine(a.page)).toHaveText('No connection. 1 change is safe on this laptop.');
  const after = await digits(a.page).textContent();
  expect(after! <= before!, `${after} after the reload, ${before} before it`).toBe(true);
  expect(before! > '24:50' && after! > '24:45', `${before} before, ${after} after`).toBe(true);
  await ready(b.page);

  // The connection comes back for real; the browser says so with an `online` event.
  await a.context.unroute('**/api/**');
  await a.setOffline(true);
  await a.setOffline(false);
  await expect(b.page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 5000 });
  await expect(statusLine(a.page)).toHaveText('');
  const shownA = await digits(a.page).textContent();
  const shownB = await digits(b.page).textContent();
  const shownA2 = await digits(a.page).textContent();
  expect([shownA, shownA2]).toContain(shownB);
});

test('offline, the screen says so in the app\'s words, counts what waits, and nothing is lost when it returns', async ({ deviceA: a, deviceB: b }) => {
  const name = username('words');
  await accountWith(name);
  for (const d of [a, b]) {
    await signIn(d.page, name);
    await ready(d.page);
  }
  const status = statusLine(a.page);
  await expect(status).toHaveText('');
  await a.setOffline(true);
  await expect(status).toHaveText('No connection. Your laps are safe on this laptop.', { timeout: 2000 });
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await a.page.getByRole('button', { name: 'Pause' }).click();
  await expect(status).toHaveText('No connection. 1 change is safe on this laptop.');
  await ready(b.page);

  await a.setOffline(false);
  await expect(status).toHaveText('', { timeout: 5000 });
  await expect(b.page.getByRole('button', { name: 'Resume' })).toBeVisible();
});

test('the browser going offline is said on screen within a second, with no help from the rail', async ({ browser }) => {
  const name = username('offevent');
  await accountWith(name);
  // A device without the rail's socket switch: only the browser's own offline emulation and its `offline` event.
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, name);
  await ready(page);
  await expect(statusLine(page)).toHaveText('');

  const start = Date.now();
  await context.setOffline(true);
  await expect(statusLine(page)).toHaveText('No connection. Your laps are safe on this laptop.', { timeout: 1500 });
  const ms = Date.now() - start;
  test.info().annotations.push({ type: 'offline event to words', description: `${ms} ms` });
  console.log(`context.setOffline alone: "No connection" after ${ms} ms`);
  await context.close();
});

test('a socket that goes silent with no offline event is noticed within 35 s', async ({ deviceA: a }) => {
  test.setTimeout(60000);
  const name = username('silent');
  await accountWith(name);
  await signIn(a.page, name);
  await ready(a.page);
  await expect(statusLine(a.page)).toHaveText('');

  // Wi-Fi up, internet gone: the socket stays open, nothing arrives, and the browser says nothing.
  const start = Date.now();
  a.silence(true);
  await expect(statusLine(a.page)).toHaveText('No connection. Your laps are safe on this laptop.', { timeout: 40000 });
  const ms = Date.now() - start;
  // The worst case is a ping 25 s in and 10 s for its pong; a second more for the poll and the redraw.
  expect(ms).toBeLessThan(36000 + 1000);
  test.info().annotations.push({ type: 'silent socket noticed', description: `${ms} ms` });
  console.log(`silent socket: "No connection" after ${ms} ms`);

  // And it comes back by itself when frames flow again.
  a.silence(false);
  await expect(statusLine(a.page)).toHaveText('', { timeout: 35000 });
});

test('work done offline is still there after an offline reload once it is on disk: a task done, a rung lap, a check-in', async ({ deviceA: a }) => {
  const name = username('offwork');
  const node = await accountWith(name, { work_ms: 3000, short_ms: 60000 });
  node.engine.write('task', 't1', { title: 'chapter 5', estimate: 2, order: 'V' });
  node.engine.write('habit', 'read', { title: 'read 20 pages', days: 127, target: 1, order: 'V' });
  await until(() => node.engine.unsent.value === 0, 10000, 'not sent');
  await signIn(a.page, name);
  await ready(a.page);
  // The lengths arrive with everything else; going offline before they have would make a 25 minute lap.
  await expect(digits(a.page)).toHaveText('00:03');
  await a.setOffline(true);
  // A lap that rings with no connection: its row is written here.
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await expect(a.page.getByRole('button', { name: 'Start lap 2 now', exact: true })).toBeVisible({ timeout: 8000 });
  await onDisk(a.page, 'session/', 1);
  await go(a.page, 'Today');
  await a.page.getByRole('checkbox', { name: 'Done: chapter 5' }).click();
  await onDisk(a.page, 'task/t1/done');
  await go(a.page, 'Habits');
  await a.page.getByRole('checkbox', { name: 'Check in: read 20 pages', exact: true }).click();
  await onDisk(a.page, 'checkin/', 3);

  await a.page.reload();
  await expect(a.page.getByRole('checkbox', { name: 'Check in: read 20 pages', exact: true })).toHaveAttribute('aria-checked', 'true');
  await go(a.page, 'Today');
  await expect(a.page.getByRole('checkbox', { name: 'Done: chapter 5' })).toHaveAttribute('aria-checked', 'true');
  await expect(taskRow(a.page, 'chapter 5')).toContainText('1 of 2');
  await expect(statusLine(a.page)).toHaveText(/^No connection\. \d+ changes are safe on this laptop\.$/);
});
