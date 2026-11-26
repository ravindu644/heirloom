// What the user's fifth hour found (roadmap section 17), each as the person meets it, at 412x915:
// Focus's bar is the task's laps and nothing over it explains them, and on Today a carried row
// takes the Next card's place before it is let go, so letting go moves nothing.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import { serverRows } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { go, lapLine, list, server, settle, signedInto, startButton, startNow, staysPut, taskRow } from './app.ts';
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

test('the bar is the task\'s: an estimate of 3 is three segments filling as each lap rings, standing tall on the result of the third; a fourth lap adds a segment and the bar is not tall again; nothing is said over it', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  await a.page.setViewportSize(PHONE);
  await signedInto(a, 'taskbar', (node) => node.engine.write('task', 'essay', { title: 'essay', estimate: 3, order: 'V' }), { work_ms: 3000, short_ms: 60000, long_ms: 60000 });
  await expect.poll(() => bar(a.page)).toEqual([0, 0, 0]);
  await expect(lapLine(a.page)).toHaveText('');

  for (const lap of [1, 2, 3, 4]) {
    await (lap === 1 ? startButton(a.page) : startNow(a.page)).click();
    await expect(button(a.page, 'Pause')).toBeVisible();
    await expect(lapLine(a.page), `lap ${lap} running`).toHaveText('');
    // Past the estimate the lap in progress has a segment of its own.
    expect((await bar(a.page)).length, `segments during lap ${lap}`).toBe(Math.max(3, lap));
    await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
    const rung = Array.from({ length: Math.max(3, lap) }, (_, i) => (i < lap ? 1 : 0));
    await expect.poll(() => bar(a.page), { message: `the bar after lap ${lap} rang` }).toEqual(rung);
    await expect(lapLine(a.page), `lap ${lap} rang`).toHaveText('');
    // Tall only on the lap that brought the task to its estimate.
    await expect.poll(() => barHeight(a.page), { message: `the bar's height after lap ${lap}` }).toBe(lap === 3 ? 24 : 8);
  }
});

test('no estimate, no bar; a lap on nothing, no bar; the digits keep still from a task with a bar to one without and to nothing; a held lap says so under the digits, "paused since", and nothing over the bar', async ({ deviceA: a }) => {
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
  await expect(lapLine(a.page)).toHaveText('');
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
  await expect(lapLine(a.page)).toHaveText('');
  await button(a.page, 'Pause').click();
  await expect(a.page.getByText(/^of \d\d:\d\d, paused since \d\d:\d\d$/).filter({ visible: true })).toBeVisible();
  await expect(lapLine(a.page), 'a held lap is named over the bar').toHaveText('');
  await button(a.page, 'Resume').click();
  await expect(lapLine(a.page)).toHaveText('');
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
