// Today in real browsers, on the real engine and server: protocol section 12 through the screen.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import { serverRows, signedIn } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { accountWith, go, list, midScreen, quickAdd, ready, server, settle, signedInto, signIn, squaresOf, startButton, statusLine, strip, taskRow, titles, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// Today's line about the last tap, as laid out on screen: its parts sit in spans with no space
// between them in the markup, so the text without layout would run them together.
const said = (page: Page, about: string) =>
  page.getByRole('status').filter({ hasText: about }).innerText().then((text) => text.replace(/\s+/g, ' ').trim());

// A Node device of the account, for writing a row exactly as a test needs it.
const signedInNode = (name: string) => signedIn(server, name);

// Polls the server's task rows until `ok` holds for them.
async function waitRows(name: string, ok: (rows: Map<string, Record<string, unknown>>) => boolean) {
  for (const start = Date.now(); ; ) {
    const rows = await serverRows(server, name, 'task');
    if (ok(rows)) return rows;
    if (Date.now() - start > 10000) throw new Error(`the server's task rows never matched: ${JSON.stringify([...rows.values()])}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// Through the sheet, as a person deletes a task.
async function deleteTask(page: Page, title: string) {
  await taskRow(page, title).getByRole('button', { name: new RegExp(title) }).click();
  await page.getByRole('dialog', { name: 'Task' }).getByRole('button', { name: 'Delete', exact: true }).click();
}

// Laptops signed in to one new account, on Today. Lengths go in the account's settings first.
async function onToday(devices: Device[], tag: string, lengths: Parameters<typeof accountWith>[1] = {}) {
  const name = username(tag);
  await accountWith(name, lengths);
  for (const d of devices) {
    await signIn(d.page, name);
    await ready(d.page);
    await go(d.page, 'Today');
    await expect(d.page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  }
  return name;
}

test('quick add with an estimate shows empty squares and "0 of 4" on A, and on B within a second; no estimate, no squares; an empty line adds nothing', async ({ deviceA: a, deviceB: b }) => {
  await onToday([a, b], 'quick');
  const start = Date.now();
  await quickAdd(a.page, 'pointers chapter 3 ~4');
  await expect(taskRow(b.page, 'pointers chapter 3')).toBeVisible({ timeout: 1000 });
  console.log(`quick add on A, seen on B: ${Date.now() - start} ms`);
  await expect.poll(() => said(a.page, 'Added')).toBe('Added: pointers chapter 3, 4 laps.');
  for (const d of [a, b]) {
    const row = taskRow(d.page, 'pointers chapter 3');
    await expect(row).toContainText('0 of 4');
    expect(await squaresOf(row)).toEqual([0, 0, 0, 0]);
  }

  await quickAdd(a.page, 'read the paper');
  for (const d of [a, b]) {
    const row = taskRow(d.page, 'read the paper');
    await expect(row).toBeVisible();
    expect(await squaresOf(row)).toEqual([]);
    await expect(row).not.toContainText(' of ');
  }

  for (const empty of ['', '   ', '~4']) await quickAdd(a.page, empty);
  await a.page.waitForTimeout(500);
  for (const d of [a, b]) expect(await titles(d.page)).toEqual(['pointers chapter 3', 'read the paper']);
});

test('a lap started from the Next row is named on both laptops; it rings, counts one whole square on both, and the task is next again', async ({ deviceA: a, deviceB: b }) => {
  await onToday([a, b], 'nextrow', { work_ms: 4000, short_ms: 60000 });
  await quickAdd(a.page, 'essay ~4');
  await expect(list(a.page, 'Next')).toContainText('essay');
  await list(a.page, 'Next').getByRole('button', { name: 'Start', exact: true }).click();

  // Today's bar on A names it; Focus on B names it, and its bar is the task's four laps.
  await expect(strip(a.page)).toContainText('essay');
  await go(b.page, 'Focus');
  await expect(b.page.locator('main i[style*="--i:"]')).toHaveCount(4);
  await expect(b.page.getByText('essay', { exact: true })).toBeVisible();

  await expect(button(b.page, 'Start 1 min break')).toBeVisible({ timeout: 8000 });
  await go(b.page, 'Today');
  for (const d of [a, b]) {
    const row = taskRow(d.page, 'essay');
    await expect(row).toContainText('1 of 4');
    expect(await squaresOf(row)).toEqual([1, 0, 0, 0]);
    // The day's figures: one lap done, three planned.
    await expect(d.page.locator('dl')).toContainText('1 lap');
    await expect(d.page.locator('dl')).toContainText('3 laps');
    // When the lap on the top task rings, that task is next again, ready to start.
    await expect(list(d.page, 'Next')).toContainText('essay');
    await expect(list(d.page, 'Next').getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  }
});

test('laps past the estimate: a task of 1 with two rung laps shows "2 of 1" and two whole squares, looking just as it did at "1 of 1"', async ({ deviceA: a }) => {
  await onToday([a], 'past', { work_ms: 3000, short_ms: 60000 });
  await quickAdd(a.page, 'quiz ~1');
  await quickAdd(a.page, 'flashcards ~3');
  const next = list(a.page, 'Next');
  // The count, the row, and the square of lap `i`: the same in the same place, or the screen is warning.
  const look = (i: number) =>
    taskRow(a.page, 'quiz').evaluate((el, i) => {
      const count = [...el.querySelectorAll('span')].find((span) => / of \d+$/.test(span.textContent ?? ''));
      const square = el.querySelectorAll('i[style*="--share"]')[i];
      const style = (node: Element | null | undefined) => (node ? getComputedStyle(node) : null);
      return { count: style(count)?.color, weight: style(count)?.fontWeight, square: style(square)?.backgroundColor, row: getComputedStyle(el).borderColor };
    }, i);
  let atEstimate;
  for (const lap of [1, 2]) {
    await expect(next).toContainText('quiz');
    await next.getByRole('button', { name: 'Start', exact: true }).click();
    // Today's strip after a bell says it with no number; the row's count says which lap.
    await expect(taskRow(a.page, 'quiz')).toContainText(`${lap} of 1`, { timeout: 8000 });
    await expect(a.page.getByText('Lap done', { exact: true })).toBeVisible();
    if (lap === 1) atEstimate = await look(0);
  }
  const row = taskRow(a.page, 'quiz');
  expect(await squaresOf(row)).toEqual([1, 1]);
  expect(await look(1)).toEqual(atEstimate);
});

test('done with the box shows under Done on B; Undo brings it back on both', async ({ deviceA: a, deviceB: b }) => {
  await onToday([a, b], 'done');
  await quickAdd(a.page, 'slides ~2');
  await expect(taskRow(b.page, 'slides')).toBeVisible();
  await a.page.getByRole('checkbox', { name: 'Done: slides' }).click();
  await expect.poll(() => said(a.page, 'slides')).toBe('Done: slides. Undo');
  for (const d of [a, b]) {
    await expect(list(d.page, 'Done')).toContainText('slides', { timeout: 1000 });
    await expect(d.page.getByRole('checkbox', { name: 'Done: slides' })).toHaveAttribute('aria-checked', 'true');
  }
  await a.page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  for (const d of [a, b]) {
    await expect(list(d.page, 'Next')).toContainText('slides', { timeout: 1000 });
    await expect(list(d.page, 'Done')).toHaveCount(0);
  }
});

test('a first day with nothing says so and offers the quick add', async ({ deviceA: a }) => {
  await onToday([a], 'empty');
  await expect(a.page.getByText('Nothing planned for today yet. Add the first thing to work on, and estimate its laps.')).toBeVisible();
  await expect(a.page.getByLabel('Add a task', { exact: true })).toBeVisible();
  // No past day to race yet: two figures, no ghost.
  await expect(a.page.locator('dl > div')).toHaveCount(2);
  await quickAdd(a.page, 'first thing');
  await expect(list(a.page, 'Next')).toContainText('first thing');
  await expect(a.page.getByText('Nothing planned for today yet.', { exact: false })).toHaveCount(0);
});

// The local day as the app counts it, from this machine's clock and zone, which the browser shares.
const dayAfter = (days: number) => localDay(Date.now() + days * 86400000, -new Date().getTimezoneOffset());

test('a repeating task marked done says when it comes back, and the server holds one next row, due tomorrow', async ({ deviceA: a }) => {
  const name = await onToday([a], 'repeat');
  const node = await signedInNode(name);
  node.engine.write('task', 'read', { title: 'read 20 pages', estimate: 1, repeat: { every: 'day' }, order: 'V' });
  await expect(taskRow(a.page, 'read 20 pages')).toBeVisible();
  await a.page.getByRole('checkbox', { name: 'Done: read 20 pages' }).click();
  await expect.poll(() => said(a.page, 'read 20 pages')).toBe('Done: read 20 pages. It comes back tomorrow. Undo');
  await expect(list(a.page, 'Upcoming')).toContainText('read 20 pages');
  await expect(list(a.page, 'Upcoming')).toContainText('tomorrow');

  const next = `read-${dayAfter(1).replaceAll('-', '')}`;
  const rows = await waitRows(name, (all) => all.has(next));
  expect([...rows.keys()].sort()).toEqual(['read', next]);
  expect(rows.get(next)).toMatchObject({ title: 'read 20 pages', estimate: 1, repeat: { every: 'day' }, order: 'V', due: dayAfter(1) });
  expect(rows.get(next)?.done ?? null).toBeNull();
});

test('both laptops offline mark the same repeating task done: back online, one next row and one done task on both, nothing doubled', async ({ deviceA: a, deviceB: b }) => {
  const name = await onToday([a, b], 'repeat2');
  const node = await signedInNode(name);
  node.engine.write('task', 'stretch', { title: 'stretch', estimate: 1, repeat: { every: 'day' }, when: 'after lunch', order: 'V' });
  for (const d of [a, b]) await expect(taskRow(d.page, 'stretch')).toBeVisible();

  for (const d of [a, b]) await d.setOffline(true);
  for (const d of [a, b]) {
    await expect(statusLine(d.page)).toHaveText(/^No connection/);
    await d.page.getByRole('checkbox', { name: 'Done: stretch' }).click();
    await expect(d.page.getByRole('status').filter({ hasText: 'stretch' })).toContainText('It comes back tomorrow.');
    await expect(list(d.page, 'Upcoming')).toContainText('stretch');
  }
  for (const d of [a, b]) await d.setOffline(false);

  const next = `stretch-${dayAfter(1).replaceAll('-', '')}`;
  const rows = await waitRows(name, (all) => all.has(next) && typeof all.get('stretch')?.done === 'number');
  expect([...rows.keys()].sort()).toEqual(['stretch', next]);
  expect(rows.get(next)).toMatchObject({ title: 'stretch', estimate: 1, repeat: { every: 'day' }, when: 'after lunch', order: 'V', due: dayAfter(1) });
  expect(rows.get(next)?.deleted ?? null).toBeNull();
  expect(rows.get(next)?.done ?? null).toBeNull();
  for (const d of [a, b]) {
    await expect(d.page.getByRole('status').filter({ hasText: 'No connection' })).toHaveCount(0, { timeout: 5000 });
    await expect(list(d.page, 'Upcoming').getByRole('checkbox', { name: 'Done: stretch' })).toHaveCount(1);
    await expect(list(d.page, 'Done').getByRole('checkbox', { name: 'Done: stretch' })).toHaveCount(1);
    expect(await titles(d.page)).toEqual(['stretch', 'stretch']);
  }
});

test('delete and Undo; delete and Restore from Recently deleted', async ({ deviceA: a }) => {
  await onToday([a], 'delete');
  await quickAdd(a.page, 'old notes ~1');
  await deleteTask(a.page, 'old notes');
  await expect.poll(() => said(a.page, 'old notes')).toBe('Deleted: old notes. It keeps for 30 days. Undo');
  await expect(taskRow(a.page, 'old notes')).toHaveCount(0);
  await a.page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(taskRow(a.page, 'old notes')).toBeVisible();

  await deleteTask(a.page, 'old notes');
  await expect(taskRow(a.page, 'old notes')).toHaveCount(0);
  await button(a.page, 'Recently deleted, 1').click();
  const bin = a.page.getByRole('dialog', { name: 'Recently deleted' });
  await expect(bin).toContainText('A deleted task keeps for 30 days, then it is gone for good.');
  await bin.getByRole('button', { name: 'Restore' }).click();
  // A list that opened as a sheet closes with its last row.
  await expect(bin).toBeHidden();
  await expect(taskRow(a.page, 'old notes')).toBeVisible();
  await expect(taskRow(a.page, 'old notes')).toContainText('0 of 1');
});

test('deleted on A while B, offline, retitles it: deleted on both with B\'s title, and Restore brings back B\'s title', async ({ deviceA: a, deviceB: b }) => {
  const name = await onToday([a, b], 'delete2');
  await quickAdd(a.page, 'chapter 4');
  await expect(taskRow(b.page, 'chapter 4')).toBeVisible();

  await b.setOffline(true);
  await taskRow(b.page, 'chapter 4').getByRole('button', { name: /chapter 4/ }).click();
  await b.page.getByRole('dialog', { name: 'Task' }).getByLabel('Title').fill('chapter 4, with the proofs');
  await b.page.keyboard.press('Escape');
  await expect(taskRow(b.page, 'chapter 4, with the proofs')).toBeVisible();
  await deleteTask(a.page, 'chapter 4');
  await b.setOffline(false);

  for (const d of [a, b]) {
    await expect(d.page.getByRole('checkbox', { name: /^Done: chapter 4/ })).toHaveCount(0, { timeout: 5000 });
    await button(d.page, 'Recently deleted, 1').click();
    await expect(d.page.getByRole('dialog', { name: 'Recently deleted' })).toContainText('chapter 4, with the proofs');
  }
  await a.page.getByRole('dialog', { name: 'Recently deleted' }).getByRole('button', { name: 'Restore' }).click();
  for (const d of [a, b]) {
    // Its last row restored, here or on the other laptop, the list closes itself.
    await expect(d.page.getByRole('dialog', { name: 'Recently deleted' })).toBeHidden({ timeout: 5000 });
    await expect(taskRow(d.page, 'chapter 4, with the proofs')).toBeVisible({ timeout: 5000 });
  }
  const rows = await waitRows(name, (all) => [...all.values()].some((row) => row.title === 'chapter 4, with the proofs' && row.deleted === null));
  expect(rows.size).toBe(1);
});

test('reorder with Alt and the arrows on A shows the same order on B; two laptops offline each add at the end and settle on one order', async ({ deviceA: a, deviceB: b }) => {
  await onToday([a, b], 'order');
  for (const t of ['alpha', 'bravo', 'charlie']) await quickAdd(a.page, t);
  await expect.poll(() => titles(b.page)).toEqual(['alpha', 'bravo', 'charlie']);

  // No mode to enter: the row with the focus moves. (Press and hold is in second-hour.spec.ts.)
  const words = (title: string) => taskRow(a.page, title).getByRole('button', { name: new RegExp(title) });
  await words('charlie').focus();
  await a.page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => titles(a.page)).toEqual(['alpha', 'charlie', 'bravo']);
  await words('alpha').focus();
  await a.page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => titles(a.page)).toEqual(['charlie', 'alpha', 'bravo']);
  await expect.poll(() => titles(b.page), { timeout: 1000 }).toEqual(['charlie', 'alpha', 'bravo']);

  for (const d of [a, b]) await d.setOffline(true);
  await quickAdd(a.page, 'from A');
  await quickAdd(b.page, 'from B');
  for (const d of [a, b]) await d.setOffline(false);
  await expect.poll(() => titles(a.page), { timeout: 5000 }).toHaveLength(5);
  await expect.poll(() => titles(b.page), { timeout: 5000 }).toHaveLength(5);
  const order = await titles(a.page);
  expect(order.slice(0, 3)).toEqual(['charlie', 'alpha', 'bravo']);
  expect(order.slice(3).sort()).toEqual(['from A', 'from B']);
  expect(await titles(b.page)).toEqual(order);
});

test('the sheet: every field saves as it is typed, with no Save; Escape and back both close it and hand the focus back; B shows it all', async ({ deviceA: a, deviceB: b }) => {
  await onToday([a, b], 'sheet');
  await quickAdd(a.page, 'thesis draft ~2');
  const open = async (page: Page, title: string) => {
    await taskRow(page, title).getByRole('button', { name: new RegExp(title) }).click();
    return page.getByRole('dialog', { name: 'Task' });
  };
  let sheet = await open(a.page, 'thesis draft');
  await sheet.getByLabel('Title').fill('thesis draft, part one');

  // Past seven laps the sheet suggests breaking it down, and its button goes straight to the subtask field.
  for (let i = 0; i < 6; i++) await sheet.getByRole('button', { name: 'One lap more', exact: true }).click();
  // The legend's group holds the stepper's group of the same name: the stepper is the inner one.
  await expect(sheet.getByRole('group', { name: 'Estimate' }).last()).toContainText('8 laps');
  const nudge = sheet.locator('p').filter({ hasText: '8 laps is a lot to hold in one task. Break it down and each piece is easier to start.' });
  await nudge.getByRole('button', { name: 'Add a subtask' }).click();
  const subtask = sheet.getByRole('textbox', { name: 'New subtask' });
  await expect(subtask).toBeFocused();
  await subtask.fill('outline');
  await subtask.press('Enter');
  // In the sheet a subtask is words to change, with no box: it is ticked on Today.
  await expect(sheet.getByRole('button', { name: 'Change: outline', exact: true })).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: /outline/ })).toHaveCount(0);

  await sheet.getByRole('button', { name: 'New project' }).click();
  await sheet.getByLabel('Its name').fill('Thesis');
  await sheet.getByRole('radio', { name: 'Green' }).click();
  await sheet.getByRole('button', { name: 'Add project' }).click();
  await expect(sheet.getByRole('button', { name: 'Thesis' })).toHaveAttribute('aria-pressed', 'true');

  await sheet.getByRole('button', { name: 'On chosen days' }).click();
  await sheet.getByRole('button', { name: 'Tue', exact: true }).click();
  // The free words for when are gone: a clock time says it.
  await expect(sheet.getByLabel('When in the day')).toHaveCount(0);

  await a.page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  const words = (page: Page) => taskRow(page, 'thesis draft, part one').getByRole('button', { name: /thesis draft, part one/ });
  await expect(words(a.page)).toBeFocused();
  // The subtask, ticked on Today's opened row.
  await taskRow(a.page, 'thesis draft, part one').getByRole('button', { name: '0 of 1 subtask' }).click();
  await taskRow(a.page, 'thesis draft, part one').getByRole('checkbox', { name: 'Done: outline', exact: true }).click();
  await expect(taskRow(a.page, 'thesis draft, part one').getByRole('button', { name: '1 of 1 subtask' })).toBeVisible();

  // Reopened, it is all there. Then a due date of tomorrow, and the browser's back closes it.
  sheet = await open(a.page, 'thesis draft, part one');
  const check = async (dialog: typeof sheet) => {
    await expect(dialog.getByLabel('Title')).toHaveValue('thesis draft, part one');
    await expect(dialog.getByRole('group', { name: 'Estimate' }).last()).toContainText('8 laps');
    await expect(dialog.getByRole('button', { name: 'Thesis' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Tue', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Ticked on Today, the sheet says so in its words' name.
    await expect(dialog.getByRole('button', { name: 'Change: outline, ticked', exact: true })).toBeVisible();
  };
  await check(sheet);
  await a.page.goBack();
  await expect(sheet).toBeHidden();
  await expect(words(a.page)).toBeFocused();

  // A due date of tomorrow moves it to Upcoming. (Closing with Escape from the date field, and
  // where the focus goes after the move, are the two tests below.)
  sheet = await open(a.page, 'thesis draft, part one');
  await sheet.getByLabel('Due').fill(dayAfter(1));
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  await expect(list(a.page, 'Upcoming')).toContainText('thesis draft, part one');

  const upcoming = list(b.page, 'Upcoming');
  await expect(upcoming).toContainText('thesis draft, part one');
  await expect(upcoming).toContainText('Thesis');
  await expect(upcoming).toContainText('tomorrow');
  const other = await open(b.page, 'thesis draft, part one');
  await check(other);
  await expect(other.getByLabel('Due')).toHaveValue(dayAfter(1));
});

test('Escape in the Due field closes the sheet and stays on Today', async ({ deviceA: a }) => {
  await onToday([a], 'dueesc');
  await quickAdd(a.page, 'lab report');
  await taskRow(a.page, 'lab report').getByRole('button', { name: /lab report/ }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Task' });
  await sheet.getByLabel('Due').fill(dayAfter(1));
  await a.page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // One Escape is one step back: the sheet's. The page stays where the person was.
  await expect(a.page).toHaveURL(/#\/today$/);
  await expect(list(a.page, 'Upcoming')).toContainText('lab report');
});

test('when a due date moves a task to Upcoming, closing the sheet hands the focus to its row there', async ({ deviceA: a }) => {
  await onToday([a], 'duefocus');
  await quickAdd(a.page, 'lab report');
  const words = () => taskRow(a.page, 'lab report').getByRole('button', { name: /lab report/ });
  await words().click();
  const sheet = a.page.getByRole('dialog', { name: 'Task' });
  await sheet.getByLabel('Due').fill(dayAfter(1));
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(list(a.page, 'Upcoming')).toContainText('lab report');
  await expect(words()).toBeFocused();
});

test('the day target: set it, the bar fills as a lap rings, clear it', async ({ deviceA: a }) => {
  await onToday([a], 'target', { work_ms: 3000, short_ms: 60000 });
  await quickAdd(a.page, 'drill ~3');
  const target = a.page.getByRole('group', { name: 'Day target' });
  await expect(target).toContainText('No day target.');
  // Set, it takes the laps planned on today's list.
  await target.getByRole('button', { name: 'Set a day target' }).click();
  await expect(target).toContainText('0 of 3 laps today');
  await target.getByRole('button', { name: 'One lap more', exact: true }).click();
  await expect(target).toContainText('0 of 4 laps today');
  await target.getByRole('button', { name: 'Done', exact: true }).click();
  const bar = () => target.locator('i[style*="--share"]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).style.getPropertyValue('--share'))));
  expect(await bar()).toEqual([0, 0, 0, 0]);

  await list(a.page, 'Next').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(target).toContainText('1 of 4 laps today', { timeout: 8000 });
  expect(await bar()).toEqual([1, 0, 0, 0]);

  await target.getByRole('button', { name: 'Change' }).click();
  await target.getByRole('button', { name: 'Remove the day target' }).click();
  await expect(target).toContainText('No day target.');
});

// Opens a task's sheet by its words, as a person taps the row.
async function openSheet(page: Page, title: string) {
  await taskRow(page, title).getByRole('button', { name: new RegExp(title) }).click();
  const sheet = page.getByRole('dialog', { name: 'Task' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('typed key by key, the spaces stay while typing; the title and a subtask are stored trimmed after leaving the field', async ({ deviceA: a }) => {
  const name = await onToday([a], 'spaces');
  await quickAdd(a.page, 'paper');
  const sheet = await openSheet(a.page, 'paper');

  const title = sheet.getByLabel('Title');
  await title.press('ControlOrMeta+a');
  await title.pressSequentially('  thesis draft  ');
  await expect(title).toHaveValue('  thesis draft  ');
  const subtask = sheet.getByRole('textbox', { name: 'New subtask' });
  await subtask.pressSequentially('  outline the argument  ');
  await expect(subtask).toHaveValue('  outline the argument  ');
  await subtask.press('Enter');
  await expect(sheet.getByRole('button', { name: 'Change: outline the argument', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();

  await expect(taskRow(a.page, 'thesis draft')).toBeVisible();
  const rows = await waitRows(name, (all) => [...all.values()].some((row) => row.title === 'outline the argument'));
  const task = [...rows.values()].find((row) => !row.parent)!;
  expect(task).toMatchObject({ title: 'thesis draft' });
  expect([...rows.values()].find((row) => row.parent === task.id)).toMatchObject({ title: 'outline the argument' });
});

test('the task a lap runs on is in the strip and in no list, its order kept; its title there opens its sheet and has the focus back when it closes; a sheet open on it stays open when another laptop starts the lap; at the bell its row is back in its place with its square whole', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(90000);
  const name = await onToday([a, b], 'running', { work_ms: 30000, short_ms: 60000 });
  for (const t of ['alpha ~2', 'bravo ~1', 'charlie ~1']) await quickAdd(a.page, t);
  await expect.poll(() => titles(b.page)).toEqual(['alpha', 'bravo', 'charlie']);

  const sheet = await openSheet(a.page, 'alpha');
  await list(b.page, 'Next').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(strip(a.page)).toContainText('alpha', { timeout: 1000 });
  await a.page.waitForTimeout(1000);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Title')).toHaveValue('alpha');
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Next is the first task not running; alpha is in the strip and no list, and in the true order it is still first.
  for (const d of [a, b]) {
    await expect(list(d.page, 'Next')).toContainText('bravo');
    await expect(taskRow(d.page, 'alpha')).toHaveCount(0);
    await expect(strip(d.page)).toContainText('alpha');
  }
  expect(await titles(a.page)).toEqual(['bravo', 'charlie']);
  const order = [...(await waitRows(name, (all) => all.size === 3)).values()].sort((x, y) => (String(x.order) < String(y.order) ? -1 : 1)).map((row) => row.title);
  expect(order).toEqual(['alpha', 'bravo', 'charlie']);

  // Its title in the strip opens its sheet, as its row would, and the focus comes back to it.
  const title = strip(a.page).getByRole('button', { name: 'alpha', exact: true });
  await title.click();
  const again = a.page.getByRole('dialog', { name: 'Task' });
  await expect(again.getByLabel('Title')).toHaveValue('alpha');
  await again.getByRole('button', { name: 'Close' }).click();
  await expect(again).toBeHidden();
  await expect(title, 'closing the sheet did not hand the focus back to the strip\'s title').toBeFocused();

  // At the bell its row is back, first as the true order has it, with its square whole.
  await expect(strip(a.page)).toContainText('Lap done', { timeout: 35000 });
  for (const d of [a, b]) {
    await expect.poll(() => titles(d.page)).toEqual(['alpha', 'bravo', 'charlie']);
    await expect.poll(() => squaresOf(taskRow(d.page, 'alpha'))).toEqual([1, 0]);
    await expect(taskRow(d.page, 'alpha')).toContainText('1 of 2');
  }
});

test('delete from the sheet and Undo: the task is back, and its sheet does not pop open again', async ({ deviceA: a }) => {
  await onToday([a], 'undosheet');
  await quickAdd(a.page, 'reading list');
  const sheet = await openSheet(a.page, 'reading list');
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(sheet).toBeHidden();
  await a.page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(taskRow(a.page, 'reading list')).toBeVisible();
  await a.page.waitForTimeout(500);
  await expect(a.page.getByRole('dialog')).toHaveCount(0);
  await expect(a.page).toHaveURL(/#\/today$/);
});

test('a sheet open on A when B deletes its task closes, and one back press on A then leaves Today', async ({ deviceA: a, deviceB: b }) => {
  await onToday([a, b], 'gone');
  await quickAdd(a.page, 'lab notes');
  await expect(taskRow(b.page, 'lab notes')).toBeVisible();
  const sheet = await openSheet(a.page, 'lab notes');
  await deleteTask(b.page, 'lab notes');
  await expect(sheet).toBeHidden({ timeout: 2000 });
  await expect(a.page).toHaveURL(/#\/today$/);
  // The sheet's own step went with it, so back is back from Today, to where the person came from.
  await a.page.goBack();
  await expect(a.page.getByRole('heading', { name: 'Today', level: 1 })).toBeHidden();
  await expect(a.page).not.toHaveURL(/#\/today$/);
});

test('a removed subtask says so, and Undo brings it back', async ({ deviceA: a }) => {
  const name = await onToday([a], 'subundo');
  await quickAdd(a.page, 'essay plan');
  const sheet = await openSheet(a.page, 'essay plan');
  const subtask = sheet.getByRole('textbox', { name: 'New subtask' });
  await subtask.pressSequentially('find sources');
  await subtask.press('Enter');
  const box = sheet.getByRole('button', { name: 'Change: find sources', exact: true });
  await expect(box).toBeVisible();
  await box.locator('xpath=..').getByRole('button', { name: 'Remove' }).click();
  await expect(box).toHaveCount(0);
  await expect(sheet.getByText('Removed: find sources.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect(box).toBeVisible();
  const rows = await waitRows(name, (all) => [...all.values()].some((row) => row.title === 'find sources' && row.deleted === null));
  expect([...rows.values()].filter((row) => row.parent)).toHaveLength(1);
});

test('at 412 wide, a row that ends in a control keeps its count and its squares, all of them inside the row; a row with nothing at its end keeps both', async ({ deviceA: a }) => {
  await onToday([a], 'narrow');
  await a.page.setViewportSize({ width: 412, height: 915 });
  await quickAdd(a.page, 'essay ~4');
  await quickAdd(a.page, 'flashcards ~3');
  const next = taskRow(a.page, 'essay');
  await expect(next.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  expect((await next.boundingBox())!.width).toBeLessThan(400);
  await expect(next).toContainText('0 of 4');
  // Squares never hide now (DESIGN.md, Task row): where the title leaves no room they take a line
  // of their own under the count and the button, still inside the row.
  const squares = next.locator('[data-squares] i').filter({ visible: true });
  await expect(squares).toHaveCount(4);
  const row = (await next.boundingBox())!;
  for (const box of await squares.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
    expect(box.width, 'a square is not drawn').toBeGreaterThan(0);
    expect(box.left >= row.x - 0.5 && box.right <= row.x + row.width + 0.5, 'a square stands outside its row').toBe(true);
  }
  const later = taskRow(a.page, 'flashcards');
  await expect(later).toContainText('0 of 3');
  await expect(later.locator('i[style*="--share"]').first()).toBeVisible();
});

// A task with subtasks (DESIGN.md): ticked on Today's opened row, made and changed in the sheet.

/** A task with four subtasks, the first two done, written from Node. */
const withSubs = (node: Node) => {
  node.engine.write('task', 'essay', { title: 'essay', order: 'V' });
  node.engine.write('task', 'later', { title: 'later one', order: 'W' });
  ['outline', 'sources', 'draft', 'edit'].forEach((title, i) => node.engine.write('task', `s${i}`, { title, parent: 'essay', order: `V${i}`, ...(i < 2 && { done: Date.now() - 60000 }) }));
};
/** A task's subtasks in order on the server, by their `order`. */
const subsOn = async (name: string, parent: string) =>
  [...(await serverRows(server, name, 'task')).values()]
    .filter((r) => r.parent === parent && r.deleted == null)
    .sort((x, y) => String(x.order).localeCompare(String(y.order)))
    .map((r) => r.title);

test('on Today, "2 of 4 subtasks" opens the four under the task; ticking the last two leaves the task undone and still Next, "4 of 4 subtasks"; its own box finishes it; Today has no field to add one', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'subtoday', withSubs);
  await signIn(b.page, name);
  await expect(startButton(b.page)).toBeVisible();
  for (const d of [a, b]) await go(d.page, 'Today');
  const count = (page: Page, text: string) => taskRow(page, 'essay').getByRole('button', { name: text, exact: true });
  const sub = (page: Page, title: string) => taskRow(page, 'essay').getByRole('checkbox', { name: `Done: ${title}`, exact: true });

  await expect(count(a.page, '2 of 4 subtasks')).toHaveAttribute('aria-expanded', 'false');
  await expect(sub(a.page, 'outline')).toHaveCount(0);
  await count(a.page, '2 of 4 subtasks').click();
  await expect(count(a.page, '2 of 4 subtasks')).toHaveAttribute('aria-expanded', 'true');
  // In their order, the done ones ticked.
  const boxes = taskRow(a.page, 'essay').getByRole('checkbox', { name: /^Done: / });
  expect(await boxes.evaluateAll((els) => els.map((el) => `${el.getAttribute('aria-label')} ${el.getAttribute('aria-checked')}`))).toEqual(['Done: essay false', 'Done: outline true', 'Done: sources true', 'Done: draft false', 'Done: edit false']);
  // Only ticking happens there: no field.
  await expect(a.page.getByRole('main').getByRole('textbox', { name: /subtask/i })).toHaveCount(0);
  await expect(taskRow(a.page, 'essay').getByRole('textbox')).toHaveCount(0);

  for (const title of ['draft', 'edit']) await sub(a.page, title).click();
  await expect(count(a.page, '4 of 4 subtasks')).toBeVisible();
  // The bar says the task is still to tick.
  await expect(a.page.getByRole('status').filter({ hasText: 'All 4 subtasks done. Tick the task to finish it' })).toHaveCount(1);
  await expect(count(b.page, '4 of 4 subtasks')).toBeVisible({ timeout: 3000 });
  // Jira's rule: every subtask ticked finishes nothing but them.
  await expect(a.page.getByRole('checkbox', { name: 'Done: essay', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(list(a.page, 'Next')).toContainText('essay');
  await expect.poll(async () => (await serverRows(server, name, 'task')).get('essay')?.done ?? null).toBeNull();
  expect([...(await serverRows(server, name, 'task')).values()].filter((r) => r.parent === 'essay').every((r) => typeof r.done === 'number')).toBe(true);

  // The task's own box finishes it.
  await a.page.getByRole('checkbox', { name: 'Done: essay', exact: true }).click();
  await expect.poll(async () => typeof (await serverRows(server, name, 'task')).get('essay')?.done).toBe('number');
  await expect(list(b.page, 'Next')).not.toContainText('essay', { timeout: 3000 });
});

test('in the sheet: a subtask is added, renamed where it stands (and B has the new name), removed with Undo where it stood, and put in order by a press and hold and by a mouse drag', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'subsheet', withSubs);
  await signIn(b.page, name);
  await expect(startButton(b.page)).toBeVisible();
  for (const d of [a, b]) await go(d.page, 'Today');
  const sheet = await openSheet(a.page, 'essay');
  // The subtasks' titles in the sheet, in order; one ticked on Today says so after its title.
  const named = () => sheet.getByRole('button', { name: /^Change: / }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!.slice('Change: '.length)));
  const shown = async () => (await named()).map((title) => title.replace(/, ticked$/, ''));
  const change = (title: string) => sheet.getByRole('button', { name: new RegExp(`^Change: ${title}(, ticked)?$`) });
  // Rows of words, no box.
  expect(await named()).toEqual(['outline, ticked', 'sources, ticked', 'draft', 'edit']);
  await expect(sheet.getByRole('checkbox', { name: /, done$|^Done: (outline|sources|draft|edit)$/ })).toHaveCount(0);

  // Added at the foot.
  const field = sheet.getByRole('textbox', { name: 'New subtask' });
  await field.fill('proofread');
  await field.press('Enter');
  await expect.poll(shown).toEqual(['outline', 'sources', 'draft', 'edit', 'proofread']);
  await expect.poll(() => subsOn(name, 'essay')).toEqual(['outline', 'sources', 'draft', 'edit', 'proofread']);

  // Renamed where it stands: the words become a field, focused, and every change is kept as typed.
  await sheet.getByRole('button', { name: 'Change: draft', exact: true }).click();
  const title = sheet.getByRole('textbox', { name: 'Subtask', exact: true });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('draft');
  await title.fill('first draft');
  await title.press('Enter');
  await expect.poll(shown).toEqual(['outline', 'sources', 'first draft', 'edit', 'proofread']);
  await expect.poll(() => subsOn(name, 'essay')).toEqual(['outline', 'sources', 'first draft', 'edit', 'proofread']);
  await taskRow(b.page, 'essay').getByRole('button', { name: /^\d of 5 subtasks$/ }).click();
  await expect(taskRow(b.page, 'essay').getByRole('checkbox', { name: 'Done: first draft', exact: true })).toBeVisible({ timeout: 3000 });

  // Removed: said where it stood, and Undo brings it back there.
  await change('sources').locator('xpath=..').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect.poll(shown).toEqual(['outline', 'first draft', 'edit', 'proofread']);
  const removed = sheet.getByText('Removed: sources.');
  await expect(removed).toBeVisible();
  const at = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!.y;
  const y = await at(removed);
  expect(y > (await at(change('outline'))) && y < (await at(change('first draft'))), 'the removed line is not where sources stood').toBe(true);
  await expect.poll(() => subsOn(name, 'essay')).toEqual(['outline', 'first draft', 'edit', 'proofread']);
  await sheet.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(shown).toEqual(['outline', 'sources', 'first draft', 'edit', 'proofread']);
  await expect.poll(() => subsOn(name, 'essay')).toEqual(['outline', 'sources', 'first draft', 'edit', 'proofread']);

  // In order by hand: proofread held, carried over outline; then edit dragged at once below proofread's place.
  const middle = async (title: string) => {
    const box = (await change(title).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: box.y, bottom: box.y + box.height };
  };
  // Measured once the list stands still in the middle of the sheet: held near its edge, the sheet scrolls under the row.
  const centre = async () => {
    await midScreen(sheet.getByRole('group', { name: 'Subtasks', exact: true }));
    await settle(a.page);
  };
  const carry = async (from: string, to: string, hold: number) => {
    const toY = (await middle(to)).top - 4;
    const p = await middle(from);
    await a.page.mouse.move(p.x, p.y);
    await a.page.mouse.down();
    await a.page.waitForTimeout(hold);
    await a.page.mouse.move(p.x, toY, { steps: 14 });
    await a.page.waitForTimeout(150);
    await a.page.mouse.up();
    await settle(a.page);
  };
  await centre();
  await carry('proofread', 'outline', 500);
  await expect.poll(shown).toEqual(['proofread', 'outline', 'sources', 'first draft', 'edit']);
  await expect.poll(() => subsOn(name, 'essay')).toEqual(['proofread', 'outline', 'sources', 'first draft', 'edit']);
  // A plain press on the words still edits; carrying one did not.
  await expect(sheet.getByRole('textbox', { name: 'Subtask', exact: true })).toHaveCount(0);
  await centre();
  await carry('edit', 'outline', 100);
  await expect.poll(shown).toEqual(['proofread', 'edit', 'outline', 'sources', 'first draft']);
  await expect.poll(() => subsOn(name, 'essay')).toEqual(['proofread', 'edit', 'outline', 'sources', 'first draft']);
  await expect(sheet.getByRole('textbox', { name: 'Subtask', exact: true })).toHaveCount(0);
});

test('a click anywhere on a task\'s row but its controls opens the task: on the title of a task with subtasks, and in the middle of the Next card at laptop width', async ({ deviceA: a }) => {
  await signedInto(a, 'rowclick', (node: Node) => {
    node.engine.write('task', 'next', { title: 'reading', order: 'U' });
    node.engine.write('task', 'essay', { title: 'essay', order: 'V' });
    ['outline', 'sources'].forEach((title, i) => node.engine.write('task', `s${i}`, { title, parent: 'essay', order: `V${i}` }));
  });
  const sheet = a.page.getByRole('dialog', { name: 'Task', exact: true });
  const clickAt = async (x: number, y: number, what: string) => {
    await a.page.mouse.click(Math.round(x), Math.round(y));
    await expect(sheet, `${what} opened nothing`).toBeVisible({ timeout: 2000 });
    await a.page.keyboard.press('Escape');
    await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  };
  for (const width of [412, 1440]) {
    await a.page.setViewportSize({ width, height: 900 });
    await go(a.page, 'Today');
    await settle(a.page);
    // The title's words, of a task whose line under it holds "0 of 2 subtasks".
    const title = (await taskRow(a.page, 'essay').getByText('essay', { exact: true }).boundingBox())!;
    await clickAt(title.x + title.width / 2, title.y + title.height / 2, `at ${width}, the title of a task with subtasks`);
    await expect(taskRow(a.page, 'essay').getByRole('button', { name: '0 of 2 subtasks' })).toHaveAttribute('aria-expanded', 'false');
    // The middle of the Next card, between its words and its Start.
    const row = (await taskRow(a.page, 'reading').boundingBox())!;
    await clickAt(row.x + row.width / 2, row.y + row.height / 2, `at ${width}, the middle of the Next card`);
  }
});
