// Habits (protocol section 14) through the screen, on the real engine and server.
import type { Page } from '@playwright/test';
import { streakWindow } from '../../client/src/core/streak.ts';
import { localDay } from '../../client/src/core/stats.ts';
import { serverRows, until } from '../sync/harness.ts';
import { accountWith, go, onDisk, ready, server, signIn, statusLine, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

const OFF = -new Date().getTimezoneOffset();
const DAY = 86400000;
const today = () => localDay(Date.now(), OFF);
const longDay = () => new Date(`${today()}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');

async function onHabits(devices: Device[], tag: string) {
  const name = username(tag);
  const node = await accountWith(name);
  for (const d of devices) {
    await signIn(d.page, name);
    await ready(d.page);
    await go(d.page, 'Habits');
    await expect(d.page.getByLabel('Add a habit', { exact: true })).toBeVisible();
    // The eyebrow names the day, with habits or without.
    await expect(d.page.getByText(`Habits, ${longDay()}`, { exact: true })).toBeVisible();
  }
  return { name, node };
}

const add = async (page: Page, title: string) => {
  const box = page.getByLabel('Add a habit', { exact: true });
  await box.pressSequentially(title);
  await box.press('Enter');
  await expect(box_(page, title)).toBeVisible();
};
const box_ = (page: Page, title: string) => page.getByRole('checkbox', { name: `Check in: ${title}`, exact: true });
const row = (page: Page, title: string) => box_(page, title).locator('xpath=..');
const open = async (page: Page, title: string) => {
  await row(page, title).getByRole('button', { name: new RegExp(title) }).click();
  // Exact: a closed "Archived habits" sheet is still sliding out for a moment.
  const sheet = page.getByRole('dialog', { name: 'Habit', exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
};
const said = (page: Page, about: string) => page.getByRole('status').filter({ hasText: about }).innerText().then((t) => t.replace(/\s+/g, ' ').trim());
const titles = (page: Page) => page.getByRole('checkbox', { name: /^Check in: / }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!.slice('Check in: '.length)));

test('a habit added by the quick line, checked in on A, shows on B within a second; the heading counts it', async ({ deviceA: a, deviceB: b }) => {
  await onHabits([a, b], 'hquick');
  await expect(a.page.getByRole('heading', { level: 1 })).toHaveText('No habits yet.');
  await expect(a.page.getByText('Add the first thing you want to do most days. One tap a day checks it in.')).toBeVisible();
  await add(a.page, 'read 20 pages');
  await expect(row(a.page, 'read 20 pages')).toContainText('Every day');
  await expect(box_(b.page, 'read 20 pages')).toBeVisible();
  await expect(a.page.getByRole('heading', { level: 1 })).toHaveText('0 of 1 today. One left.');

  const start = Date.now();
  await box_(a.page, 'read 20 pages').click();
  await expect(box_(b.page, 'read 20 pages')).toHaveAttribute('aria-checked', 'true', { timeout: 1000 });
  console.log(`check-in on A, seen on B: ${Date.now() - start} ms`);
  for (const d of [a, b]) await expect(d.page.getByRole('heading', { level: 1 })).toHaveText(/^1 of 1 today\./);
  await expect.poll(() => said(a.page, 'Checked in')).toBe('Checked in: read 20 pages. Undo');
});

test('a target of 3 counts up one tap at a time; on a done day the box takes the latest back', async ({ deviceA: a }) => {
  await onHabits([a], 'htarget');
  await add(a.page, 'water');
  const sheet = await open(a.page, 'water');
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'One time more', exact: true }).click();
  await expect(sheet).toContainText('3 times a day');
  await sheet.getByRole('button', { name: 'Close' }).click();

  for (const n of [1, 2, 3]) {
    await box_(a.page, 'water').click();
    await expect(row(a.page, 'water')).toContainText(`${n} of 3`);
  }
  await expect(box_(a.page, 'water')).toHaveAttribute('aria-checked', 'true');
  await box_(a.page, 'water').click();
  await expect(row(a.page, 'water')).toContainText('2 of 3');
  await expect(box_(a.page, 'water')).toHaveAttribute('aria-checked', 'false');
});

test('two laptops offline check in the same habit: both kept, and together they reach a target of 2', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await onHabits([a, b], 'hoffline');
  await add(a.page, 'stretch');
  const sheet = await open(a.page, 'stretch');
  await sheet.getByRole('button', { name: 'One time more', exact: true }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(row(b.page, 'stretch')).toContainText('0 of 2');

  for (const d of [a, b]) await d.setOffline(true);
  for (const d of [a, b]) {
    await expect(statusLine(d.page)).toHaveText(/^No connection/);
    await box_(d.page, 'stretch').click();
    await expect(row(d.page, 'stretch')).toContainText('1 of 2');
  }
  for (const d of [a, b]) await d.setOffline(false);
  for (const d of [a, b]) {
    await expect(row(d.page, 'stretch')).toContainText('2 of 2', { timeout: 5000 });
    await expect(box_(d.page, 'stretch')).toHaveAttribute('aria-checked', 'true');
  }
  const rows = [...(await serverRows(server, name, 'checkin')).values()];
  expect(rows.filter((r) => r.day === today() && !r.deleted)).toHaveLength(2);
});

test('a weekdays-only habit shows the weekend as not planned, and its run is a run, never a miss', async ({ deviceA: a }) => {
  const name = username('hweekdays');
  const node = await accountWith(name);
  node.engine.write('habit', 'walk', { title: 'walk', days: 31, target: 1, order: 'V' });
  // Every weekday of the last three weeks before today, and no weekend day.
  const kept: string[] = [];
  for (let back = 21; back >= 1; back--) {
    const d = localDay(Date.now() - back * DAY, OFF);
    if ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7 < 5) kept.push(d);
  }
  kept.forEach((d, i) => node.engine.write('checkin', `w${i}`, { habit: 'walk', day: d, at: Date.parse(`${d}T09:00:00Z`) }));
  await until(() => node.engine.unsent.value === 0, 10000, 'not sent');
  await signIn(a.page, name);
  await ready(a.page);
  await go(a.page, 'Habits');
  await expect(a.page.getByText(`Habits, ${longDay()}`, { exact: true })).toBeVisible();

  const rule = streakWindow(today(), kept, 31);
  expect(rule.missed).toBe(false);
  await expect(row(a.page, 'walk')).toContainText(`Weekdays, ${rule.streak} days running`);
  await expect(row(a.page, 'walk')).not.toContainText('planned days');
  // The week: Saturday and Sunday are not planned, and are drawn as such.
  const week = row(a.page, 'walk').locator('[role="img"] > span');
  await expect(week).toHaveCount(7);
  for (const i of [5, 6]) expect(await week.nth(i).locator('i').getAttribute('class')).toMatch(/off/);
  for (const i of [0, 1, 2, 3, 4]) expect((await week.nth(i).locator('i').getAttribute('class')) ?? '').not.toMatch(/off/);
});

test('order, archive and restore, delete with Undo, and Recently deleted; B keeps up', async ({ deviceA: a, deviceB: b }) => {
  await onHabits([a, b], 'hshelf');
  for (const t of ['alpha', 'bravo', 'charlie']) await add(a.page, t);
  await expect.poll(() => titles(b.page)).toEqual(['alpha', 'bravo', 'charlie']);
  // No mode: Alt and up moves the habit with the focus. (Press and hold is in second-hour.spec.ts.)
  await row(a.page, 'charlie').getByRole('button', { name: /charlie/ }).focus();
  await a.page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => titles(b.page), { timeout: 1000 }).toEqual(['alpha', 'charlie', 'bravo']);

  let sheet = await open(a.page, 'bravo');
  await sheet.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect.poll(() => said(a.page, 'bravo')).toBe('Archived: bravo. Undo');
  await expect(box_(b.page, 'bravo')).toHaveCount(0);
  await a.page.getByRole('status').filter({ hasText: 'bravo' }).getByRole('button', { name: 'Undo' }).click();
  await expect(box_(b.page, 'bravo')).toBeVisible();
  sheet = await open(a.page, 'bravo');
  await sheet.getByRole('button', { name: 'Archive', exact: true }).click();
  await a.page.getByRole('button', { name: 'Archived, 1' }).click();
  const shelf = a.page.getByRole('dialog', { name: 'Archived habits' });
  await expect(shelf).toContainText('An archived habit keeps its record and asks for nothing.');
  await shelf.getByRole('button', { name: 'Restore' }).click();
  // A list that opened as a sheet closes with its last row.
  await expect(shelf).toBeHidden();
  await expect(box_(b.page, 'bravo')).toBeVisible();

  sheet = await open(a.page, 'alpha');
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => said(a.page, 'alpha')).toBe('Deleted: alpha. It keeps for 30 days. Undo');
  await a.page.getByRole('status').filter({ hasText: 'alpha' }).getByRole('button', { name: 'Undo' }).click();
  await expect(box_(a.page, 'alpha')).toBeVisible();
  sheet = await open(a.page, 'alpha');
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(box_(b.page, 'alpha')).toHaveCount(0);
  await a.page.getByRole('button', { name: 'Recently deleted, 1' }).click();
  const bin = a.page.getByRole('dialog', { name: 'Recently deleted' });
  await expect(bin).toContainText('A deleted habit keeps for 30 days, then it is gone for good.');
  await bin.getByRole('button', { name: 'Restore' }).click();
  await expect(bin).toBeHidden();
  await expect(box_(b.page, 'alpha')).toBeVisible();
});

test('the sheet saves as typed, B shows it, and a reload with no connection keeps everything', async ({ deviceA: a, deviceB: b }) => {
  await onHabits([a, b], 'hsheet');
  await add(a.page, 'piano');
  let sheet = await open(a.page, 'piano');
  const title = sheet.getByLabel('Its name', { exact: true });
  await title.press('ControlOrMeta+a');
  await title.pressSequentially('  piano scales  ');
  await expect(title).toHaveValue('  piano scales  ');
  // Weekends off: Saturday and Sunday unpressed.
  for (const day of ['Sat', 'Sun']) await sheet.getByRole('button', { name: day, exact: true }).click();
  await sheet.getByLabel('Reminder', { exact: true }).fill('07:30');
  await sheet.getByRole('button', { name: 'Close' }).click();

  await expect(row(a.page, 'piano scales')).toContainText('Weekdays');
  await expect(row(b.page, 'piano scales')).toContainText('Weekdays');
  sheet = await open(b.page, 'piano scales');
  await expect(sheet.getByLabel('Its name', { exact: true })).toHaveValue('piano scales');
  await expect(sheet.getByLabel('Reminder', { exact: true })).toHaveValue('07:30');
  for (const day of ['Mon', 'Fri']) await expect(sheet.getByRole('button', { name: day, exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const day of ['Sat', 'Sun']) await expect(sheet.getByRole('button', { name: day, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await sheet.getByRole('button', { name: 'Close' }).click();

  await box_(a.page, 'piano scales').click();
  // The check-in is safe once its transaction commits; a reload before that is a tab closed mid-write.
  await onDisk(a.page, 'checkin/', 3);
  await a.setOffline(true);
  await a.page.reload();
  await expect(box_(a.page, 'piano scales')).toHaveAttribute('aria-checked', 'true');
  await expect(row(a.page, 'piano scales')).toContainText('Weekdays');
});
