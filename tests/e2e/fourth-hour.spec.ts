// What the user's fourth hour found (roadmap section 15), each as the person meets it, at 412x915
// unless a test says otherwise: the set of four is on no screen, a lap runs up to 360 minutes,
// Today's open tasks are one list to the hand with Upcoming in it, and the day's sessions show
// their five latest.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import * as words from '../../client/src/ui/strings.ts';
import { serverCells, serverRows, table } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { go, lapSaid as lapLine, list, ready, server, settle, signedInto, signIn, startButton, startNow, staysPut, strip, taskRow } from './app.ts';
import { expect, test } from './devices.ts';

const PHONE = { width: 412, height: 915 };
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const OFF = -new Date().getTimezoneOffset();
const today = () => localDay(Date.now(), OFF);
const dayAfter = (n: number) => localDay(Date.now() + n * DAY, OFF);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const rowOf = async (name: string, id: string) => (await serverRows(server, name, 'task')).get(id);

/** A second browser of the same account, signed in and ready. */
async function also(d: { page: Page }, name: string) {
  await signIn(d.page, name);
  await ready(d.page);
}

// Focus's bar, as drawn: its segments, or none.
const focusBar = (page: Page) => page.locator('main i[style*="--i:"]').count();
// Words on a screen that name the set of four.
const setWords = (page: Page) =>
  page.locator('body').evaluate((body: HTMLElement) =>
    body.innerText
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => /\bset of\b|in this set|of 4 in/.test(line)),
  );

// 1. The set is on no screen.

test('the set is on no screen: through four laps and the long break, Focus, Today, Progress, Room and Settings never name it; the first row counts nothing in any lap or on any bell; the break each lap earns is on its button; the fourth lap is "Four laps. The long break is earned!" and offers it', async ({ deviceA: a }) => {
  test.setTimeout(120000);
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'noset', undefined, { work_ms: 3000, short_ms: 5 * MIN, long_ms: 15 * MIN });
  const everywhere = async (when: string) => {
    for (const screen of ['Today', 'Progress', 'Room'] as const) {
      await go(a.page, screen);
      await settle(a.page);
      expect(await setWords(a.page), `${screen}, ${when}`).toEqual([]);
    }
    await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
    await settle(a.page);
    expect(await setWords(a.page), `Settings, ${when}`).toEqual([]);
    await go(a.page, 'Focus');
  };

  // A lap on nothing: no bar on Focus, and nothing over where it would be.
  expect(await lapLine(a.page)).toBe('');
  expect(await focusBar(a.page), 'Focus draws a bar for a lap on nothing').toBe(0);
  for (const lap of [1, 2, 3, 4]) {
    await (lap === 1 ? startButton(a.page) : startNow(a.page)).click();
    await expect(button(a.page, 'Pause')).toBeVisible();
    expect(await lapLine(a.page), `lap ${lap}`).toBe('');
    expect(await setWords(a.page), `Focus, lap ${lap}`).toEqual([]);
    if (lap === 2) await everywhere('during lap 2');
    if (lap < 4) {
      await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
      expect(await lapLine(a.page), `lap ${lap} rang`).toBe('');
      await expect(button(a.page, 'Start 5 min break')).toBeVisible();
    }
  }
  await expect(a.page.getByText('Four laps. The long break is earned!', { exact: true })).toBeVisible({ timeout: 8000 });
  await expect(button(a.page, 'Start 15 min break')).toBeVisible();
  expect(await lapLine(a.page), 'lap 4 rang').toBe('');
  expect(await setWords(a.page), 'Focus, the fourth lap done').toEqual([]);
  await button(a.page, 'Start 15 min break').click();
  await expect.poll(() => lapLine(a.page)).toBe('Long break');
  await everywhere('in the long break');
  // The room's row in the break: no lap number.
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('quiet room');
  await button(a.page, 'Make the room').click();
  const me = a.page.getByRole('region', { name: 'Who is focusing now' }).locator('article').filter({ hasText: 'You' }).first();
  await expect(me).toBeVisible({ timeout: 3000 });
  await expect(me).not.toContainText(/\blap \d|set of/);
});

test('with a day target of 2 and a task of 3, Focus\'s bar is the task\'s three and Today\'s the target\'s two; no words count either on Focus; past the target Focus\'s bar stays the task\'s; a room row says "Focusing" and no lap', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  await a.page.setViewportSize(PHONE);
  await signedInto(
    a,
    'target',
    (node) => {
      node.engine.write('settings', 'current', { day_target: 2 });
      node.engine.write('task', 'essay', { title: 'essay', estimate: 3, order: 'V' });
    },
    { work_ms: 3000, short_ms: 5 * MIN },
  );
  await expect.poll(() => focusBar(a.page), { message: 'Focus\'s bar is not the task\'s estimate' }).toBe(3);
  expect(await lapLine(a.page)).toBe('');
  await go(a.page, 'Today');
  const todayBar = await a.page.getByRole('group', { name: 'Day target' }).locator('[aria-hidden="true"]').first().evaluate((bar) => bar.children.length);
  expect(todayBar).toBe(2);
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  expect(await lapLine(a.page)).toBe('');
  // The room row while the lap runs.
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('target room');
  await button(a.page, 'Make the room').click();
  const me = a.page.getByRole('region', { name: 'Who is focusing now' }).locator('article').filter({ hasText: 'You' }).first();
  await expect(me).toContainText('Focusing', { timeout: 3000 });
  await expect(me).not.toContainText(/\blap \d|set of/);
  await go(a.page, 'Focus');
  await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
  expect(await lapLine(a.page)).toBe('');
  await startNow(a.page).click();
  await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
  await startNow(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  // The third lap of the day, past the target of 2: Focus's line still counts nothing, its bar is still the task's.
  expect(await lapLine(a.page)).toBe('');
  expect(await focusBar(a.page)).toBe(3);
  // Today's strip after a bell is still "Lap done".
  await go(a.page, 'Today');
  await expect(a.page.getByText('Lap done', { exact: true })).toBeVisible({ timeout: 8000 });
});

// 2. A lap up to 360 minutes.

/** The big digits on Focus, as drawn: their words, on one line, inside their column. */
const digitsAt = (page: Page) =>
  page.locator('[class*="digits"]').first().evaluate((el: HTMLElement) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    const box = el.getBoundingClientRect();
    const column = el.parentElement!.getBoundingClientRect();
    const text = range.getBoundingClientRect();
    return { text: el.textContent, lines, inside: text.left >= Math.min(box.left, column.left) - 0.5 && text.right <= Math.max(box.right, column.right) + 0.5 && text.right <= innerWidth + 0.5 && text.left >= -0.5, over: el.scrollWidth > el.clientWidth + 1 };
  });

test('a lap of up to 360 minutes: Settings and the task sheet take 360 and bring 361 to 360, the plus stops there; Focus reads 6:00:00, then 5:59:59, at 100 minutes 1:40:00 and at 99 99:00, on one line inside its column at every width; Today\'s strip and "of …, ends at" say the same', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  const { name } = await signedInto(a, 'long', (node) => node.engine.write('task', 't', { title: 'film', order: 'V' }));
  // Settings.
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  const lap = a.page.getByRole('spinbutton', { name: 'A lap' });
  for (const [typed, kept] of [['360', '360'], ['361', '360']] as const) {
    await lap.fill(typed);
    await lap.press('Enter');
    await expect(lap, `${typed} typed`).toHaveValue(kept);
  }
  await expect(a.page.getByRole('button', { name: 'A lap, one minute more' })).toBeDisabled();
  await expect.poll(async () => (await serverRows(server, name, 'settings')).get('current')?.work_ms).toBe(360 * MIN);

  // The task sheet, its own lengths.
  await go(a.page, 'Today');
  await taskRow(a.page, 'film').getByRole('button', { name: /film/ }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Task', exact: true });
  await sheet.getByRole('button', { name: 'Its own' }).click();
  await settle(a.page);
  const own = sheet.getByRole('spinbutton', { name: 'A lap' });
  await own.fill('361');
  await own.press('Enter');
  await expect(own).toHaveValue('360');
  await expect(sheet.getByRole('button', { name: 'A lap, one minute more' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'My usual lengths' }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Focus at every width, before a start.
  await go(a.page, 'Focus');
  for (const [width, height] of [[412, 915], [471, 915], [1440, 900], [206, 457]] as const) {
    await a.page.setViewportSize({ width, height });
    await settle(a.page);
    const d = await digitsAt(a.page);
    expect(d.text).toBe('6:00:00');
    expect(d.lines, `at ${width} the digits take two lines`).toBe(1);
    expect(d.inside && !d.over, `at ${width} the digits run out of their column`).toBe(true);
  }
  await a.page.setViewportSize(PHONE);
  await startButton(a.page).click();
  await expect(a.page.locator('[class*="digits"]').first()).toHaveText('5:59:59', { timeout: 3000 });
  for (const [width, height] of [[412, 915], [206, 457]] as const) {
    await a.page.setViewportSize({ width, height });
    await settle(a.page);
    const d = await digitsAt(a.page);
    expect(d.lines === 1 && d.inside && !d.over, `running, at ${width}: ${JSON.stringify(d)}`).toBe(true);
  }
  await a.page.setViewportSize(PHONE);
  await expect(a.page.getByText(/^of 6:00:00, ends at \d\d:\d\d$/).filter({ visible: true })).toBeVisible();
  await go(a.page, 'Today');
  await expect(strip(a.page).locator('b')).toHaveText(/^5:5\d:\d\d$/);
  await go(a.page, 'Focus');
  await button(a.page, 'Stop').click();

  // 100 minutes in hours, 99 as before.
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  for (const [minutes, shown] of [['100', '1:40:00'], ['99', '99:00']] as const) {
    await lap.fill(minutes);
    await lap.press('Enter');
    await expect.poll(async () => (await serverRows(server, name, 'settings')).get('current')?.work_ms).toBe(Number(minutes) * MIN);
    await go(a.page, 'Focus');
    await expect(a.page.locator('[class*="digits"]').first()).toHaveText(shown);
    await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  }
});

// 3. One list to the hand.

/** Holds the row of `title` with the mouse and sets it down at `y` on the screen; returns where the pointer let go. */
async function carry(page: Page, title: string, y: number) {
  const box = (await taskRow(page, title).boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.move(x, y, { steps: 14 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await settle(page);
  return { x, y };
}
const rowsIn = (page: Page, heading: string) =>
  list(page, heading)
    .getByRole('checkbox', { name: /^Done: / })
    .evaluateAll((els) => els.filter((el) => !el.closest('[inert]')).map((el) => el.getAttribute('aria-label')!.slice('Done: '.length)));

const SEED = (node: Node) => {
  node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
  node.engine.write('task', 'b', { title: 'bravo', order: 'B' });
  node.engine.write('task', 'c', { title: 'charlie', order: 'C' });
  node.engine.write('task', 'x', { title: 'xray', due: dayAfter(1), order: 'D' });
  node.engine.write('task', 'y', { title: 'yankee', due: dayAfter(2), order: 'E' });
  node.engine.write('task', 'z', { title: 'zulu', due: dayAfter(3), order: 'F' });
};

test('one list to the hand: a Later row set down at the top is Next; an Upcoming row carried up is due today, said with the day it had and Undo, on both devices; two Upcoming rows swap and keep their days; a today row dropped in Upcoming goes back, the bar says why, and nothing is written; what is set down lands under the pointer', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(90000);
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'onelist', SEED);
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Today');
  await expect.poll(() => rowsIn(a.page, 'Upcoming')).toEqual(['xray', 'yankee', 'zulu']);
  expect(await rowsIn(a.page, 'Next')).toEqual(['alpha']);
  expect(await rowsIn(a.page, 'Later today')).toEqual(['bravo', 'charlie']);

  // A Later row set down at the top: it is Next, and what was Next is the first of Later.
  const top = (await taskRow(a.page, 'alpha').boundingBox())!;
  const at = await carry(a.page, 'charlie', top.y + 4);
  await expect.poll(() => rowsIn(a.page, 'Next')).toEqual(['charlie']);
  expect(await rowsIn(a.page, 'Later today')).toEqual(['alpha', 'bravo']);
  const landed = (await taskRow(a.page, 'charlie').boundingBox())!;
  expect(at.y >= landed.y - 1 && at.y <= landed.y + landed.height + 1, 'the row set down is not under the pointer').toBe(true);
  await expect.poll(() => rowsIn(b.page, 'Next'), { timeout: 2000 }).toEqual(['charlie']);

  // An Upcoming row carried up among today's rows: for today, said with Undo.
  const before = await rowOf(name, 'x');
  const among = (await taskRow(a.page, 'bravo').boundingBox())!;
  await carry(a.page, 'xray', among.y + among.height + 2);
  await expect.poll(() => rowsIn(a.page, 'Later today')).toContain('xray');
  // The bar's region is a zero-height line at the screen's foot: its words are what is seen.
  // Its words are the app's own (they moved twice while this was written): now due today, the day it had, Undo.
  const bar = a.page.getByRole('status').filter({ hasText: words.today.nowToday });
  await expect(bar.locator('p').first()).toBeVisible();
  await expect(bar).toContainText(words.today.wasDue(words.today.due(dayAfter(1), today())));
  await expect.poll(async () => (await rowOf(name, 'x'))?.due).toBe(today());
  await expect.poll(() => rowsIn(b.page, 'Later today'), { timeout: 2000 }).toContain('xray');
  await bar.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => {
    const row = await rowOf(name, 'x');
    return [row?.due, row?.order];
  }).toEqual([before?.due, before?.order]);
  for (const d of [a, b]) await expect.poll(() => rowsIn(d.page, 'Upcoming'), { timeout: 2000 }).toEqual(['xray', 'yankee', 'zulu']);

  // Two Upcoming rows of different days: they swap, and each keeps its day.
  await taskRow(a.page, 'yankee').getByRole('button', { name: /yankee/ }).focus();
  await a.page.keyboard.press('Alt+ArrowUp');
  for (const d of [a, b]) await expect.poll(() => rowsIn(d.page, 'Upcoming'), { timeout: 2000 }).toEqual(['yankee', 'xray', 'zulu']);
  expect([(await rowOf(name, 'x'))?.due, (await rowOf(name, 'y'))?.due]).toEqual([dayAfter(1), dayAfter(2)]);
  await expect(taskRow(a.page, 'yankee')).toContainText(/\w/);

  // A today row dropped inside Upcoming goes back where it was, and nothing is written.
  // The task cells only: a fresh device reading the server may write cells of its own.
  const tasksHeld = async () => table(await serverCells(server, name)).filter((line) => line.startsWith('task/'));
  const cells = await tasksHeld();
  const zulu = (await taskRow(a.page, 'zulu').boundingBox())!;
  await carry(a.page, 'bravo', zulu.y + zulu.height / 2);
  expect(await rowsIn(a.page, 'Later today')).toEqual(['alpha', 'bravo']);
  // And the bar says why, and how a day is given.
  await expect(a.page.getByRole('status').filter({ hasText: words.today.staysToday }).locator('p').first()).toBeVisible();
  expect(await rowsIn(a.page, 'Upcoming')).toEqual(['yankee', 'xray', 'zulu']);
  await a.page.waitForTimeout(500);
  expect(await tasksHeld(), 'a drop that went nowhere wrote something').toEqual(cells);
});

test('one list to the hand, by the keyboard: Alt and up carries an Upcoming row into today, where a heading it needs appears and the row stays under the focus', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'onekeys', (node) => {
    node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
    node.engine.write('task', 'x', { title: 'xray', due: dayAfter(1), order: 'D' });
  });
  await go(a.page, 'Today');
  await expect(list(a.page, 'Later today')).toHaveCount(0);
  const xray = taskRow(a.page, 'xray').getByRole('button', { name: /xray/ });
  await xray.focus();
  await settle(a.page);
  // "Later today" appears for it; the row stays where it was on the screen.
  await staysPut(a.page, xray, () => a.page.keyboard.press('Alt+ArrowUp'));
  await expect.poll(() => rowsIn(a.page, 'Later today')).toEqual(['xray']);
  await expect(a.page.getByRole('status').filter({ hasText: words.today.nowToday }).locator('p').first()).toBeVisible();
  await expect.poll(async () => (await rowOf(name, 'x'))?.due).toBe(today());
  await expect(taskRow(a.page, 'xray').getByRole('button', { name: /xray/ })).toBeFocused();
});

test('a row with nowhere to go does not lift and the hint is not shown; with two rows the hint shows', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const { node } = await signedInto(a, 'alone', (n) => n.engine.write('task', 'a', { title: 'alpha', order: 'A' }));
  await go(a.page, 'Today');
  await expect(a.page.getByText('Press and hold a task to move it.')).toHaveCount(0);
  const box = (await taskRow(a.page, 'alpha').boundingBox())!;
  await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.page.mouse.down();
  await a.page.waitForTimeout(600);
  const lifted = await a.page.locator('[data-lifted]').count();
  await a.page.mouse.up();
  expect(lifted, 'the only open task lifted').toBe(0);
  node.engine.write('task', 'b', { title: 'bravo', order: 'B' });
  await expect(taskRow(a.page, 'bravo')).toBeVisible({ timeout: 3000 });
  await expect(a.page.getByText('Press and hold a task to move it.')).toBeVisible();
});

test('no loss: A carries a row into today while B, offline, retitles it; both are kept, on both', async ({ deviceA: a, deviceB: b }) => {
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'carrylost', (node) => {
    node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
    node.engine.write('task', 'x', { title: 'xray', due: dayAfter(1), order: 'D' });
  });
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Today');
  await b.setOffline(true);
  await taskRow(b.page, 'xray').getByRole('button', { name: /xray/ }).click();
  await b.page.getByRole('dialog', { name: 'Task', exact: true }).getByLabel('Title').fill('xray, retitled');
  await b.page.keyboard.press('Escape');
  await taskRow(a.page, 'xray').getByRole('button', { name: /xray/ }).focus();
  await a.page.keyboard.press('Alt+ArrowUp');
  await expect.poll(async () => (await rowOf(name, 'x'))?.due).toBe(today());
  await b.setOffline(false);
  await expect.poll(async () => {
    const row = await rowOf(name, 'x');
    return [row?.title, row?.due];
  }, { timeout: 10000 }).toEqual(['xray, retitled', today()]);
  for (const d of [a, b]) await expect.poll(() => rowsIn(d.page, 'Later today'), { timeout: 5000 }).toContain('xray, retitled');
});

test('a daily task carried in from tomorrow and done today: the first of a series gives the next on tomorrow; that one, carried in and done too, gives the day after tomorrow; one open row of the series each time', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'carryrepeat', (node) => {
    node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
    node.engine.write('task', 'read', { title: 'read', due: dayAfter(1), repeat: { every: 'day' }, order: 'D' });
  });
  await go(a.page, 'Today');
  const open = async () => [...(await serverRows(server, name, 'task')).entries()].filter(([, r]) => r.title === 'read' && !r.done && !r.deleted);
  // The open one: the done one of the series stays in Done under the same title.
  const carryAndTick = async () => {
    await list(a.page, 'Upcoming').getByRole('button', { name: /^read/ }).focus();
    await a.page.keyboard.press('Alt+ArrowUp');
    await expect.poll(async () => (await open()).map(([, r]) => r.due)).toEqual([today()]);
    await list(a.page, 'Later today').getByRole('checkbox', { name: 'Done: read' }).click();
  };
  // The first row of the series (a plain id): nothing is named for tomorrow yet, so the next is tomorrow.
  await carryAndTick();
  await expect.poll(async () => (await open()).map(([id, r]) => [id, r.due])).toEqual([[`read-${dayAfter(1).replaceAll('-', '')}`, dayAfter(1)]]);
  // That one is named for tomorrow: carried in and done, the next skips tomorrow.
  await expect(list(a.page, 'Upcoming')).toContainText('read');
  await carryAndTick();
  await expect.poll(async () => (await open()).map(([, r]) => r.due)).toEqual([dayAfter(2)]);
  await expect(list(a.page, 'Upcoming')).toContainText('read');
});

// 4. Today, hour by hour: the five latest.

test('the day\'s sessions: with twelve the list shows the five latest in the day\'s order under "7 earlier today", which opens all twelve in place and stays under the pointer; with five there is no link', async ({ deviceA: a, deviceB: b }) => {
  const since = Date.now() - (Date.parse(`${today()}T00:00:00Z`) - OFF * MIN);
  test.skip(since < 45 * MIN, 'within 45 minutes after local midnight, today cannot hold the seeded laps');
  const seed = (n: number) => (node: Node) => {
    // Twelve short tries in the last forty minutes, three minutes apart.
    const start = Date.now() - 40 * MIN;
    for (let k = 0; k < n; k++) node.engine.write('session', `s${k}`, { kind: 'work', task: null, started: start + k * 3 * MIN, ended: start + k * 3 * MIN + 2 * MIN, planned_ms: 25 * MIN, paused_ms: 0, outcome: 'stopped', device: node.engine.device });
  };
  await signedInto(a, 'twelve', seed(12));
  await go(a.page, 'Progress');
  const day = a.page.locator('section').filter({ has: a.page.getByRole('heading', { name: 'Today, hour by hour', level: 2 }) });
  const rows = day.getByRole('listitem');
  await expect(rows).toHaveCount(5);
  const starts = await rows.evaluateAll((els) => els.map((el) => el.textContent?.match(/\d\d:\d\d/)?.[0] ?? ''));
  expect([...starts].sort(), 'the five are not in the day\'s order').toEqual(starts);
  const more = day.getByRole('button', { name: '7 earlier today' });
  await expect(more).toBeVisible();
  // On the screen before it is tapped, as a person's finger finds it.
  await more.scrollIntoViewIfNeeded();
  await settle(a.page);
  await staysPut(a.page, more, () => more.click(), day.getByRole('button', { name: 'Show the latest 5' }));
  await expect(rows).toHaveCount(12);
  const all = await rows.evaluateAll((els) => els.map((el) => el.textContent?.match(/\d\d:\d\d/)?.[0] ?? ''));
  expect(all.slice(-5), 'the five latest are not the end of the twelve').toEqual(starts);

  await signedInto(b, 'five', seed(5));
  await go(b.page, 'Progress');
  const five = b.page.locator('section').filter({ has: b.page.getByRole('heading', { name: 'Today, hour by hour', level: 2 }) });
  await expect(five.getByRole('listitem')).toHaveCount(5);
  await expect(five.getByRole('button', { name: /earlier today|Show the latest/ })).toHaveCount(0);
});

