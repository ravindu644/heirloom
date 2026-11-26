// What the user's second hour and a stranger's walk changed (roadmap section 12), each written to
// fail on the old behaviour, and each tried one step to the side of where it was fixed: on a
// second device, after a reload, in a sheet, at the end of a page, at the top of a number.
import type { CDPSession, Page } from '@playwright/test';
import { hueHex } from '../../client/src/ui/kit/hue.ts';
import { serverRows } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { colourOf, go, list, quickAdd, ready, selectable, server, sessionsWhen, settle, signedInto, signIn, squaresOf, startButton, startNow, strip, taskRow, titles } from './app.ts';
import { expect, test } from './devices.ts';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** Marks the task a lap runs on done, from its sheet, opened by its title in Today's strip. */
async function markRunningDone(page: Page, title: string) {
  await strip(page).getByRole('button', { name: title, exact: true }).click();
  await page.getByRole('dialog', { name: 'Task' }).getByRole('button', { name: 'Mark done', exact: true }).click();
}
const timer = async (name: string) => (await serverRows(server, name, 'timer')).get('current')?.state as { phase: string; run: string | null; set_index: number } | undefined;
const tasks = (...names: string[]) => (node: Node) => names.forEach((title, i) => node.engine.write('task', `t${i}`, { title, order: `V${String(i).padStart(2, '0')}` }));

// The set of four on Focus, as drawn: how full each segment is.
const setBar = (page: Page) => page.locator('main i[style*="--i:"]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).style.getPropertyValue('--share'))));

/** A second browser of the same account, on the given screen. */
async function also(d: { page: Page }, name: string) {
  await signIn(d.page, name);
  await ready(d.page);
}

// 1. One Stop.

test('Stop past the first minute: the lap is kept, the task\'s first segment stays part filled after a reload and on a second device; a stop in the first seconds is a start taken back, no row, nothing drawn', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(150000);
  // A task with an estimate of 4, so Focus draws a bar: the task's laps. A lap of two minutes,
  // stopped a little over one in: past the minute a stopped lap is a lap (protocol section 6).
  const { name } = await signedInto(a, 'onestop', (node) => node.engine.write('task', 'proofs', { title: 'proofs', estimate: 4, order: 'V' }), { work_ms: 120000 });
  await also(b, name);
  await startButton(a.page).click();
  await expect(a.page.getByText('00:55', { exact: true })).toBeVisible({ timeout: 80000 });
  await expect(button(a.page, 'Stop + log')).toHaveCount(0);
  await button(a.page, 'Stop').click();
  await ready(a.page);
  await expect(a.page.getByText('Lap 1 today stopped at 1 min.').filter({ visible: true })).toBeVisible();
  await expect(button(a.page, "Don't count this lap")).toHaveCount(0);
  const [fill] = await setBar(a.page);
  expect(fill, 'the stopped lap is drawn as far as it ran').toBeGreaterThan(0.5);
  expect(fill).toBeLessThan(0.7);
  const rows = await sessionsWhen(name, (r) => r.length === 1);
  expect(rows[0]).toMatchObject({ outcome: 'stopped', kind: 'work' });

  await ready(b.page);
  await expect.poll(async () => (await setBar(b.page))[0]).toBeCloseTo(fill!, 2);
  await a.page.reload();
  await ready(a.page);
  await expect.poll(async () => (await setBar(a.page))[0]).toBeCloseTo(fill!, 2);

  // The next lap stopped in its first second: a start taken back. No row, nothing drawn.
  await startButton(a.page).click();
  await button(a.page, 'Stop').click();
  await expect(a.page.getByText('Stopped in its first minute. Not counted as a lap.').filter({ visible: true })).toBeVisible();
  for (const d of [a, b]) {
    await ready(d.page);
    expect((await setBar(d.page))[1] ?? 0, 'a start taken back is drawn').toBe(0);
  }
  await b.page.waitForTimeout(1000);
  expect(await sessionsWhen(name, (r) => r.length === 1)).toHaveLength(1);
  expect((await timer(name))?.set_index).toBe(1);
});

test('ticking the running task ends its lap: the timer is at rest, the lap is a part square on the task, and the one Undo brings back both, the same run', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(150000);
  // Ticked a little over a minute in: under a minute it would be a start taken back, and no lap at all.
  const { name } = await signedInto(a, 'tickrun', tasks('alpha'), { work_ms: 180000 });
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Today');
  await list(a.page, 'Next').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(strip(b.page)).toContainText('alpha', { timeout: 2000 });
  const run = (await timer(name))!.run;
  await expect(strip(a.page).locator('b')).toHaveText('01:58', { timeout: 80000 });
  // The running task is in the strip and no list: its title opens its sheet, where it is marked done.
  await markRunningDone(a.page, 'alpha');

  for (const d of [a, b]) await expect(strip(d.page), 'the lap kept running for a ticked task').toHaveCount(0, { timeout: 3000 });
  await expect.poll(async () => (await timer(name))?.phase).toBe('idle');
  const bar = a.page.getByRole('status').filter({ hasText: 'Done: alpha' });
  await expect(bar).toContainText('Done: alpha. Lap 1 today stopped at 1 min.');
  const [square] = await squaresOf(taskRow(a.page, 'alpha'));
  expect(square, 'the lap is not on the task as a part square').toBeGreaterThan(0);
  expect(square).toBeLessThan(0.5);

  await bar.getByRole('button', { name: 'Undo' }).click();
  for (const d of [a, b]) await expect(strip(d.page)).toContainText('alpha', { timeout: 3000 });
  await expect(list(a.page, 'Done')).toHaveCount(0);
  const back = (await timer(name))!;
  expect(back).toMatchObject({ phase: 'work', run });
  // The same run: its time left goes on from where it was, not from a fresh 03:00.
  const left = await strip(a.page).locator('b').innerText();
  expect(left <= '01:58', `the strip says ${left}`).toBe(true);
});

test('"Done for now" after a bell and in a break: the timer rests, nothing starts, and the next lap is the right one', async ({ deviceA: a }) => {
  const { name } = await signedInto(a, 'donefornow', undefined, { work_ms: 3000, short_ms: 60000 });
  await startButton(a.page).click();
  await expect(button(a.page, 'Start 1 min break')).toBeVisible({ timeout: 8000 });
  await expect(button(a.page, 'Skip break')).toHaveCount(0);
  await expect(startNow(a.page)).toBeVisible();
  await button(a.page, 'Done for now').click();
  await ready(a.page);
  await expect(a.page.getByText('Stopped after lap 1 today.').filter({ visible: true })).toBeVisible();
  await a.page.waitForTimeout(1500);
  await ready(a.page);
  await expect.poll(async () => (await timer(name))?.phase).toBe('idle');
  expect((await timer(name))?.set_index).toBe(1);

  await startButton(a.page).click();
  await expect(button(a.page, 'Start 1 min break')).toBeVisible({ timeout: 8000 });
  await button(a.page, 'Start 1 min break').click();
  await expect(startNow(a.page)).toBeVisible();
  await button(a.page, 'Done for now').click();
  await ready(a.page);
  await expect(a.page.getByText('Stopped after lap 2 today.').filter({ visible: true })).toBeVisible();
  await a.page.waitForTimeout(1500);
  await ready(a.page);
  await expect.poll(async () => (await timer(name))?.phase).toBe('idle');
  expect((await timer(name))?.set_index).toBe(2);
  // Two laps that rang, and the break that was cut in its first seconds leaves nothing.
  const rows = await sessionsWhen(name, (r) => r.length >= 2);
  expect(rows.map((r) => `${r.kind} ${r.outcome}`).sort()).toEqual(['work rang', 'work rang']);
});

// 2. Rows put in order by hand.

/** A touch, as a finger makes it: down at one point, held, moved in steps, lifted. */
async function touchDrag(cdp: CDPSession, x: number, from: number, to: number, holdMs: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
  await new Promise((r) => setTimeout(r, holdMs));
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + ((to - from) * i) / 12 }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 100));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const middle = async (page: Page, title: string) => {
  const box = (await taskRow(page, title).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, bottom: box.y + box.height };
};

test('press and hold moves a row, with the mouse and with a finger; a tap still opens, a swipe still scrolls; Alt and the arrows; the order holds on a second device', async ({ deviceA: a, deviceB: b }) => {
  const many = ['alpha', 'bravo', 'charlie', ...Array.from({ length: 11 }, (_, i) => `more ${i + 1}`)];
  const { name } = await signedInto(a, 'hold', tasks(...many));
  await also(b, name);
  await a.page.setViewportSize({ width: 412, height: 915 });
  for (const d of [a, b]) await go(d.page, 'Today');
  await expect.poll(() => titles(b.page)).toEqual(many);
  await expect(button(a.page, 'Change the order')).toHaveCount(0);
  await expect(a.page.getByText('Press and hold a task to move it.')).toBeVisible();

  // The mouse: bravo held, carried below charlie, let go.
  const bravo = await middle(a.page, 'bravo');
  const charlie = await middle(a.page, 'charlie');
  await a.page.mouse.move(bravo.x, bravo.y);
  await a.page.mouse.down();
  await a.page.waitForTimeout(500);
  await a.page.mouse.move(bravo.x, charlie.bottom + 4, { steps: 12 });
  await a.page.waitForTimeout(100);
  await a.page.mouse.up();
  await expect.poll(() => titles(a.page)).toEqual(['alpha', 'charlie', 'bravo', ...many.slice(3)]);
  await expect(a.page.locator('dialog[open]'), 'letting go opened the row').toHaveCount(0);
  await expect.poll(() => titles(b.page), { timeout: 2000 }).toEqual(['alpha', 'charlie', 'bravo', ...many.slice(3)]);
  await expect(a.page.getByText('Press and hold a task to move it.')).toHaveCount(0);

  // A finger: alpha held and carried below bravo.
  const cdp = await a.page.context().newCDPSession(a.page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const alpha = await middle(a.page, 'alpha');
  await touchDrag(cdp, alpha.x, alpha.y, (await middle(a.page, 'bravo')).bottom + 4, 500);
  await expect.poll(() => titles(a.page)).toEqual(['charlie', 'bravo', 'alpha', ...many.slice(3)]);
  await expect.poll(() => titles(b.page), { timeout: 2000 }).toEqual(['charlie', 'bravo', 'alpha', ...many.slice(3)]);

  // A swipe that does not wait scrolls the page and moves nothing.
  const scroller = a.page.locator('main');
  await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
  await settle(a.page);
  const top = await scroller.evaluate((el) => el.scrollTop);
  const from = await middle(a.page, 'more 3');
  await touchDrag(cdp, from.x, from.y, from.y - 300, 0);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop), { message: 'a swipe did not scroll' }).toBeGreaterThan(top + 100);
  expect(await titles(a.page)).toEqual(['charlie', 'bravo', 'alpha', ...many.slice(3)]);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp.detach();

  // A short tap still opens the row.
  await taskRow(a.page, 'bravo').getByRole('button', { name: /bravo/ }).click();
  await expect(a.page.getByRole('dialog', { name: 'Task', exact: true })).toBeVisible();
  await a.page.keyboard.press('Escape');
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);

  // The keyboard: Alt and up moves the row with the focus by one place, and says where it stands.
  await taskRow(a.page, 'alpha').getByRole('button', { name: /alpha/ }).focus();
  await a.page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => titles(a.page)).toEqual(['charlie', 'alpha', 'bravo', ...many.slice(3)]);
  await expect(a.page.getByRole('status').filter({ hasText: 'alpha: now 2 of 14.' })).toHaveCount(1);
  await expect(taskRow(a.page, 'alpha').getByRole('button', { name: /alpha/ }), 'the moved row lost the focus').toBeFocused();
  await a.page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => titles(b.page), { timeout: 2000 }).toEqual(['alpha', 'charlie', 'bravo', ...many.slice(3)]);
  await b.page.reload();
  await expect.poll(() => titles(b.page)).toEqual(['alpha', 'charlie', 'bravo', ...many.slice(3)]);
});

test('Habits: press and hold moves a habit, Alt and the arrows too, and the order holds on a second device', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'holdh');
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Habits');
  const add = a.page.getByLabel('Add a habit', { exact: true });
  for (const t of ['alpha', 'bravo', 'charlie']) {
    await add.fill(t);
    await add.press('Enter');
  }
  const habits = (page: Page) => page.getByRole('checkbox', { name: /^Check in: / }).evaluateAll((els) => els.filter((el) => !el.closest('[inert]')).map((el) => el.getAttribute('aria-label')!.slice('Check in: '.length)));
  await expect.poll(() => habits(b.page)).toEqual(['alpha', 'bravo', 'charlie']);
  await expect(button(a.page, 'Change the order')).toHaveCount(0);
  const row = (title: string) => a.page.getByRole('checkbox', { name: `Check in: ${title}`, exact: true }).locator('xpath=..');
  const from = (await row('alpha').boundingBox())!;
  const to = (await row('bravo').boundingBox())!;
  await a.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await a.page.mouse.down();
  await a.page.waitForTimeout(500);
  await a.page.mouse.move(from.x + from.width / 2, to.y + to.height + 4, { steps: 12 });
  await a.page.waitForTimeout(100);
  await a.page.mouse.up();
  await expect.poll(() => habits(a.page)).toEqual(['bravo', 'alpha', 'charlie']);
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  await row('charlie').getByRole('button', { name: /charlie/ }).focus();
  await a.page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => habits(a.page)).toEqual(['bravo', 'charlie', 'alpha']);
  await expect.poll(() => habits(b.page), { timeout: 2000 }).toEqual(['bravo', 'charlie', 'alpha']);
});

// 3. A page is never scrolled past its content, and one that fits is never scrolled.

/** Where main is scrolled, and how much of the bottom of its window shows nothing at all. */
const page_ = (page: Page) =>
  page.locator('main').evaluate((main) => {
    // The lowest thing drawn: an element clipped by a box that hides its overflow counts only as
    // far as that box, and one too small to see (a line for a screen reader) not at all.
    let bottom = -Infinity;
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.height < 2 || r.width < 2 || el.closest('[inert]')) continue;
      let shown = r.bottom;
      for (let up = el.parentElement; up && up !== main; up = up.parentElement) {
        if (getComputedStyle(up).overflowY !== 'visible') shown = Math.min(shown, up.getBoundingClientRect().bottom);
      }
      bottom = Math.max(bottom, shown);
    }
    return { top: main.scrollTop, doc: document.scrollingElement!.scrollTop, fits: main.scrollHeight <= main.clientHeight, blank: Math.round(main.getBoundingClientRect().bottom - bottom) };
  });

test('a page that fits is at the top after every tap on Today, Habits and Settings; at the end of a long page no tap leaves a blank end', async ({ deviceA: a }) => {
  // Tall enough that every page fits: Settings at 412 wide is 2288px since About was added.
  await a.page.setViewportSize({ width: 412, height: 3000 });
  await signedInto(a, 'fits', tasks('alpha', 'bravo'));
  const unmoved = async (what: string) => {
    await settle(a.page);
    const at = await page_(a.page);
    expect(at.fits, `the page no longer fits after ${what}`).toBe(true);
    expect([at.top, at.doc], `scrolled after ${what}`).toEqual([0, 0]);
  };
  await go(a.page, 'Today');
  await unmoved('opening Today');
  const target = a.page.getByRole('group', { name: 'Day target' });
  const taps: [string, () => Promise<unknown>][] = [
    ['a tick', () => taskRow(a.page, 'alpha').getByRole('checkbox').click()],
    ['an untick', () => taskRow(a.page, 'alpha').getByRole('checkbox').click()],
    ['Set a day target', () => target.getByRole('button', { name: 'Set a day target' }).click()],
    ['one lap more', () => target.getByRole('button', { name: 'One lap more' }).click()],
    ['Done in the editor', () => button(target as never, 'Done').click()],
    ['Change', () => target.getByRole('button', { name: 'Change' }).click()],
    ['Remove the day target', () => target.getByRole('button', { name: 'Remove the day target' }).click()],
    ['a quick add', () => quickAdd(a.page, 'charlie')],
    ['a sheet opened', () => taskRow(a.page, 'bravo').getByRole('button', { name: /bravo/ }).click()],
    ['a sheet closed', () => a.page.getByRole('dialog', { name: 'Task', exact: true }).getByRole('button', { name: 'Close' }).click()],
    ['a delete from the sheet', async () => {
      await expect(a.page.locator('dialog')).toHaveCount(0);
      await taskRow(a.page, 'charlie').getByRole('button', { name: /charlie/ }).click();
      await a.page.getByRole('dialog', { name: 'Task', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    }],
    ['its Undo', () => a.page.getByRole('status').filter({ hasText: 'Deleted: charlie' }).getByRole('button', { name: 'Undo' }).click()],
  ];
  for (const [what, tap] of taps) {
    await tap();
    await unmoved(what);
  }

  await go(a.page, 'Habits');
  const add = a.page.getByLabel('Add a habit', { exact: true });
  await add.fill('read');
  await add.press('Enter');
  await unmoved('adding a habit');
  await a.page.getByRole('checkbox', { name: 'Check in: read', exact: true }).click();
  await unmoved('a check-in');
  await a.page.getByRole('status').filter({ hasText: 'read' }).getByRole('button', { name: 'Undo' }).click();
  await unmoved('its Undo');

  await a.page.getByRole('link', { name: /Settings/ }).first().click();
  await expect(a.page.getByRole('checkbox').first()).toBeVisible();
  await unmoved('opening Settings');
  for (const one of await a.page.getByRole('checkbox').all()) {
    await one.click();
    await unmoved(`the switch "${await one.getAttribute('aria-label') ?? await one.innerText()}"`);
    await one.click();
    await unmoved('the switch thrown back');
  }

  // The end of a long page: a blank end is never more than the page's own foot.
  await a.page.setViewportSize({ width: 412, height: 915 });
  await go(a.page, 'Today');
  for (let i = 0; i < 12; i++) await quickAdd(a.page, `long ${i + 1}`);
  // Scrolled as a person scrolls, with the wheel: a scroll set from script would be undone by the
  // hold of the last tap (an Enter in quick add is a click on its Add), which lets go only for a
  // person's own scroll.
  const toEnd = async () => {
    await a.page.mouse.move(206, 450);
    await expect
      .poll(async () => {
        await a.page.mouse.wheel(0, 4000);
        await settle(a.page);
        return a.page.locator('main').evaluate((m) => m.scrollHeight - m.clientHeight - m.scrollTop);
      }, { message: 'not at the end of the page' })
      .toBeLessThanOrEqual(1);
  };
  await toEnd();
  await settle(a.page);
  const foot = (await page_(a.page)).blank;
  const ends: [string, () => Promise<unknown>][] = [
    ['ticking the last row', () => taskRow(a.page, 'long 12').getByRole('checkbox').click()],
    ['unticking it in Done', () => taskRow(a.page, 'long 12').getByRole('checkbox').click()],
    ['deleting the last row', async () => {
      await taskRow(a.page, 'long 12').getByRole('button', { name: /long 12/ }).click();
      await a.page.getByRole('dialog', { name: 'Task', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
    }],
    ['ticking the row above it', () => taskRow(a.page, 'long 11').getByRole('checkbox').click()],
  ];
  for (const [what, tap] of ends) {
    await toEnd();
    await tap();
    await settle(a.page);
    const at = await page_(a.page);
    expect(at.blank, `after ${what}, ${at.blank}px of nothing below the last thing on the page (its foot is ${foot}px)`).toBeLessThanOrEqual(foot + 1);
    expect(at.doc).toBe(0);
  }
});

// 4. Inside a sheet.

/** What a triple click selects: the user's own test of "nothing selects". */
const selects = async (page: Page, locator: ReturnType<Page['locator']>) => {
  await locator.first().click({ clickCount: 3, position: { x: 4, y: 4 } });
  const got = await page.evaluate(() => getSelection()?.toString().trim() ?? '');
  await page.evaluate(() => getSelection()?.removeAllRanges());
  return got;
};

test('nothing selects inside an open sheet: every sheet the app has, its heading and its words; a field in it does', async ({ deviceA: a }) => {
  await signedInto(a, 'sheetselect', tasks('alpha', 'bravo'));
  await go(a.page, 'Today');
  const check = async (sheet: ReturnType<Page['locator']>, what: string, words: ReturnType<Page['locator']>) => {
    await expect(sheet).toBeVisible();
    await settle(a.page);
    expect(await selects(a.page, sheet.getByRole('heading').first()), `${what}: its heading selects`).toBe('');
    expect(await selects(a.page, words), `${what}: its words select`).toBe('');
    expect(await selectable(sheet.getByRole('heading').first()), `${what}: its heading is selectable`).toBe(false);
    expect(await selectable(words), `${what}: its words are selectable`).toBe(false);
  };
  // The task sheet, and a field in it that does select.
  await taskRow(a.page, 'alpha').getByRole('button', { name: /alpha/ }).click();
  let sheet = a.page.getByRole('dialog', { name: 'Task', exact: true });
  await check(sheet, 'the task sheet', sheet.getByText('Changes are saved as you make them.'));
  expect(await selectable(sheet.getByLabel('Title'))).toBe(true);
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(a.page.locator('dialog')).toHaveCount(0);
  // Recently deleted, on Today.
  await button(a.page, 'Recently deleted, 1').click();
  sheet = a.page.getByRole('dialog', { name: 'Recently deleted' });
  await check(sheet, 'Recently deleted on Today', sheet.getByText(/^A deleted task keeps for 30 days/));
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(a.page.locator('dialog')).toHaveCount(0);

  // The habit sheet, Archived habits, and Recently deleted on Habits.
  await go(a.page, 'Habits');
  const add = a.page.getByLabel('Add a habit', { exact: true });
  for (const t of ['read', 'walk', 'stretch']) {
    await add.fill(t);
    await add.press('Enter');
  }
  const open = async (title: string) => {
    await expect(a.page.locator('dialog')).toHaveCount(0);
    await a.page.getByRole('checkbox', { name: `Check in: ${title}`, exact: true }).locator('xpath=..').getByRole('button', { name: new RegExp(title) }).click();
    return a.page.getByRole('dialog', { name: 'Habit', exact: true });
  };
  sheet = await open('read');
  await check(sheet, 'the habit sheet', sheet.getByText('Archive keeps its record and takes it off the list. Delete keeps it for 30 days.'));
  await sheet.getByRole('button', { name: 'Archive', exact: true }).click();
  sheet = await open('walk');
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(a.page.locator('dialog')).toHaveCount(0);
  await button(a.page, 'Archived, 1').click();
  sheet = a.page.getByRole('dialog', { name: 'Archived habits' });
  await check(sheet, 'Archived habits', sheet.getByText(/^An archived habit keeps its record/));
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(a.page.locator('dialog')).toHaveCount(0);
  await button(a.page, 'Recently deleted, 1').click();
  sheet = a.page.getByRole('dialog', { name: 'Recently deleted' });
  await check(sheet, 'Recently deleted on Habits', sheet.getByText(/^A deleted habit keeps for 30 days/));
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(a.page.locator('dialog')).toHaveCount(0);

  // Focus's chooser, "This lap is for": its rows' words do not select.
  await go(a.page, 'Focus');
  await a.page.getByRole('button', { name: /^This lap is for / }).click();
  // Its words are all rows to tap, so the triple click goes to its heading only.
  sheet = a.page.getByRole('dialog', { name: 'This lap is for' });
  await expect(sheet).toBeVisible();
  await settle(a.page);
  expect(await selects(a.page, sheet.getByRole('heading').first()), 'the chooser: its heading selects').toBe('');
  for (const words of [sheet.getByRole('heading').first(), sheet.getByText('Nothing in particular', { exact: true }), sheet.getByText('bravo', { exact: true })]) {
    expect(await selectable(words), 'the chooser: its words are selectable').toBe(false);
  }
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(a.page.locator('dialog')).toHaveCount(0);

  // A room's sheet: its words do not select, its code does.
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('quiet room');
  await button(a.page, 'Make the room').click();
  await button(a.page, 'Code and settings').click();
  sheet = a.page.getByRole('dialog').filter({ hasText: 'What you change here changes for everyone in the room.' });
  await check(sheet, 'the room sheet', sheet.getByText('What you change here changes for everyone in the room.'));
});

test('the task sheet at 412x1180, a phone with its keyboard up: every field focused has 24px above and below it, or the sheet is at its end; and no blank end', async ({ deviceA: a }) => {
  await a.page.setViewportSize({ width: 412, height: 1180 });
  await signedInto(a, 'keyboard', (node) => {
    node.engine.write('task', 't0', { title: 'thesis draft', order: 'V' });
    for (let i = 0; i < 4; i++) node.engine.write('task', `s${i}`, { title: `piece ${i + 1}`, parent: 't0', order: `V${i}` });
  });
  await go(a.page, 'Today');
  await taskRow(a.page, 'thesis draft').getByRole('button', { name: /thesis draft/ }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Task', exact: true });
  await expect(sheet).toBeVisible();
  await settle(a.page);
  // A new project's form open too, so its field is one of them.
  await sheet.getByRole('button', { name: 'New project' }).click();
  await settle(a.page);
  const fields = await sheet.locator('input:not([type="range"]):not([type="color"]), textarea').all();
  expect(fields.length).toBeGreaterThanOrEqual(8);
  for (const field of fields) {
    await field.focus();
    await settle(a.page);
    const room = await field.evaluate((el) => {
      const dialog = el.closest('dialog')!;
      // What scrolls in the sheet: the dialog, or the first box inside it that can.
      let scroller: HTMLElement = dialog;
      for (const one of dialog.querySelectorAll<HTMLElement>('*')) if (one.scrollHeight > one.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(one).overflowY)) scroller = one;
      const box = scroller.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const top = Math.max(box.top, 0);
      const bottom = Math.min(box.bottom, innerHeight);
      return {
        name: el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.getAttribute('name'),
        above: Math.round(r.top - top),
        below: Math.round(bottom - r.bottom),
        atStart: scroller.scrollTop <= 1,
        atEnd: scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1,
      };
    });
    expect(room.above >= 24 || room.atStart, `"${room.name}" has ${room.above}px above it`).toBe(true);
    expect(room.below >= 24 || room.atEnd, `"${room.name}" has ${room.below}px below it`).toBe(true);
  }
  // At its end the sheet ends at its content: no stretch of nothing under the last button.
  const blank = await sheet.evaluate((dialog) => {
    dialog.scrollTo({ top: dialog.scrollHeight });
    for (const one of dialog.querySelectorAll<HTMLElement>('*')) if (one.scrollHeight > one.clientHeight + 1) one.scrollTo({ top: one.scrollHeight });
    let bottom = -Infinity;
    for (const el of dialog.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > 0) bottom = Math.max(bottom, r.bottom);
    }
    return Math.round(Math.min(dialog.getBoundingClientRect().bottom, innerHeight) - bottom);
  });
  expect(blank, `${blank}px of nothing at the end of the sheet`).toBeLessThanOrEqual(64);
});

// 5. Every number has a top.

test('an estimate stops at 32, by the stepper and by "~33"; a row holding 45 from an older build stays in its card, shows its count alone and breaks its title only between words', async ({ deviceA: a }) => {
  const long = 'reading the whole of the operating systems chapter on paging';
  const { name } = await signedInto(a, 'estimate', (node) => node.engine.write('task', 'old', { title: long, estimate: 45, order: 'A' }));
  await a.page.setViewportSize({ width: 412, height: 915 });
  await go(a.page, 'Today');
  await quickAdd(a.page, 'essay ~33');
  await expect(taskRow(a.page, 'essay')).toBeVisible();
  await expect.poll(async () => [...(await serverRows(server, name, 'task')).values()].find((r) => r.title === 'essay')?.estimate).toBe(32);

  await taskRow(a.page, 'essay').getByRole('button', { name: /essay/ }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Task', exact: true });
  const more = sheet.getByRole('button', { name: 'One lap more' });
  const estimate = sheet.getByRole('group', { name: 'Estimate' }).last();
  await expect(estimate).toContainText('32 laps');
  await expect(more, 'the plus at the top is not off').toBeDisabled();
  // Down two, then up past the top: it stops at 32.
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'One lap less' }).click();
  await expect(estimate).toContainText('30 laps');
  for (let i = 0; i < 4; i++) await more.click({ force: true }).catch(() => {});
  await expect(estimate).toContainText('32 laps');
  await expect(more).toBeDisabled();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect.poll(async () => [...(await serverRows(server, name, 'task')).values()].find((r) => r.title === 'essay')?.estimate).toBe(32);

  // The old row: 45 laps, a 60 character title, on a phone.
  const row = taskRow(a.page, long);
  await expect(row).toBeVisible();
  const look = await row.evaluate((el) => {
    // The card: the nearest ancestor that is a list's own box.
    const card = el.closest('section') ?? el.parentElement!;
    const cardBox = card.getBoundingClientRect();
    const overflows = [...el.querySelectorAll('*')].filter((one) => {
      const r = one.getBoundingClientRect();
      return r.width > 0 && (r.right > cardBox.right + 0.5 || r.left < cardBox.left - 0.5);
    }).length;
    const squares = el.querySelectorAll('i[style*="--share"]').length;
    // Every word of the title on one line: a word split across two lines has two boxes.
    const words: string[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let titleLines = 0;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent ?? '';
      if (!text.includes('reading the whole')) continue;
      const range = document.createRange();
      for (const m of text.matchAll(/\S+/g)) {
        range.setStart(n, m.index!);
        range.setEnd(n, m.index! + m[0].length);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        if (tops.size > 1) words.push(m[0]);
      }
      // The lines that show: a clamped title keeps its hidden lines' boxes, under its own bottom.
      range.selectNodeContents(n);
      const shown = n.parentElement!.getBoundingClientRect();
      titleLines = new Set([...range.getClientRects()].filter((r) => r.top < shown.bottom - 1).map((r) => Math.round(r.top))).size;
    }
    return { overflows, squares, broken: words, titleLines, scrollWide: el.scrollWidth > el.clientWidth + 1 };
  });
  expect(look.overflows, 'something in the row stands outside its card').toBe(0);
  expect(look.scrollWide, 'the row overflows sideways').toBe(false);
  expect(look.squares, 'a row past 32 shows its count alone').toBe(0);
  expect(look.broken, 'words broken across two lines').toEqual([]);
  expect(look.titleLines).toBeGreaterThan(0);
  expect(look.titleLines, 'the title runs past two lines').toBeLessThanOrEqual(2);
  await expect(row).toContainText('45');
});

// 6. Projects: what a person made, they can rename and remove.

const openTask = async (page: Page, title: string) => {
  await expect(page.locator('dialog')).toHaveCount(0);
  await taskRow(page, title).getByRole('button', { name: new RegExp(title) }).click();
  const sheet = page.getByRole('dialog', { name: 'Task', exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
};

test('"New project" closes when the question is answered another way; a project is edited, renamed and deleted with Undo on two devices; "Delete for good" asks twice and the task is gone everywhere', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'projects', tasks('alpha', 'bravo'));
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Today');
  let sheet = await openTask(a.page, 'alpha');
  const form = () => sheet.getByLabel('Its name');

  // Opened, then answered by None: it closes.
  await sheet.getByRole('button', { name: 'New project' }).click();
  await expect(form()).toBeVisible();
  await sheet.getByRole('button', { name: 'None', exact: true }).click();
  await expect(form()).toHaveCount(0);
  // Made, then a second form answered by choosing the first project: it closes.
  await sheet.getByRole('button', { name: 'New project' }).click();
  await form().fill('Thesis');
  await sheet.getByRole('button', { name: 'Add project' }).click();
  await expect(sheet.getByRole('button', { name: 'Thesis' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'New project' }).click();
  await expect(form()).toBeVisible();
  await sheet.getByRole('button', { name: 'Thesis' }).click();
  await expect(form()).toHaveCount(0);

  // Edit project: the same form, filled in; a rename is kept as it is typed, on both devices.
  await sheet.getByRole('button', { name: 'Edit project' }).click();
  await expect(form()).toHaveValue('Thesis');
  await form().fill('Thesis, part 2');
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(form()).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Thesis, part 2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(taskRow(b.page, 'alpha')).toContainText('Thesis, part 2', { timeout: 2000 });

  // Delete project, said in the sheet with its Undo; the task stays with no project, then gets it back.
  await sheet.getByRole('button', { name: 'Edit project' }).click();
  await sheet.getByRole('button', { name: 'Delete project' }).click();
  await expect(sheet.getByRole('status').filter({ hasText: 'Deleted project Thesis, part 2. Its tasks stay, with no project.' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Thesis, part 2' })).toHaveCount(0);
  await expect(taskRow(b.page, 'alpha')).not.toContainText('Thesis, part 2', { timeout: 2000 });
  await expect(taskRow(b.page, 'alpha')).toBeVisible();
  await sheet.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(sheet.getByRole('button', { name: 'Thesis, part 2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(taskRow(b.page, 'alpha')).toContainText('Thesis, part 2', { timeout: 2000 });
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Delete for good: a task deleted, then removed for good from Recently deleted with two taps.
  sheet = await openTask(a.page, 'bravo');
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(a.page.locator('dialog')).toHaveCount(0);
  await button(a.page, 'Recently deleted, 1').click();
  const bin = a.page.getByRole('dialog', { name: 'Recently deleted' });
  await bin.getByRole('button', { name: 'Delete for good', exact: true }).click();
  await expect(bin.getByRole('button', { name: 'Delete for good?', exact: true }), 'the first tap did not ask').toBeVisible();
  await expect(bin).toContainText('bravo');
  await bin.getByRole('button', { name: 'Delete for good?', exact: true }).click();
  // The list closes with its last row.
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  await expect(button(a.page, 'Recently deleted, 1')).toHaveCount(0);
  await expect(button(b.page, 'Recently deleted, 1')).toHaveCount(0, { timeout: 2000 });
  await expect.poll(async () => [...(await serverRows(server, name, 'task')).values()].find((r) => r.title === 'bravo')?.deleted).toBe(1577836800000);
  for (const d of [a, b]) {
    await d.page.reload();
    await expect(taskRow(d.page, 'alpha')).toBeVisible();
    await expect(d.page.getByText('bravo')).toHaveCount(0);
    await expect(d.page.getByRole('button', { name: /^Recently deleted/ })).toHaveCount(0);
  }
});

test('the picker: Pick stands where it was as it opens, as the sliders move and as a strip is tapped; what is kept is where the finger landed; the colour arrives on a second device', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'picker', tasks('alpha'));
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Today');
  const sheet = await openTask(a.page, 'alpha');
  await sheet.getByRole('button', { name: 'New project' }).click();
  await sheet.getByLabel('Its name').fill('Painting');
  const pick = sheet.getByRole('radio', { name: /Pick/ });
  await expect(sheet.getByRole('button', { name: 'Another colour' })).toHaveCount(0);
  await expect(sheet.locator('input[type="color"]')).toHaveCount(0);
  await settle(a.page);
  const at = async () => {
    const box = (await pick.boundingBox())!;
    return [Math.round(box.x), Math.round(box.y)];
  };
  const where = await at();
  await pick.click();
  await settle(a.page);
  expect(await at(), 'Pick moved when it opened the picker').toEqual(where);
  const hue = sheet.getByRole('slider', { name: 'Colour' });
  const depth = sheet.getByRole('slider', { name: 'Pale to deep' });
  await hue.fill('120');
  await depth.fill('80');
  await settle(a.page);
  expect(await at(), 'Pick moved when the sliders did').toEqual(where);
  await expect(pick).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Add project' }).click();
  await expect(sheet.getByRole('button', { name: 'Painting' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => colourOf(name, 'Painting')).toMatch(/^#[0-9a-f]{6}$/);
  const colour = (await colourOf(name, 'Painting'))!;
  expect(colour, 'the colour kept is not the one the sliders stood on').toBe(hueHex(120, 80));
  // The square on B's row is that colour.
  await expect(taskRow(b.page, 'alpha')).toContainText('Painting', { timeout: 2000 });
  const rgb = `rgb(${[1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)).join(', ')})`;
  const drawn = await taskRow(b.page, 'alpha').evaluate((row, rgb) => [...row.querySelectorAll('*')].some((el) => getComputedStyle(el).backgroundColor === rgb), rgb);
  expect(drawn, `no square on B is ${colour}`).toBe(true);

  // A tap on a strip, not a drag: editing, each change is kept at once, and what is kept is the
  // colour where the finger landed, not where the slider stood before.
  await sheet.getByRole('button', { name: 'Edit project' }).click();
  await sheet.getByRole('radio', { name: /Pick/ }).click();
  await settle(a.page);
  const before = await at();
  const strip = sheet.getByRole('slider', { name: 'Colour' });
  const box = (await strip.boundingBox())!;
  await a.page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  const tapped = Number(await strip.inputValue());
  expect(tapped, 'the tap did not move the slider').toBeGreaterThan(200);
  const deep = Number(await sheet.getByRole('slider', { name: 'Pale to deep' }).inputValue());
  await expect.poll(() => colourOf(name, 'Painting'), { message: 'the tap kept the colour from where the slider was' }).toBe(hueHex(tapped, deep));
  await settle(a.page);
  expect(await at(), 'Pick moved when its strip was tapped').toEqual(before);
});

// 7. What the code review found after 127 green tests: each, as the person would meet it.

test('the task\'s bar on the result, with an estimate of 4: after lap 1 rings one segment is full and three empty, on both devices; after lap 4 all four are full', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(90000);
  const { name } = await signedInto(a, 'setbar', (node) => node.engine.write('task', 'essay', { title: 'essay', estimate: 4, order: 'V' }), { work_ms: 3000, short_ms: 60000, long_ms: 60000 });
  await also(b, name);
  await startButton(a.page).click();
  for (const d of [a, b]) {
    await expect(startNow(d.page)).toBeVisible({ timeout: 8000 });
    await expect.poll(() => setBar(d.page), { message: 'the lap that just rang is not drawn full' }).toEqual([1, 0, 0, 0]);
  }
  // Laps 2 to 4 on the same task, each started at once and run to its bell.
  for (let lap = 2; lap <= 4; lap++) {
    await startNow(a.page).click();
    await expect(button(a.page, 'Pause')).toBeVisible();
    await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
  }
  for (const d of [a, b]) {
    await expect(startNow(d.page)).toBeVisible({ timeout: 8000 });
    await expect.poll(() => setBar(d.page), { message: 'the estimate\'s last lap is not four full' }).toEqual([1, 1, 1, 1]);
  }
});

test('reduced motion: a row dragged and set down opens no sheet, nor one lifted and let go where it was; a click after still opens the task', async ({ deviceA: a }) => {
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await signedInto(a, 'stillhold', tasks('alpha', 'bravo', 'charlie'));
  await go(a.page, 'Today');
  await expect.poll(() => titles(a.page)).toEqual(['alpha', 'bravo', 'charlie']);
  const sheet = a.page.locator('dialog[open]');
  // Dragged below bravo and set down.
  const alpha = await middle(a.page, 'alpha');
  await a.page.mouse.move(alpha.x, alpha.y);
  await a.page.mouse.down();
  await a.page.waitForTimeout(500);
  await a.page.mouse.move(alpha.x, (await middle(a.page, 'bravo')).bottom + 4, { steps: 10 });
  await a.page.mouse.up();
  await expect.poll(() => titles(a.page)).toEqual(['bravo', 'alpha', 'charlie']);
  await a.page.waitForTimeout(400);
  await expect(sheet, 'setting a row down opened it').toHaveCount(0);
  // Lifted and let go where it was.
  const charlie = await middle(a.page, 'charlie');
  await a.page.mouse.move(charlie.x, charlie.y);
  await a.page.mouse.down();
  await a.page.waitForTimeout(500);
  await a.page.mouse.up();
  await a.page.waitForTimeout(400);
  await expect(sheet, 'a row lifted and let go where it was opened').toHaveCount(0);
  expect(await titles(a.page)).toEqual(['bravo', 'alpha', 'charlie']);
  await taskRow(a.page, 'charlie').getByRole('button', { name: /charlie/ }).click();
  await expect(a.page.getByRole('dialog', { name: 'Task', exact: true })).toBeVisible();
});

test('a picked colour survives Edit project, a tap on Pick and Done; moving a slider then changes it', async ({ deviceA: a }) => {
  const { name } = await signedInto(a, 'keeppick', (node) => {
    node.engine.write('project', 'paint', { name: 'Paint', color: '#3a7bd5', order: 'V' });
    node.engine.write('task', 't0', { title: 'alpha', project: 'paint', order: 'V' });
  });
  await go(a.page, 'Today');
  const sheet = await openTask(a.page, 'alpha');
  await sheet.getByRole('button', { name: 'Edit project' }).click();
  await sheet.getByRole('radio', { name: /Pick/ }).click();
  await settle(a.page);
  await button(sheet as never, 'Done').click();
  await a.page.waitForTimeout(1000);
  expect(await colourOf(name, 'Paint'), 'opening the picker and closing it changed the colour').toBe('#3a7bd5');
  await sheet.getByRole('button', { name: 'Edit project' }).click();
  await sheet.getByRole('radio', { name: /Pick/ }).click();
  await sheet.getByRole('slider', { name: 'Colour' }).fill('30');
  await expect.poll(() => colourOf(name, 'Paint')).not.toBe('#3a7bd5');
  expect(await colourOf(name, 'Paint')).toMatch(/^#[0-9a-f]{6}$/);
});

test('the within-estimate mark: not for a task ticked a few seconds into its lap; there for one done after a lap that rang', async ({ deviceA: a }) => {
  const { name } = await signedInto(a, 'estmark', (node) => {
    node.engine.write('task', 'early', { title: 'early', estimate: 2, order: 'A' });
    node.engine.write('task', 'rung', { title: 'rung', estimate: 2, order: 'B' });
  }, { work_ms: 4000, short_ms: 60000 });
  await go(a.page, 'Today');
  const marks = async () => Object.keys(((await serverRows(server, name, 'settings')).get('current')?.marks ?? {}) as Record<string, number>);
  const lapStrip = strip(a.page);
  await list(a.page, 'Next').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(lapStrip).toContainText('early');
  await a.page.waitForTimeout(1500);
  await markRunningDone(a.page, 'early');
  await expect(lapStrip).toHaveCount(0);
  await a.page.waitForTimeout(2000);
  await expect(a.page.getByText(/^early: done in/)).toHaveCount(0);
  expect(await marks(), 'a stopped lap earned the mark').not.toContain('estimate-early');

  await list(a.page, 'Next').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(lapStrip).toContainText('rung');
  await expect(a.page.getByText('Lap done', { exact: true })).toBeVisible({ timeout: 8000 });
  await taskRow(a.page, 'rung').getByRole('checkbox').click();
  await expect(a.page.getByText('rung: done in 1 lap. You estimated 2.')).toBeVisible({ timeout: 3000 });
  await expect.poll(marks).toContain('estimate-rung');
  expect(await marks()).not.toContain('estimate-early');
});

test('after a bell, "5 more minutes": Today\'s laps stay what they were at the bell while the extension runs, its task in the strip; stopped, the task\'s count is the bell\'s', async ({ deviceA: a, deviceB: b }) => {
  const { name, node } = await signedInto(a, 'extend', (n) => n.engine.write('task', 't0', { title: 'alpha', estimate: 2, order: 'V' }), { work_ms: 3000, short_ms: 60000 });
  await also(b, name);
  await go(b.page, 'Today');
  const focused = (page: Page) => page.locator('dl > div').filter({ hasText: 'Focused' });
  await startButton(a.page).click();
  await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
  for (const d of [a, b]) {
    if (d === a) await go(a.page, 'Today');
    await expect(focused(d.page)).toContainText('1 lap', { timeout: 3000 });
    await expect(taskRow(d.page, 'alpha')).toContainText('1 of 2');
  }
  // "5 more minutes" after the bell, from the Node device of the account: Focus offers it only
  // until the result is drawn, and the rule is the same from wherever it is tapped.
  const { createFocus } = await import('../../client/src/sync/focus.ts');
  const focus = createFocus(node.engine, { utcOffsetMin: () => -new Date().getTimezoneOffset(), runId: () => 'never', schedule: (run, ms) => { const t = setTimeout(run, ms); return () => clearTimeout(t); } });
  await expect.poll(() => node.engine.timer.value.phase).toBe('work');
  focus.extend();
  await expect.poll(async () => (await timer(name))?.phase).toBe('work');
  await expect(strip(a.page)).toBeVisible({ timeout: 3000 });
  for (let i = 0; i < 4; i++) {
    for (const d of [a, b]) {
      await expect(focused(d.page), 'the day lost the lap that rang').toContainText('1 lap');
      // While the extension runs its task is in the strip and no list.
      await expect(strip(d.page)).toContainText('alpha');
    }
    await a.page.waitForTimeout(700);
  }
  // Stopped: the row is back, with the one lap the bell counted, not two and not none.
  focus.stop();
  for (const d of [a, b]) {
    await expect(strip(d.page)).toHaveCount(0, { timeout: 3000 });
    await expect(taskRow(d.page, 'alpha'), 'the task lost the lap that rang, or counted the extension again').toContainText('1 of 2');
    await expect(focused(d.page)).toContainText('1 lap');
  }
  focus.close();
});

test('leaving Today with a row lifted and coming back before letting go: nothing moved, and the next click opens a task', async ({ deviceA: a }) => {
  await signedInto(a, 'leavelift', tasks('alpha', 'bravo', 'charlie'));
  await go(a.page, 'Today');
  await expect.poll(() => titles(a.page)).toEqual(['alpha', 'bravo', 'charlie']);
  const alpha = await middle(a.page, 'alpha');
  await a.page.mouse.move(alpha.x, alpha.y);
  await a.page.mouse.down();
  await a.page.waitForTimeout(500);
  await a.page.mouse.move(alpha.x, alpha.y + 60, { steps: 5 });
  await a.page.evaluate(() => (location.hash = '#/focus'));
  await expect(startButton(a.page)).toBeVisible();
  await a.page.evaluate(() => (location.hash = '#/today'));
  await expect(taskRow(a.page, 'charlie')).toBeVisible();
  await a.page.mouse.up();
  await a.page.waitForTimeout(400);
  expect(await titles(a.page)).toEqual(['alpha', 'bravo', 'charlie']);
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  await taskRow(a.page, 'bravo').getByRole('button', { name: /bravo/ }).click();
  await expect(a.page.getByRole('dialog', { name: 'Task', exact: true })).toBeVisible();
});

test('a lap of 120 minutes is kept as it is: Settings shows 120 with its plus on and the first minus writes 119; one of 400 from an older build is read and run as it is', async ({ deviceA: a }) => {
  const { name, node } = await signedInto(a, 'lap120', undefined, { work_ms: 120 * 60000 });
  await expect(a.page.locator('[class*="digits"]').first()).toHaveText('2:00:00');
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  await expect(a.page.getByRole('spinbutton', { name: 'A lap' })).toHaveValue('120');
  await expect(a.page.getByRole('button', { name: 'A lap, one minute more' })).toBeEnabled();
  await a.page.getByRole('button', { name: 'A lap, one minute less' }).click();
  await expect.poll(async () => (await serverRows(server, name, 'settings')).get('current')?.work_ms).toBe(119 * 60000);
  // Past the top, from a build that allowed it: run as it is.
  node.engine.write('settings', 'current', { work_ms: 400 * 60000 });
  await go(a.page, 'Focus');
  await expect(a.page.locator('[class*="digits"]').first()).toHaveText('6:40:00', { timeout: 3000 });
});
