// What the user's fifth hour found (roadmap section 17), each as the person meets it, at 412x915:
// Focus's bar is the task's laps and no words explain them, and on Today a carried row
// takes the Next card's place before it is let go, so letting go moves nothing.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import { serverRows } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { firstRow, go, lapSaid, list, server, settle, signedInto, startButton, startNow, staysPut, strip, taskRow, titles } from './app.ts';
import { expect, test } from './devices.ts';

const PHONE = { width: 412, height: 915 };
const DAY = 24 * 60 * 60000;
const dayAfter = (n: number) => localDay(Date.now() + n * DAY, -new Date().getTimezoneOffset());
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// 1. Focus's bar is the task's laps.

/** Focus's bar as drawn: how full each segment is, or [] for no bar. */
const bar = (page: Page) => page.locator('main i[style*="--i:"]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).style.getPropertyValue('--share'))));
/** How tall the bar's segments stand: 8 (`lane`), or 24 (`lane-set`) when the task's laps are all in. */
const barHeight = (page: Page) => page.locator('main i[style*="--i:"]').first().evaluate((el) => el.getBoundingClientRect().height);
const digits = (page: Page) => page.locator('[class*="digits"]').first();

test('the bar is the task\'s: an estimate of 3 is three segments filling as each lap rings, standing tall on the result of the third; a fourth lap adds a segment and the bar is not tall again; no words count the laps', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  await a.page.setViewportSize(PHONE);
  await signedInto(a, 'taskbar', (node) => node.engine.write('task', 'essay', { title: 'essay', estimate: 3, order: 'V' }), { work_ms: 3000, short_ms: 60000, long_ms: 60000 });
  await expect.poll(() => bar(a.page)).toEqual([0, 0, 0]);
  await expect.poll(() => lapSaid(a.page)).toBe('');

  for (const lap of [1, 2, 3, 4]) {
    await (lap === 1 ? startButton(a.page) : startNow(a.page)).click();
    await expect(button(a.page, 'Pause')).toBeVisible();
    await expect.poll(() => lapSaid(a.page), { message: `lap ${lap} running` }).toBe('');
    // Past the estimate the lap in progress has a segment of its own.
    expect((await bar(a.page)).length, `segments during lap ${lap}`).toBe(Math.max(3, lap));
    await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
    const rung = Array.from({ length: Math.max(3, lap) }, (_, i) => (i < lap ? 1 : 0));
    await expect.poll(() => bar(a.page), { message: `the bar after lap ${lap} rang` }).toEqual(rung);
    await expect.poll(() => lapSaid(a.page), { message: `lap ${lap} rang` }).toBe('');
    // Tall only on the lap that brought the task to its estimate.
    await expect.poll(() => barHeight(a.page), { message: `the bar's height after lap ${lap}` }).toBe(lap === 3 ? 24 : 8);
  }
});

test('no estimate, no bar; a lap on nothing, no bar; the digits keep still from a task with a bar to one without and to nothing; a held lap says so under the digits, "paused since", and not in the first row', async ({ deviceA: a }) => {
  test.setTimeout(60000);
  await a.page.setViewportSize(PHONE);
  await signedInto(a, 'nobar', (node: Node) => {
    node.engine.write('task', 'alpha', { title: 'alpha', estimate: 2, order: 'V0' });
    node.engine.write('task', 'bravo', { title: 'bravo', order: 'V1' });
  });
  const lines = (title: string) => a.page.getByRole('button', { name: new RegExp(`^This lap is for ${title}\\.`) });
  const sheet = a.page.getByRole('dialog', { name: 'This lap is for' });
  // Whatever the lines name now: after a stop they go back to Today's next.
  const choose = async (to: string) => {
    await a.page.getByRole('button', { name: /^This lap is for / }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: new RegExp(`^${to}`) }).click();
    await expect(a.page.locator('dialog[open]')).toHaveCount(0);
    await expect(lines(to)).toBeVisible();
  };
  await expect.poll(() => bar(a.page)).toEqual([0, 0]);
  await settle(a.page);

  // A task with no estimate: no bar, and the digits where they were.
  await staysPut(a.page, digits(a.page), () => choose('bravo'));
  expect(await bar(a.page), 'a task with no estimate has a bar').toEqual([]);
  await expect.poll(() => lapSaid(a.page)).toBe('');
  // A lap for nothing in particular: no bar either, the digits still where they were.
  await staysPut(a.page, digits(a.page), () => choose('Nothing in particular'));
  expect(await bar(a.page), 'a lap on nothing has a bar').toEqual([]);
  // And back to the task with a bar.
  await staysPut(a.page, digits(a.page), () => choose('alpha'));
  expect(await bar(a.page)).toEqual([0, 0]);

  // A lap on nothing, running, held, running again.
  await choose('Nothing in particular');
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  expect(await bar(a.page), 'a running lap on nothing has a bar').toEqual([]);
  await expect.poll(() => lapSaid(a.page)).toBe('');
  await button(a.page, 'Pause').click();
  await expect(a.page.getByText(/^of \d\d:\d\d, paused since \d\d:\d\d$/).filter({ visible: true })).toBeVisible();
  await expect.poll(() => lapSaid(a.page), { message: 'a held lap is named in the first row' }).toBe('');
  await button(a.page, 'Resume').click();
  await expect.poll(() => lapSaid(a.page)).toBe('');
  await button(a.page, 'Stop').click();

  // A lap on the task with no estimate: still no bar while it runs.
  await choose('bravo');
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  expect(await bar(a.page), 'a running lap on a task with no estimate has a bar').toEqual([]);
  await button(a.page, 'Stop').click();
});

// 2. On Today the list answers before the release.

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox()) as Box;
const laterHead = (page: Page) => page.getByRole('heading', { name: /^Later today/ });
const rowsIn = (page: Page, heading: string) =>
  list(page, heading)
    .getByRole('checkbox', { name: /^Done: / })
    .evaluateAll((els) => els.filter((el) => !el.closest('[inert]')).map((el) => el.getAttribute('aria-label')!.slice('Done: '.length)));
const startOn = (page: Page, title: string) => taskRow(page, title).getByRole('button', { name: 'Start', exact: true });
const isNext = (page: Page, title: string) => taskRow(page, title).evaluate((row) => /(^| )_next_/.test(row.className));

/**
 * DESIGN.md: while a row is carried no two resting cards overlap, and the place it would land is
 * open; the carried card itself passes over whatever is under the finger, so it is left out.
 * Every pair of resting rows and headings on Today whose boxes overlap by more than a pixel, as
 * "a over b", and with `slot` every resting one that stands in that box, as "a in the slot".
 */
const overlaps = (page: Page, slot?: Box) =>
  page.evaluate((slot) => {
    const els = [...document.querySelectorAll<HTMLElement>('main [data-lift], main h2')].filter((el) => !el.closest('[inert]') && !el.hasAttribute('data-lifted') && el.checkVisibility({ opacityProperty: true }));
    const named = els.map((el) => ({ name: el.dataset.lift ?? `"${el.firstChild?.textContent?.trim()}"`, r: el.getBoundingClientRect() })).filter(({ r }) => r.width > 1 && r.height > 1);
    const over = (a: { top: number; bottom: number; left: number; right: number }, b: typeof a) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : 0;
    const out: string[] = [];
    for (const [i, a] of named.entries())
      for (const b of named.slice(i + 1)) if (over(a.r, b.r) > 1) out.push(`${a.name} over ${b.name} by ${Math.round(over(a.r, b.r))}px`);
    if (slot) {
      const box = { top: slot.y, bottom: slot.y + slot.height, left: slot.x, right: slot.x + slot.width };
      for (const a of named) if (over(a.r, box) > 1) out.push(`${a.name} in the slot by ${Math.round(over(a.r, box))}px`);
    }
    return out;
  }, slot);

/** Presses the row of `title` with the mouse and holds it past `motion.hold` (350ms), so it lifts. */
async function lift(page: Page, title: string) {
  const box = await boxOf(taskRow(page, title));
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await expect(page.locator('[data-lifted]')).toHaveCount(1);
  return { ...at, box };
}
/** Moves the row in the hand so the pointer is at `y`, and waits for the rows it passed to stand still. */
async function holdAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 14 });
  await page.waitForTimeout(150);
  await settle(page);
}
/** Where each of these rows and the "Later today" heading stand now. */
const where = async (page: Page, titles: string[]) => {
  const out: Record<string, Box> = {};
  for (const t of titles) out[t] = await boxOf(taskRow(page, t));
  out['Later today'] = await boxOf(laterHead(page));
  return out;
};
/** Fails for any of them, but `except`, that moved more than a pixel. */
const stoodStill = (before: Record<string, Box>, after: Record<string, Box>, what = 'letting go moved what the carry had already placed', except?: string) => {
  const moved = Object.keys(before).filter((k) => k !== except).flatMap((k) => {
    const [b, n] = [before[k]!, after[k]!];
    const by = Math.max(Math.abs(n.x - b.x), Math.abs(n.y - b.y), Math.abs(n.height - b.height));
    return by > 1 ? [`${k} moved ${Math.round(by * 10) / 10}px`] : [];
  });
  expect(moved, what).toEqual([]);
};

/** While a row is carried over the top place: still lifted, it has the Next card's Start, and the old Next is an ordinary row under "Later today". */
async function answered(page: Page, carried: string, oldNext: string) {
  // It keeps its lifted look while in the hand: the Next outline is drawn once it is let go.
  expect(await taskRow(page, carried).evaluate((row) => row.hasAttribute('data-lifted')), `${carried} over the top place is not drawn lifted`).toBe(true);
  await expect(startOn(page, carried), `${carried} over the top place has no Start`).toBeVisible();
  expect(await isNext(page, oldNext), `${oldNext} still wears the Next outline`).toBe(false);
  await expect(startOn(page, oldNext), `${oldNext} still has its Start`).toHaveCount(0);
  // The heading's place against the top place is the slot check in `overlaps`: the carried card may pass over it.
  const [head, o] = [await boxOf(laterHead(page)), await boxOf(taskRow(page, oldNext))];
  expect(head.y + head.height, `"Later today" is not over ${oldNext}`).toBeLessThanOrEqual(o.y + 1);
}

const SEED = (node: Node) => {
  node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
  node.engine.write('task', 'b', { title: 'bravo', order: 'B' });
  node.engine.write('task', 'c', { title: 'charlie', order: 'C' });
  node.engine.write('task', 'x', { title: 'xray', due: dayAfter(1), order: 'D' });
  node.engine.write('task', 'y', { title: 'yankee', due: dayAfter(2), order: 'E' });
};
const ALL = ['alpha', 'bravo', 'charlie', 'xray', 'yankee'];

async function onToday(a: { page: Page }, tag: string) {
  await a.page.setViewportSize(PHONE);
  await signedInto(a, tag, SEED);
  await go(a.page, 'Today');
  await expect.poll(() => rowsIn(a.page, 'Upcoming')).toEqual(['xray', 'yankee']);
  expect(await rowsIn(a.page, 'Next')).toEqual(['alpha']);
  expect(await rowsIn(a.page, 'Later today')).toEqual(['bravo', 'charlie']);
  await settle(a.page);
}

test('a Later row carried over the top place is Next before it is let go: its outline and Start, the old Next under "Later today", nothing overlapping; letting go moves nothing', async ({ deviceA: a }) => {
  await onToday(a, 'answer');
  const next = await boxOf(taskRow(a.page, 'alpha'));
  const held = await lift(a.page, 'charlie');
  // Held where the top place is: the row's top on the Next card's top.
  await holdAt(a.page, held.x, next.y + held.box.height / 2);
  await answered(a.page, 'charlie', 'alpha');
  expect(await overlaps(a.page, { ...next, height: held.box.height }), 'resting cards overlap, or the top place is not open, while a row is carried').toEqual([]);
  const during = await where(a.page, ALL);
  await a.page.mouse.up();
  await expect.poll(() => rowsIn(a.page, 'Next')).toEqual(['charlie']);
  expect(await rowsIn(a.page, 'Later today')).toEqual(['alpha', 'bravo']);
  await settle(a.page);
  stoodStill(during, await where(a.page, ALL));
  await expect(startOn(a.page, 'charlie')).toBeVisible();
  expect(await isNext(a.page, 'charlie'), 'set down at the top, charlie has not the Next outline').toBe(true);
});

test('an Upcoming row carried over the top place is Next before it is let go, and letting go moves nothing', async ({ deviceA: a }) => {
  await onToday(a, 'answerup');
  const next = await boxOf(taskRow(a.page, 'alpha'));
  const held = await lift(a.page, 'xray');
  await holdAt(a.page, held.x, next.y + held.box.height / 2);
  await answered(a.page, 'xray', 'alpha');
  expect(await overlaps(a.page, { ...next, height: held.box.height }), 'resting cards overlap, or the top place is not open, while a row is carried').toEqual([]);
  const during = await where(a.page, ALL);
  await a.page.mouse.up();
  await expect.poll(() => rowsIn(a.page, 'Next')).toEqual(['xray']);
  expect(await rowsIn(a.page, 'Later today')).toEqual(['alpha', 'bravo', 'charlie']);
  expect(await rowsIn(a.page, 'Upcoming')).toEqual(['yankee']);
  await settle(a.page);
  stoodStill(during, await where(a.page, ALL));
  expect(await isNext(a.page, 'xray'), 'set down at the top, xray has not the Next outline').toBe(true);
});

test('carried over the top place as a hand aims, at the Next card\'s middle: no resting cards overlap and the top place is open; carried back to where it was picked up before the release, the list is as it was, and letting go changes nothing', async ({ deviceA: a }) => {
  await onToday(a, 'answerback');
  const before = await where(a.page, ALL);
  const next = before.alpha!;
  const held = await lift(a.page, 'charlie');
  await holdAt(a.page, held.x, next.y + next.height / 2);
  await answered(a.page, 'charlie', 'alpha');
  expect(await overlaps(a.page, { ...next, height: held.box.height }), 'resting cards overlap, or the top place is not open, with the row at the Next card\'s middle').toEqual([]);

  // Back where it came from, still in the hand: the list is as it was, alpha Next again with its Start, over "Later today".
  await holdAt(a.page, held.x, held.y);
  stoodStill(before, await where(a.page, ALL), 'carried back to where it was picked up, the list is not as it was', 'charlie');
  expect(await isNext(a.page, 'alpha')).toBe(true);
  await expect(startOn(a.page, 'alpha')).toBeVisible();
  expect(await isNext(a.page, 'charlie')).toBe(false);
  await expect(startOn(a.page, 'charlie')).toHaveCount(0);
  const [alpha, head] = [await boxOf(taskRow(a.page, 'alpha')), await boxOf(laterHead(a.page))];
  expect(alpha.y + alpha.height, 'alpha is not over "Later today" again').toBeLessThanOrEqual(head.y + 1);
  expect(await overlaps(a.page, before.charlie)).toEqual([]);
  await a.page.mouse.up();
  await settle(a.page);
  expect(await rowsIn(a.page, 'Next')).toEqual(['alpha']);
  expect(await rowsIn(a.page, 'Later today')).toEqual(['bravo', 'charlie']);
  stoodStill(before, await where(a.page, ALL));
});

test('on its way up, before it is over the top place: the first Later row carried to just under the Next card may pass over "Later today", but no two resting cards or headings overlap and its own place stays open', async ({ deviceA: a }) => {
  await onToday(a, 'answerway');
  const next = await boxOf(taskRow(a.page, 'alpha'));
  const held = await lift(a.page, 'bravo');
  // Its top two pixels under the Next card: still its own place, over the heading's room.
  await holdAt(a.page, held.x, next.y + next.height + 2 + held.box.height / 2);
  await expect(startOn(a.page, 'bravo'), 'bravo took the top place too soon').toHaveCount(0);
  expect(await overlaps(a.page, held.box), 'resting cards overlap, or the carried row\'s place is not open, on its way up').toEqual([]);
  await a.page.mouse.up();
  await settle(a.page);
  expect(await rowsIn(a.page, 'Next')).toEqual(['alpha']);
});

test('a row carried to the top of Today is what Focus offers next: a lap on alpha stopped, bravo set down at the top, Focus names bravo and its Start begins a lap on it', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'carrynext', (node: Node) => {
    node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
    node.engine.write('task', 'b', { title: 'bravo', order: 'B' });
  });
  const lines = (title: string) => a.page.getByRole('button', { name: new RegExp(`^This lap is for ${title}\\.`) });
  await expect(lines('alpha')).toBeVisible();
  await startButton(a.page).click();
  await button(a.page, 'Stop').click();
  // The last lap's task is Focus's choice until something says otherwise.
  await expect(lines('alpha')).toBeVisible();

  await go(a.page, 'Today');
  await expect.poll(() => rowsIn(a.page, 'Later today')).toEqual(['bravo']);
  await settle(a.page);
  const next = await boxOf(taskRow(a.page, 'alpha'));
  const held = await lift(a.page, 'bravo');
  await holdAt(a.page, held.x, next.y + held.box.height / 2);
  await a.page.mouse.up();
  await expect.poll(() => rowsIn(a.page, 'Next')).toEqual(['bravo']);
  // The click a release would be is eaten for 300ms (lift.ts, CLICK): a person's next tap comes later.
  await a.page.waitForTimeout(400);

  await go(a.page, 'Focus');
  await expect(lines('bravo'), 'Focus kept the old lap\'s task over the one set down at the top').toBeVisible();
  await startButton(a.page).click();
  await expect.poll(async () => ((await serverRows(server, name, 'timer')).get('current')?.state as { task?: string } | undefined)?.task).toBe('b');
});

// 3. Focus's first row stands where Today's heading does.

test('Focus\'s first row starts at the top Today\'s heading starts at: 56px at 412 wide and 32px at 1440, before a lap and in a break, where it names the break', async ({ deviceA: a }) => {
  test.setTimeout(60000);
  await signedInto(a, 'firstrow', (node: Node) => node.engine.write('task', 'essay', { title: 'essay', estimate: 2, order: 'V' }), { work_ms: 3000, short_ms: 60000 });
  const top = async (locator: ReturnType<Page['locator']>) => Math.round((await boxOf(locator)).y);
  for (const [size, at] of [[PHONE, 56], [{ width: 1440, height: 900 }, 32]] as const) {
    await a.page.setViewportSize(size);
    await go(a.page, 'Today');
    await settle(a.page);
    expect(await top(a.page.getByRole('heading', { level: 1 })), `Today's heading at ${size.width}`).toBe(at);
    await go(a.page, 'Focus');
    await settle(a.page);
    await expect(firstRow(a.page)).toContainText('Change task');
    expect(await top(firstRow(a.page)), `Focus's first row at ${size.width}`).toBe(at);
  }
  await a.page.setViewportSize(PHONE);
  await startButton(a.page).click();
  await expect(button(a.page, 'Start 1 min break')).toBeVisible({ timeout: 8000 });
  await button(a.page, 'Start 1 min break').click();
  await expect.poll(() => lapSaid(a.page)).toBe('Short break');
  await settle(a.page);
  expect(await top(firstRow(a.page)), 'Focus\'s first row in a break').toBe(56);
});

// 4. Today's day bar fills as the lap runs.

/** Today's day-target bar as drawn: how full each segment is. */
const dayBar = (page: Page) =>
  page
    .getByRole('group', { name: 'Day target' })
    .locator('[aria-hidden="true"] > i')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).style.getPropertyValue('--share'))));

test('the day bar fills as the lap runs: with a target of 4, a 2 minute lap grows Today\'s first segment while it runs; stopped past its first minute it stays part filled and does not empty, at the same share as Focus\'s task bar', async ({ deviceA: a }) => {
  test.setTimeout(150000);
  await a.page.setViewportSize(PHONE);
  await signedInto(
    a,
    'daybar',
    (node: Node) => {
      node.engine.write('settings', 'current', { day_target: 4 });
      node.engine.write('task', 'essay', { title: 'essay', estimate: 4, order: 'V' });
    },
    { work_ms: 120000 },
  );
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  await go(a.page, 'Today');
  await expect.poll(async () => (await dayBar(a.page)).length).toBe(4);
  await expect.poll(async () => (await dayBar(a.page))[0], { message: 'the running lap does not fill its segment', timeout: 6000 }).toBeGreaterThan(0);
  const early = (await dayBar(a.page))[0]!;
  await expect.poll(async () => (await dayBar(a.page))[0], { message: 'the running lap\'s segment stopped growing', timeout: 6000 }).toBeGreaterThan(early);
  expect((await dayBar(a.page)).slice(1), 'the laps to come are drawn').toEqual([0, 0, 0]);

  // Past the first minute, stopped on Focus: a lap, kept as far as it ran.
  await expect(strip(a.page).locator('b')).toHaveText('00:55', { timeout: 80000 });
  await go(a.page, 'Focus');
  await button(a.page, 'Stop').click();
  await expect(startButton(a.page)).toBeVisible();
  const [focus] = await bar(a.page);
  expect(focus, 'Focus\'s task bar after the stop').toBeGreaterThan(0.5);
  expect(focus).toBeLessThan(0.7);
  await go(a.page, 'Today');
  await expect.poll(async () => (await dayBar(a.page))[0], { message: 'Today\'s day bar is not at Focus\'s share' }).toBeCloseTo(focus!, 2);
  await a.page.waitForTimeout(1500);
  expect((await dayBar(a.page))[0], 'the stopped lap\'s segment emptied').toBeCloseTo(focus!, 2);
});

// 5. While a lap runs, its task is in the strip and nowhere else on Today.

for (const [tag, orders, when] of [
  ['runcarry', { a: 'A', b: 'B', c: 'C' }, 'the running task second'],
  ['runfirst', { a: 'B', b: 'A', c: 'C' }, 'the running task first in the list order'],
] as const) {
  test(`while a lap runs on bravo (${when}), bravo is in the strip only; charlie carried over the Next place is Next before the release and alpha goes under "Later today"; letting go moves nothing, the server puts charlie before alpha, and the lap stopped brings bravo's row back to its place`, async ({ deviceA: a }) => {
    await a.page.setViewportSize(PHONE);
    const { name } = await signedInto(a, tag, (node: Node) => {
      node.engine.write('task', 'a', { title: 'alpha', order: orders.a });
      node.engine.write('task', 'b', { title: 'bravo', order: orders.b });
      node.engine.write('task', 'c', { title: 'charlie', order: orders.c });
    });
    // A lap on bravo, chosen on Focus.
    await a.page.getByRole('button', { name: /^This lap is for / }).click();
    await a.page.getByRole('dialog', { name: 'This lap is for' }).getByRole('button', { name: /^bravo/ }).click();
    await expect(a.page.getByRole('button', { name: /^This lap is for bravo\./ })).toBeVisible();
    await startButton(a.page).click();
    await expect(button(a.page, 'Pause')).toBeVisible();
    await go(a.page, 'Today');
    const lapStrip = strip(a.page);
    await expect(lapStrip).toContainText('bravo');
    await expect.poll(() => rowsIn(a.page, 'Next')).toEqual(['alpha']);
    expect(await rowsIn(a.page, 'Later today')).toEqual(['charlie']);
    await expect(taskRow(a.page, 'bravo'), 'the running task has a row on Today as well as the strip').toHaveCount(0);
    await settle(a.page);

    const two = ['alpha', 'charlie'];
    const next = await boxOf(taskRow(a.page, 'alpha'));
    const held = await lift(a.page, 'charlie');
    await holdAt(a.page, held.x, next.y + held.box.height / 2);
    expect(await isNext(a.page, 'charlie'), 'charlie over the Next place has not the Next outline').toBe(true);
    expect(await isNext(a.page, 'alpha'), 'alpha still wears the Next outline').toBe(false);
    const [head, alpha] = [await boxOf(laterHead(a.page)), await boxOf(taskRow(a.page, 'alpha'))];
    expect(head.y + head.height, '"Later today" is not over alpha').toBeLessThanOrEqual(alpha.y + 1);
    expect(await overlaps(a.page, { ...next, height: held.box.height }), 'resting cards overlap, or the Next place is not open').toEqual([]);
    await expect(lapStrip).toContainText('bravo');
    const during = await where(a.page, two);

    await a.page.mouse.up();
    await expect.poll(() => rowsIn(a.page, 'Next')).toEqual(['charlie']);
    expect(await rowsIn(a.page, 'Later today')).toEqual(['alpha']);
    await settle(a.page);
    stoodStill(during, await where(a.page, two));
    await expect(taskRow(a.page, 'bravo')).toHaveCount(0);
    await expect(lapStrip).toContainText('bravo');
    const rows = async () => (await serverRows(server, name, 'task')) as Map<string, { title?: string; order?: string }>;
    await expect.poll(async () => {
      const r = await rows();
      return r.get('c')!.order! < r.get('a')!.order!;
    }, { message: 'the server does not put charlie before alpha' }).toBe(true);

    // The lap stopped: bravo's row is back, in its place by the list's order.
    await a.page.waitForTimeout(400);
    await go(a.page, 'Focus');
    await button(a.page, 'Stop').click();
    await go(a.page, 'Today');
    await expect(taskRow(a.page, 'bravo')).toBeVisible();
    const byOrder = [...(await rows()).values()].sort((x, y) => (x.order! < y.order! ? -1 : 1)).map((t) => t.title);
    await expect.poll(() => titles(a.page)).toEqual(byOrder);
  });
}

test('a running task deleted from its sheet, opened by its title in Today\'s strip: the lap goes on and is still named, in the strip and on Focus; Undo from the bar, and once the lap rings its row is back on Today with the lap', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  await a.page.setViewportSize(PHONE);
  await signedInto(
    a,
    'rundel',
    (n: Node) => {
      n.engine.write('project', 'thesis', { name: 'Thesis', color: 'you', order: 'V' });
      n.engine.write('task', 't', { title: 'chapter 2', project: 'thesis', estimate: 2, order: 'V' });
      n.engine.write('task', 'o', { title: 'other', order: 'W' });
    },
    { work_ms: 20000, short_ms: 5 * 60000 },
  );
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  await go(a.page, 'Today');
  const lapStrip = strip(a.page);
  await expect(lapStrip).toContainText('chapter 2');
  // The strip's title opens the running task's sheet: its row is nowhere else on Today.
  await a.page.getByRole('button', { name: 'chapter 2', exact: true }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Task' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  const bar = a.page.getByRole('status').filter({ hasText: 'Deleted: chapter 2' });
  await expect(bar.locator('p').first()).toBeVisible();
  // The lap goes on, on the task it was for.
  await expect(lapStrip, 'the lap stopped, or lost its task, when the task was deleted').toContainText('chapter 2');
  await expect(a.page.getByRole('button', { name: /^Recently deleted, 1/ })).toBeVisible();
  await bar.getByRole('button', { name: 'Undo' }).click();
  await expect(a.page.getByRole('button', { name: /^Recently deleted/ })).toHaveCount(0);
  await expect(lapStrip).toContainText('chapter 2');
  await go(a.page, 'Focus');
  await expect(a.page.locator('main')).toContainText('chapter 2');
  await expect(firstRow(a.page)).toContainText('Thesis');
  await expect(startNow(a.page)).toBeVisible({ timeout: 30000 });
  await go(a.page, 'Today');
  await expect(taskRow(a.page, 'chapter 2')).toBeVisible();
  await expect(taskRow(a.page, 'chapter 2')).toContainText('1 of 2');
});

test('a task deleted on another device while its lap runs keeps its lap: named with its project on Focus, in the strip and in Progress\'s day list, its minute in its project\'s total, while it is in Recently deleted; restored, it is back on Today; purged, its lap stays in the project\'s total', async ({ deviceA: a }) => {
  test.setTimeout(150000);
  await a.page.setViewportSize(PHONE);
  const { name, node } = await signedInto(
    a,
    'rungone',
    (n: Node) => {
      n.engine.write('project', 'thesis', { name: 'Thesis', color: 'you', order: 'V' });
      n.engine.write('task', 't', { title: 'chapter 2', project: 'thesis', estimate: 2, order: 'V' });
      n.engine.write('task', 'o', { title: 'other', order: 'W' });
    },
    { work_ms: 60000, short_ms: 5 * 60000 },
  );
  await expect(a.page.getByRole('button', { name: /^This lap is for chapter 2\./ })).toBeVisible();
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  // Deleted from the account's other device while the lap runs.
  node.engine.write('task', 't', { deleted: node.engine.now() });
  await go(a.page, 'Today');
  await expect(a.page.getByRole('button', { name: /^Recently deleted, 1/ })).toBeVisible({ timeout: 5000 });
  const lapStrip = strip(a.page);
  await expect(lapStrip, 'the strip lost the deleted task\'s name').toContainText('chapter 2');
  await go(a.page, 'Focus');
  await expect(a.page.locator('main')).toContainText('chapter 2');
  await expect(firstRow(a.page), 'Focus lost the deleted task\'s project').toContainText('Thesis');

  // The bell: the lap is the task's, deleted or not.
  await expect(startNow(a.page)).toBeVisible({ timeout: 80000 });
  await expect.poll(async () => [...(await serverRows(server, name, 'session')).values()].filter((r) => r.kind === 'work' && r.task === 't').length).toBe(1);
  await go(a.page, 'Progress');
  const day = a.page.locator('section').filter({ has: a.page.getByRole('heading', { name: 'Today, hour by hour', level: 2 }) });
  await expect(day, 'Progress\'s day list does not name the deleted task').toContainText('chapter 2');
  const projects = a.page.locator('section').filter({ has: a.page.getByRole('heading', { name: 'Last 7 days by project', level: 2 }) });
  await expect(projects.getByRole('listitem').filter({ hasText: 'Thesis' }), 'the project\'s total lost the deleted task\'s lap').toContainText('1 lap');

  // Restored from Recently deleted: back on Today.
  await go(a.page, 'Today');
  await button(a.page, 'Recently deleted, 1').click();
  await a.page.getByRole('dialog', { name: 'Recently deleted' }).getByRole('button', { name: 'Restore' }).click();
  await expect(taskRow(a.page, 'chapter 2')).toBeVisible();
  await expect(taskRow(a.page, 'chapter 2')).toContainText('1 of 2');

  // Deleted again and then for good: its lap stays in its project's total.
  await taskRow(a.page, 'chapter 2').getByRole('button', { name: /chapter 2/ }).click();
  await a.page.getByRole('dialog', { name: 'Task' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await button(a.page, 'Recently deleted, 1').click();
  const bin = a.page.getByRole('dialog', { name: 'Recently deleted' });
  await bin.getByRole('button', { name: 'Delete for good', exact: true }).click();
  await bin.getByRole('button', { name: 'Delete for good?', exact: true }).click();
  await expect(a.page.getByRole('button', { name: /^Recently deleted/ })).toHaveCount(0);
  await go(a.page, 'Progress');
  await expect(projects.getByRole('listitem').filter({ hasText: 'Thesis' }), 'a purged task\'s lap left its project\'s total').toContainText('1 lap');
});
