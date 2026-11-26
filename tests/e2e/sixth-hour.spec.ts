// What the user's sixth hour found (roadmap section 20), DESIGN.md "Counted the same everywhere":
// a screen opened from the navigation opens at its top; a habit's past day is filled as far as
// its count went; the lap in progress counts the same on Today, Progress and a room's lane; and a
// habit's "of the last N planned days" counts from the day it was made.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import { inStep, serverCells, signedIn, until } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { accountWith, go, midScreen, ready, settle, signedInto, signIn, startButton, staysPut, username } from './app.ts';
import { expect, test } from './devices.ts';
import { e2eServer } from './server.ts';

const PHONE = { width: 412, height: 915 };
const LAPTOP = { width: 1440, height: 900 };
const MIN = 60000;
const DAY = 24 * 60 * MIN;
const OFF = -new Date().getTimezoneOffset();
const day = (back: number) => localDay(Date.now() - back * DAY, OFF);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const habitRow = (page: Page, title: string) => page.getByRole('checkbox', { name: `Check in: ${title}`, exact: true }).locator('xpath=..');
/** Where main and the document are scrolled. */
const scrolled = (page: Page) => page.locator('main').evaluate((main) => ({ main: main.scrollTop, doc: document.scrollingElement!.scrollTop }));

/** A lap that reached its bell, on no task, written from Node. */
const lap = (node: Node, id: string, started: number, ms = 25 * MIN) =>
  node.engine.write('session', id, { kind: 'work', task: null, started, ended: started + ms, planned_ms: ms, paused_ms: 0, outcome: 'rang', device: node.engine.device });

// 1. A screen opened from the navigation opens at its top.

test('a screen opened from the bottom bar or the sidebar opens at its top, wherever Progress was scrolled; a tap inside a screen still moves nothing', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  await signedInto(a, 'navtop', (node) => {
    // A history, so Progress is long enough to scroll on both sizes.
    for (let back = 1; back <= 30; back++) lap(node, `old${back}`, Date.parse(`${day(back)}T12:00:00Z`) - OFF * MIN);
    for (let i = 0; i < 12; i++) node.engine.write('habit', `h${i}`, { title: `habit ${i + 1}`, days: 127, target: 1, order: `V${String(i).padStart(2, '0')}` });
    for (let i = 0; i < 12; i++) node.engine.write('task', `t${i}`, { title: `task ${i + 1}`, order: `V${String(i).padStart(2, '0')}` });
  });
  for (const [size, where] of [[PHONE, 'the bottom bar'], [LAPTOP, 'the sidebar']] as const) {
    await a.page.setViewportSize(size);
    for (const to of ['Today', 'Habits'] as const) {
      await go(a.page, 'Progress');
      await expect(a.page.getByText(/^Progress, week of /)).toBeVisible();
      await settle(a.page);
      await a.page.locator('main').evaluate((main) => main.scrollTo(0, main.scrollHeight));
      await a.page.mouse.wheel(0, 4000);
      await settle(a.page);
      const down = await scrolled(a.page);
      expect(down.main + down.doc, `Progress did not scroll at ${size.width}`).toBeGreaterThan(0);
      await go(a.page, to);
      await settle(a.page);
      expect(await scrolled(a.page), `${to} from ${where} did not open at its top`).toEqual({ main: 0, doc: 0 });
      await expect(a.page.getByRole('heading', { level: 1 }).filter({ visible: true }).first()).toBeInViewport();
    }
  }

  // A tap inside a screen: a check-in part way down Habits stays under the finger.
  await a.page.setViewportSize(PHONE);
  await go(a.page, 'Habits');
  const box = a.page.getByRole('checkbox', { name: 'Check in: habit 9', exact: true });
  await midScreen(box);
  await settle(a.page);
  await staysPut(a.page, box, () => box.click());
});

// 2. A habit's past day is filled as far as its count went.

test('a habit with a target of 2 checked in once yesterday: yesterday\'s box is half filled, never empty', async ({ deviceA: a }) => {
  // The week drawn is Monday to Sunday: on a Monday yesterday is in last week, off the row.
  const monday = (new Date(`${day(0)}T00:00:00Z`).getUTCDay() + 6) % 7 === 0;
  test.skip(monday, 'yesterday is not in this week\'s row on a Monday');
  await a.page.setViewportSize(PHONE);
  await signedInto(a, 'halfday', (node) => {
    node.engine.write('habit', 'h', { title: 'stretch', days: 127, target: 2, order: 'V' });
    node.engine.write('checkin', 'c1', { habit: 'h', day: day(1), at: Date.parse(`${day(1)}T09:00:00Z`) - OFF * MIN });
  });
  await go(a.page, 'Habits');
  const index = (new Date(`${day(1)}T00:00:00Z`).getUTCDay() + 6) % 7;
  const yesterday = habitRow(a.page, 'stretch').locator('[role="img"] > span').nth(index).locator('i');
  await expect(habitRow(a.page, 'stretch').locator('[role="img"] > span')).toHaveCount(7);
  await expect.poll(() => yesterday.evaluate((el) => Number((el as HTMLElement).style.getPropertyValue('--share')) || 0), { message: 'yesterday, 1 of 2, is not drawn half filled' }).toBeCloseTo(0.5, 2);
});

// 3. The lap in progress counts the same everywhere.

/** "1h 5m" or "25m", the first of its kind in a text. */
const minutes = (text: string) => text.match(/(?:\d+h )?\d+m/)?.[0] ?? `none in "${text}"`;

test('with a lap running past its first minute, the own lane in a room says the same today and week as Today\'s Focused figure and Progress\'s week, read in the same minute', async ({ deviceA: a }) => {
  test.setTimeout(180000);
  const since = Date.now() - Date.parse(`${day(0)}T00:00:00Z`) + OFF * MIN;
  test.skip(since < 40 * MIN, 'too near midnight for a lap earlier today');
  await a.page.setViewportSize(PHONE);
  // A lap earlier today, so every total has something before the one that runs.
  await signedInto(a, 'sametotal', (node) => {
    lap(node, 'e1', Date.now() - 35 * MIN, 25 * MIN);
  });
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('one room');
  await button(a.page, 'Make the room').click();
  const own = a.page.getByRole('region', { name: 'Who is focusing now' }).locator('article').filter({ has: a.page.locator('p b').getByText('You', { exact: true }) });
  await expect(own).toBeVisible({ timeout: 3000 });
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  // Past the first minute, so the running lap adds a minute to whatever counts it.
  await a.page.waitForTimeout(75000);

  // Room, Today, Progress, then Room again: the two Room readings agree, so all fell in one minute.
  let read: { room: [string, string]; today: string; week: string; again: [string, string] } | null = null;
  for (let tries = 0; tries < 3 && !read; tries++) {
    const roomNow = async (): Promise<[string, string]> => {
      await go(a.page, 'Room');
      const text = (await own.innerText()).replace(/\s+/g, ' ');
      const m = text.match(/((?:\d+h )?\d+m) today, ((?:\d+h )?\d+m) this week\./) ?? text.match(/Nothing today yet, ((?:\d+h )?\d+m) this week\./);
      return m ? (m.length === 3 ? [m[1]!, m[2]!] : ['0m', m[1]!]) : [`none in "${text}"`, ''];
    };
    const room = await roomNow();
    await go(a.page, 'Today');
    const today = minutes(await a.page.locator('main dl > div').filter({ hasText: 'Focused' }).innerText());
    await go(a.page, 'Progress');
    await expect(a.page.getByText(/^Progress, week of /)).toBeVisible();
    // The week's chart says it in its label: "This week 27m so far."
    const week = minutes(((await a.page.getByRole('img', { name: /^This week .* so far\./ }).filter({ visible: true }).first().getAttribute('aria-label')) ?? '').replace(/^This week /, ''));
    const again = await roomNow();
    if (room.join() === again.join()) read = { room, today, week, again };
  }
  expect(read, 'the minute turned on every try').not.toBeNull();
  expect({ today: read!.room[0], week: read!.room[1] }, 'the room\'s own lane against Today and Progress').toEqual({ today: read!.today, week: read!.week });
});

// 4. "Of the last N planned days" counts from the day the habit was made.

test('two every-day habits made together ten days ago, one first checked in nine days ago and the other three: both read the same "of the last N planned days", counted from the day they were made', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const name = username('samen');
  await accountWith(name);
  // The day a habit was made is the local day of its oldest stamp (protocol section 14). A device
  // whose clock is ten days slow stamps with it until the server first tells it the time, so its
  // writes straight after signing in are ten days old: two habits made together, then.
  const old = await signedIn(e2eServer(), name, { skew: { ms: -10 * DAY } });
  old.engine.write('habit', 'a', { title: 'early', days: 127, target: 1, order: 'V0' });
  old.engine.write('habit', 'b', { title: 'late', days: 127, target: 1, order: 'V1' });
  // A gap before today in each, so both have missed a day and say how many they kept.
  for (const [id, habit, back] of [['a9', 'a', 9], ['a7', 'a', 7], ['b3', 'b', 3]] as const) {
    old.engine.write('checkin', id, { habit, day: day(back), at: Date.parse(`${day(back)}T09:00:00Z`) - OFF * MIN });
  }
  await until(() => inStep(old.engine), 10000, 'the habits were not sent');
  await old.engine.stop();
  const made = (await serverCells(e2eServer(), name)).filter((c) => c.dataset === 'habit').map((c) => c.stamp.slice(0, 10));
  expect(new Set(made), 'the habits were not made ten days ago').toEqual(new Set([new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10)]));

  await signIn(a.page, name);
  await ready(a.page);
  await go(a.page, 'Habits');
  const n = async (title: string) => {
    await expect(habitRow(a.page, title)).toBeVisible();
    return (await habitRow(a.page, title).innerText()).match(/of the last (\d+) planned days/)?.[1] ?? null;
  };
  await expect.poll(() => n('early'), { message: 'the habit checked in first says no "of the last N planned days"' }).not.toBeNull();
  const [early, late] = [await n('early'), await n('late')];
  expect(late, 'the later one says no "of the last N planned days"').not.toBeNull();
  expect(early, `made together, "early" counts ${early} planned days and "late" ${late}`).toBe(late);
});

// 5. A friend's lane counts their lap in progress, and stops while it is held.

/** "1h 5m" as minutes. */
const asMin = (t: string) => {
  const m = t.match(/^(?:(\d+)h )?(\d+)m$/);
  if (!m) throw new Error(`not a total: "${t}"`);
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
};

test('a friend\'s lane counts their lap in progress: B\'s lane on A says what B\'s Today and Progress say, the room\'s week is the sum, it stands still while B\'s lap is paused and grows again once resumed', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(360000);
  const since = Date.now() - Date.parse(`${day(0)}T00:00:00Z`) + OFF * MIN;
  test.skip(since < 40 * MIN, 'too near midnight for a lap earlier today');
  for (const d of [a, b]) await d.page.setViewportSize(PHONE);
  // A lap of whole minutes earlier today for each, so the sum has two parts and no rounding of its own.
  await signedInto(a, 'lanea', (node) => lap(node, 'a1', Date.now() - 35 * MIN));
  const { name: nameB } = await signedInto(b, 'laneb', (node) => lap(node, 'b1', Date.now() - 35 * MIN));

  // A makes the room, B joins with its code.
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('two of us');
  await button(a.page, 'Make the room').click();
  await button(a.page, 'Code and settings').click();
  const sheet = a.page.getByRole('dialog', { name: 'This room' });
  const code = (await sheet.getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await go(b.page, 'Room');
  await b.page.getByLabel('The code a friend gave you').fill(code);
  await button(b.page, 'Join').click();
  const lanes = a.page.getByRole('region', { name: 'Who is focusing now' }).locator('article');
  await expect(lanes).toHaveCount(2, { timeout: 5000 });
  const laneB = lanes.filter({ has: a.page.locator('p b').getByText(nameB, { exact: true }) });

  /** B's lane as A sees it, and the room's week, from A's Room. */
  const onA = async () => {
    await go(a.page, 'Room');
    await a.page.getByRole('tab', { name: 'People' }).click();
    const text = (await laneB.innerText()).replace(/\s+/g, ' ');
    const m = text.match(/((?:\d+h )?\d+m) today, ((?:\d+h )?\d+m) this week\./);
    if (!m) throw new Error(`B's lane on A says "${text}"`);
    // The room's week is on the Week tab: "1h 22m together this week".
    await a.page.getByRole('tab', { name: 'Week' }).click();
    const together = minutes(await a.page.getByRole('tabpanel').locator('p').filter({ hasText: /together this week$/ }).first().innerText());
    await a.page.getByRole('tab', { name: 'People' }).click();
    return { today: m[1]!, week: m[2]!, together };
  };

  await go(b.page, 'Focus');
  await startButton(b.page).click();
  await expect(button(b.page, 'Pause')).toBeVisible();
  await b.page.waitForTimeout(75000);

  // A's view, B's own Today and Progress, A's view again: the two A readings agree, so all fell in one minute.
  let read: { lane: Awaited<ReturnType<typeof onA>>; today: string; week: string } | null = null;
  for (let tries = 0; tries < 3 && !read; tries++) {
    const first = await onA();
    await go(b.page, 'Today');
    const today = minutes(await b.page.locator('main dl > div').filter({ hasText: 'Focused' }).innerText());
    await go(b.page, 'Progress');
    await expect(b.page.getByText(/^Progress, week of /)).toBeVisible();
    const week = minutes(((await b.page.getByRole('img', { name: /^This week .* so far\./ }).filter({ visible: true }).first().getAttribute('aria-label')) ?? '').replace(/^This week /, ''));
    const again = await onA();
    if (JSON.stringify(first) === JSON.stringify(again)) read = { lane: first, today, week };
  }
  expect(read, 'the minute turned on every try').not.toBeNull();
  expect({ today: read!.lane.today, week: read!.lane.week }, 'B\'s lane on A against B\'s own Today and Progress').toEqual({ today: read!.today, week: read!.week });
  // A's own week is the one 25 minute lap.
  expect(asMin(read!.lane.together), 'the room\'s week is not A\'s and B\'s together').toBe(25 + asMin(read!.lane.week));
  expect(asMin(read!.lane.today), 'B\'s running lap is not counted on A').toBeGreaterThan(25);

  // Paused: B's lane on A stands still a minute on.
  await go(b.page, 'Focus');
  await button(b.page, 'Pause').click();
  await expect(button(b.page, 'Resume')).toBeVisible();
  await a.page.waitForTimeout(3000);
  const held = await onA();
  await a.page.waitForTimeout(65000);
  expect(await onA(), 'B\'s lane went on growing while the lap was paused').toEqual(held);

  // Resumed: it grows again.
  await button(b.page, 'Resume').click();
  await expect(button(b.page, 'Pause')).toBeVisible();
  await a.page.waitForTimeout(65000);
  const grown = await onA();
  expect(asMin(grown.today), 'B\'s lane did not grow once the lap was resumed').toBeGreaterThan(asMin(held.today));
});
