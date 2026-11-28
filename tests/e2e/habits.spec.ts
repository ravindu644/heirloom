// Habits (protocol section 14) through the screen, on the real engine and server.
import type { Page } from '@playwright/test';
import { streakWindow } from '../../client/src/core/streak.ts';
import { localDay } from '../../client/src/core/stats.ts';
import { serverRows, until } from '../sync/harness.ts';
import { accountWith, checkInRound, go, habitRow, onDisk, openHabit, ready, roundsOf, roundsTicked, server, signIn, statusLine, username } from './app.ts';
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
const row = habitRow;
const open = openHabit;
const said = (page: Page, about: string) => page.getByRole('status').filter({ hasText: about }).innerText().then((t) => t.replace(/\s+/g, ' ').trim());
/** No bar speaks of a check-in or a take-back, and none offers Undo: on Habits the box is the way back. */
const noBar = async (page: Page) => {
  await page.waitForTimeout(400);
  await expect(page.getByRole('status').filter({ hasText: /Checked in|Taken back/ }), 'a bar spoke of a check-in').toHaveCount(0);
  await expect(page.getByRole('status').getByRole('button', { name: 'Undo' }), 'a bar offers Undo for a check-in').toHaveCount(0);
};
/** Today's live check-ins of a habit on the server, oldest first. */
const live = async (name: string, habit: string) =>
  [...(await serverRows(server, name, 'checkin')).values()].filter((r) => r.habit === habit && r.day === today() && !r.deleted).sort((x, y) => Number(x.at) - Number(y.at));
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
  await noBar(a.page);
});

test('a target of 3 has the arrow, not one box: each round is ticked on its own, in any order, and a tap on a ticked round takes that round back; no bar', async ({ deviceA: a }) => {
  const { name } = await onHabits([a], 'htarget');
  await add(a.page, 'water');
  const sheet = await open(a.page, 'water');
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'One time more', exact: true }).click();
  await expect(sheet).toContainText('3 times a day');
  // No way to take one back in the sheet: the box is the way.
  await expect(sheet.getByRole('button', { name: /take one back/i })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(box_(a.page, 'water'), 'a habit of three times a day still has one box').toHaveCount(0);
  const id = [...(await serverRows(server, name, 'habit')).keys()][0]!;

  // The third first, then the first: the box tapped is the one ticked.
  await checkInRound(a.page, 'water', 3);
  await expect.poll(() => roundsTicked(a.page, 'water')).toEqual([false, false, true]);
  await expect(row(a.page, 'water')).toContainText('1 of 3');
  await checkInRound(a.page, 'water', 1);
  await expect.poll(() => roundsTicked(a.page, 'water')).toEqual([true, false, true]);
  await expect(row(a.page, 'water')).toContainText('2 of 3');
  await expect.poll(async () => (await live(name, id)).map((r) => r.round)).toEqual([3, 1]);

  // A tap on the ticked third takes the third back, not the latest.
  await checkInRound(a.page, 'water', 3);
  await expect.poll(() => roundsTicked(a.page, 'water')).toEqual([true, false, false]);
  await expect(row(a.page, 'water')).toContainText('1 of 3');
  await expect.poll(async () => (await live(name, id)).map((r) => r.round)).toEqual([1]);
  await noBar(a.page);
});

test('two laptops offline tick the same round of a habit done twice a day: it counts once, 1 of 2, with both rows kept; then each ticks another and it is 2 of 2', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await onHabits([a, b], 'hoffline');
  await add(a.page, 'stretch');
  const sheet = await open(a.page, 'stretch');
  await sheet.getByRole('button', { name: 'One time more', exact: true }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(row(b.page, 'stretch')).toContainText('0 of 2');
  const id = [...(await serverRows(server, name, 'habit')).keys()][0]!;

  for (const d of [a, b]) await d.setOffline(true);
  for (const d of [a, b]) {
    await expect(statusLine(d.page)).toHaveText(/^No connection/);
    await checkInRound(d.page, 'stretch', 1);
    await expect(row(d.page, 'stretch')).toContainText('1 of 2');
  }
  for (const d of [a, b]) await d.setOffline(false);
  // Both rows reach the server, round 1 each, and the round is filled once.
  await expect.poll(async () => (await live(name, id)).map((r) => r.round), { timeout: 10000 }).toEqual([1, 1]);
  for (const d of [a, b]) {
    await expect.poll(() => roundsTicked(d.page, 'stretch'), { timeout: 5000 }).toEqual([true, false]);
    await expect(row(d.page, 'stretch')).toContainText('1 of 2');
  }
  // The second round, on B: both devices show it full.
  await checkInRound(b.page, 'stretch', 2);
  for (const d of [a, b]) {
    await expect.poll(() => roundsTicked(d.page, 'stretch'), { timeout: 3000 }).toEqual([true, true]);
    await expect(row(d.page, 'stretch')).toContainText('2 of 2');
  }
  for (const d of [a, b]) await noBar(d.page);
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
  await expect(row(a.page, 'walk')).toContainText(`Weekdays, ${rule.streak} days in a row`);
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

// A habit done more than once a day (DESIGN.md, Habit row): its arrow opens one row per round.

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

test('five times a day: the arrow opens five rounds, three with their times and two named by which they are; 08:00 skipped and 12:00 ticked on the laptop leaves 08:00 empty; the phone\'s tap on the 4th ticks the 4th; "done at" is the real time; a tap on ticked 12:00 takes 12:00 back; the server holds each round; no bar', async ({ deviceA: laptop, phone }) => {
  const name = username('hrounds');
  const node = await accountWith(name);
  node.engine.write('habit', 'water', { title: 'water', days: 127, target: 5, reminds: ['08:00', '12:00', '18:00'], order: 'V' });
  await until(() => node.engine.unsent.value === 0, 10000, 'not sent');
  await laptop.page.setViewportSize({ width: 1440, height: 900 });
  for (const d of [laptop, phone]) {
    await signIn(d.page, name);
    await ready(d.page);
    await go(d.page, 'Habits');
  }
  // One habit, more than once a day: the arrow in the box column, no single box.
  await expect(box_(laptop.page, 'water')).toHaveCount(0);
  await expect(row(laptop.page, 'water').getByRole('button', { name: "Today's times, 0 of 5 done" })).toHaveAttribute('aria-expanded', 'false');
  const rounds = await roundsOf(laptop.page, 'water');
  expect(await rounds.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual(['water, 08:00', 'water, 12:00', 'water, 18:00', 'water, 4th time', 'water, 5th time']);
  const words = async (page: Page) => (await roundsOf(page, 'water')).evaluateAll((els) => els.map((el) => el.parentElement!.innerText.replace(/\s+/g, ' ').trim()));
  expect(await words(laptop.page)).toEqual(['08:00', '12:00', '18:00', '4th time', '5th time']);
  const rounded = async () => (await live(name, 'water')).map((r) => r.round);

  // 08:00 skipped, 12:00 ticked on the laptop: 12:00 is the one ticked, here, on the phone and on the server.
  const before = Date.now();
  await rounds.nth(1).click();
  await expect.poll(rounded).toEqual([2]);
  const noon = Number((await live(name, 'water'))[0]!.at);
  expect(noon).toBeGreaterThanOrEqual(before - 5000);
  for (const d of [laptop, phone]) {
    await expect.poll(() => roundsTicked(d.page, 'water'), { timeout: 3000 }).toEqual([false, true, false, false, false]);
    await expect.poll(() => words(d.page)).toEqual(['08:00', `12:00 done at ${clock(noon)}`, '18:00', '4th time', '5th time']);
    await expect(row(d.page, 'water')).toContainText('1 of 5');
  }

  // The phone taps the 4th: the 4th is ticked, nothing else.
  await (await roundsOf(phone.page, 'water')).nth(3).tap();
  await expect.poll(rounded).toEqual([2, 4]);
  for (const d of [laptop, phone]) {
    await expect.poll(() => roundsTicked(d.page, 'water'), { timeout: 3000 }).toEqual([false, true, false, true, false]);
    await expect(row(d.page, 'water')).toContainText('2 of 5');
  }

  // A tap on ticked 12:00 takes 12:00 back, not the latest (the 4th).
  await rounds.nth(1).click();
  await expect.poll(rounded).toEqual([4]);
  for (const d of [laptop, phone]) {
    await expect.poll(() => roundsTicked(d.page, 'water'), { timeout: 3000 }).toEqual([false, false, false, true, false]);
    await expect(row(d.page, 'water')).toContainText('1 of 5');
  }
  for (const d of [laptop, phone]) await noBar(d.page);
});

test('the run reads "N days in a row" for a habit done once a day and "N full days in a row" for one done three times a day', async ({ deviceA: a }) => {
  const name = username('hrow');
  const node = await accountWith(name);
  node.engine.write('habit', 'read', { title: 'read', days: 127, target: 1, order: 'V' });
  node.engine.write('habit', 'water', { title: 'water', days: 127, target: 3, order: 'W' });
  const kept = [3, 2, 1].map((back) => localDay(Date.now() - back * DAY, OFF));
  kept.forEach((d, i) => {
    node.engine.write('checkin', `r${i}`, { habit: 'read', day: d, at: Date.parse(`${d}T09:00:00Z`) });
    for (const k of [0, 1, 2]) node.engine.write('checkin', `w${i}${k}`, { habit: 'water', day: d, at: Date.parse(`${d}T09:00:00Z`) + k * 3600000 });
  });
  await until(() => node.engine.unsent.value === 0, 10000, 'not sent');
  await signIn(a.page, name);
  await ready(a.page);
  await go(a.page, 'Habits');
  const rule = streakWindow(today(), kept, 127);
  expect(rule.streak, 'three days kept make a run').toBeGreaterThan(1);
  // Once a day: "days in a row". More often: "full days in a row", every round of each day.
  await expect(row(a.page, 'read')).toContainText(`Every day, ${rule.streak} days in a row`);
  await expect(row(a.page, 'water')).toContainText(`Every day, ${rule.streak} full days in a row`);
  for (const title of ['read', 'water']) await expect(row(a.page, title)).not.toContainText('running');
});
