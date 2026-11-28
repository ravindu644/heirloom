// Today's rows in the hand and a task's subtasks in their band (DESIGN.md "Putting rows in order"
// and "A task with subtasks"): each test runs once with a finger on a 412 phone and once with a
// mouse on a 1440 laptop, against the real server.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import { serverRows } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { go, habitRow, list, roundsOf, server, settle, signedInto, startButton, strip, taskRow, titles } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

const MIN = 60000;
const OFF = -new Date().getTimezoneOffset();
const yesterday = () => localDay(Date.now() - 24 * 60 * MIN, OFF);

/** A finger or a mouse: pressed at a point, held, moved there in steps, let go. */
type Hand = { down(x: number, y: number): Promise<void>; move(x: number, y: number): Promise<void>; up(): Promise<void> };
async function handOf(page: Page, touch: boolean): Promise<Hand> {
  let at = { x: 0, y: 0 };
  if (!touch)
    return {
      async down(x, y) {
        at = { x, y };
        await page.mouse.move(x, y);
        await page.mouse.down();
      },
      async move(x, y) {
        at = { x, y };
        await page.mouse.move(x, y, { steps: 14 });
      },
      up: () => page.mouse.up(),
    };
  const cdp = await page.context().newCDPSession(page);
  const touchAt = (type: 'touchStart' | 'touchMove', x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x, y }] });
  return {
    async down(x, y) {
      at = { x, y };
      await touchAt('touchStart', x, y);
    },
    async move(x, y) {
      for (let i = 1; i <= 14; i++) {
        await touchAt('touchMove', at.x + ((x - at.x) * i) / 14, at.y + ((y - at.y) * i) / 14);
        await page.waitForTimeout(16);
      }
      at = { x, y };
    },
    up: async () => void (await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })),
  };
}

/** A tap or a click at a point of a locator, as the hand of this run makes it. */
const press = (locator: ReturnType<Page['locator']>, touch: boolean, position?: { x: number; y: number }) => (touch ? locator.tap({ position }) : locator.click({ position }));

const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;
const order = async (name: string) =>
  [...(await serverRows(server, name, 'task')).values()]
    .filter((r) => !r.parent && !r.deleted)
    .sort((x, y) => String(x.order).localeCompare(String(y.order)))
    .map((r) => r.title);
const later = (page: Page) => page.getByRole('heading', { name: /^Later today/, level: 2 });

for (const [how, size] of [['a finger at 412', { width: 412, height: 915 }], ['a mouse at 1440', { width: 1440, height: 900 }]] as const) {
  const touch = how.startsWith('a finger');
  /** The device of this run: the phone for a finger, a laptop for a mouse. */
  const pick = (f: { deviceA: Device; phone: Device }) => (touch ? f.phone : f.deviceA);
  const ready = async (d: Device, tag: string, seed: (node: Node) => void, lengths: Parameters<typeof signedInto>[3] = {}) => {
    await d.page.setViewportSize(size);
    const { name } = await signedInto(d, tag, seed, lengths);
    await go(d.page, 'Today');
    await settle(d.page);
    return name;
  };

  test(`${how}: the Next card held and carried below the only Later row: while held the other row has Start and the Next outline and "Later today" stands over the carried card; let go, the order holds on screen and on the server`, async ({ deviceA, phone }) => {
    const d = pick({ deviceA, phone });
    const name = await ready(d, 'carrynext', (node) => {
      node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
      node.engine.write('task', 'b', { title: 'bravo', order: 'B' });
    });
    await expect.poll(() => titles(d.page)).toEqual(['alpha', 'bravo']);
    const hand = await handOf(d.page, touch);
    const alpha = await box(taskRow(d.page, 'alpha'));
    const bravo = await box(taskRow(d.page, 'bravo'));
    await hand.down(alpha.x + alpha.width / 2, alpha.y + alpha.height / 2);
    await d.page.waitForTimeout(500);
    await expect(d.page.locator('[data-lifted]'), 'the Next card did not lift').toHaveCount(1);
    await hand.move(alpha.x + alpha.width / 2, bravo.y + bravo.height + 8);
    await d.page.waitForTimeout(400);

    // While it is held: bravo is the Next card as it will be, Start and outline, and in sight.
    await expect(taskRow(d.page, 'bravo')).toBeInViewport();
    await expect(taskRow(d.page, 'bravo').getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await expect(taskRow(d.page, 'bravo')).toHaveClass(/_next_/);
    // "Later today" is drawn, over the card in the hand.
    await expect(later(d.page)).toBeVisible();
    const heading = await box(later(d.page));
    const carried = await box(d.page.locator('[data-lifted]'));
    expect(heading.y + heading.height, '"Later today" is not over the carried card').toBeLessThanOrEqual(carried.y + 1);

    await hand.up();
    await settle(d.page);
    await expect.poll(() => titles(d.page)).toEqual(['bravo', 'alpha']);
    await expect(list(d.page, 'Next')).toContainText('bravo');
    await expect(list(d.page, 'Later today')).toContainText('alpha');
    await expect.poll(() => order(name)).toEqual(['bravo', 'alpha']);
    await expect(d.page.locator('dialog[open]'), 'letting go opened the row').toHaveCount(0);
  });

  test(`${how}: an overdue Later row, due yesterday, held over the Next card still says "yesterday" while held and after it is let go; its due date on the server is unchanged`, async ({ deviceA, phone }) => {
    const d = pick({ deviceA, phone });
    const due = yesterday();
    const name = await ready(d, 'carrylate', (node) => {
      node.engine.write('task', 'a', { title: 'alpha', order: 'A' });
      node.engine.write('task', 'l', { title: 'late one', due, order: 'B' });
    });
    await expect.poll(() => titles(d.page)).toEqual(['alpha', 'late one']);
    await expect(taskRow(d.page, 'late one')).toContainText('yesterday');
    const hand = await handOf(d.page, touch);
    const late = await box(taskRow(d.page, 'late one'));
    const alpha = await box(taskRow(d.page, 'alpha'));
    await hand.down(late.x + late.width / 2, late.y + late.height / 2);
    await d.page.waitForTimeout(500);
    await expect(d.page.locator('[data-lifted]'), 'the overdue row did not lift').toHaveCount(1);
    await hand.move(late.x + late.width / 2, alpha.y + 4);
    await d.page.waitForTimeout(400);
    // Over the top place: it would be Next, and it keeps its day.
    await expect(taskRow(d.page, 'late one')).toHaveClass(/_next_/);
    await expect(taskRow(d.page, 'late one')).toContainText('yesterday');
    await hand.up();
    await settle(d.page);
    await expect.poll(() => titles(d.page)).toEqual(['late one', 'alpha']);
    await expect(taskRow(d.page, 'late one')).toContainText('yesterday');
    await expect.poll(() => order(name)).toEqual(['late one', 'alpha']);
    expect((await serverRows(server, name, 'task')).get('l')?.due, 'setting it down changed its day').toBe(due);
  });

  test(`${how}: the band at the card's foot opens its subtasks, pressed anywhere along it; a subtask is ticked by its words too`, async ({ deviceA, phone }) => {
    const d = pick({ deviceA, phone });
    const name = await ready(d, 'band', (node) => {
      node.engine.write('task', 'essay', { title: 'essay', order: 'A' });
      ['outline', 'sources', 'draft'].forEach((title, i) => node.engine.write('task', `s${i}`, { title, parent: 'essay', order: `V${i}`, ...(i === 0 && { done: Date.now() - MIN }) }));
    });
    const band = taskRow(d.page, 'essay').getByRole('button', { name: '1 of 3 subtasks', exact: true });
    await expect(band).toHaveAttribute('aria-expanded', 'false');
    // The whole band is the target: pressed near its right end, far from its words.
    const b = await box(band);
    const row = await box(taskRow(d.page, 'essay'));
    expect(b.width, 'the band is not as wide as its card').toBeGreaterThan(row.width * 0.8);
    await press(band, touch, { x: b.width - 12, y: b.height / 2 });
    await expect(band).toHaveAttribute('aria-expanded', 'true');
    await expect(d.page.locator('dialog[open]'), 'the band opened the task').toHaveCount(0);
    const sub = (title: string) => taskRow(d.page, 'essay').getByRole('checkbox', { name: `Done: ${title}`, exact: true });
    await expect(sub('outline')).toHaveAttribute('aria-checked', 'true');
    // Its words tick it: pressed on "sources".
    await press(sub('sources').getByText('sources', { exact: true }), touch);
    await expect(sub('sources')).toHaveAttribute('aria-checked', 'true');
    await expect(taskRow(d.page, 'essay').getByRole('button', { name: '2 of 3 subtasks', exact: true })).toBeVisible();
    await expect.poll(async () => typeof (await serverRows(server, name, 'task')).get('s1')?.done).toBe('number');
    await expect(taskRow(d.page, 'essay').getByRole('checkbox', { name: 'Done: essay', exact: true })).toHaveAttribute('aria-checked', 'false');
  });

  test(`${how}: during a lap on a task with subtasks the band hangs under the strip and opens them; one ticked there shows on the task's row after the lap; in the break the strip has no band`, async ({ deviceA, phone }) => {
    test.setTimeout(90000);
    const d = pick({ deviceA, phone });
    const name = await ready(
      d,
      'tray',
      (node) => {
        node.engine.write('task', 'essay', { title: 'essay', order: 'A' });
        ['outline', 'sources'].forEach((title, i) => node.engine.write('task', `s${i}`, { title, parent: 'essay', order: `V${i}` }));
      },
      { work_ms: 15000, short_ms: 60000 },
    );
    // The lap starts on the Next card, from Today.
    await press(taskRow(d.page, 'essay').getByRole('button', { name: 'Start', exact: true }), touch);
    await expect(strip(d.page)).toContainText('essay');
    // Off the list while it runs, so the one band on the screen is the strip's.
    await expect(d.page.getByRole('checkbox', { name: 'Done: essay', exact: true })).toHaveCount(0);
    const tray = strip(d.page).locator('..').getByRole('button', { name: '0 of 2 subtasks', exact: true });
    await expect(tray).toBeVisible();
    await press(tray, touch);
    await expect(tray).toHaveAttribute('aria-expanded', 'true');
    await press(strip(d.page).locator('..').getByRole('checkbox', { name: 'Done: outline', exact: true }), touch);
    await expect(strip(d.page).locator('..').getByRole('button', { name: '1 of 2 subtasks', exact: true })).toBeVisible();
    await expect.poll(async () => typeof (await serverRows(server, name, 'task')).get('s0')?.done).toBe('number');

    // The bell, then the break from Focus: the strip is the break's and holds no band; the task's row holds them, ticked.
    await go(d.page, 'Focus');
    const rest = d.page.getByRole('button', { name: 'Start 1 min break', exact: true });
    await expect(rest).toBeVisible({ timeout: 30000 });
    await press(rest, touch);
    await expect(d.page.getByRole('button', { name: 'Done for now', exact: true })).toBeVisible();
    await go(d.page, 'Today');
    await expect(strip(d.page)).toBeVisible();
    await expect(strip(d.page).locator('..').getByRole('button', { name: /subtasks?$/ }), 'the break\'s strip holds a band').toHaveCount(0);
    const row = taskRow(d.page, 'essay');
    await expect(row.getByRole('button', { name: '1 of 2 subtasks', exact: true })).toBeVisible();
    // Open on the row, as the strip's was.
    await expect(row.getByRole('checkbox', { name: 'Done: outline', exact: true })).toHaveAttribute('aria-checked', 'true');
  });

  test(`${how}: a card with its subtasks open, and a habit with its times open, are carried closed: no rows under them in the hand, set down in their new place, still closed`, async ({ deviceA, phone }) => {
    const d = pick({ deviceA, phone });
    const name = await ready(d, 'carryshut', (node) => {
      node.engine.write('task', 'essay', { title: 'essay', order: 'A' });
      node.engine.write('task', 'b', { title: 'bravo', order: 'B' });
      ['outline', 'sources'].forEach((title, i) => node.engine.write('task', `s${i}`, { title, parent: 'essay', order: `V${i}` }));
      node.engine.write('habit', 'w', { title: 'water', days: 127, target: 3, reminds: ['08:00', '12:00', '18:00'], order: 'V1' });
      node.engine.write('habit', 'r', { title: 'read', days: 127, target: 1, order: 'V2' });
    });
    const hand = await handOf(d.page, touch);
    // Held as each hand holds: a finger rests, a mouse presses and moves.
    const pickUp = async (at: { x: number; y: number }) => {
      await hand.down(at.x, at.y);
      if (touch) await d.page.waitForTimeout(500);
      else await hand.move(at.x, at.y + 12);
      await expect(d.page.locator('[data-lifted]'), 'the card did not lift').toHaveCount(1);
    };
    const titleOf = async (locator: ReturnType<Page['locator']>) => {
      const b = await box(locator);
      return { x: b.x + Math.min(b.width / 2, 8), y: b.y + b.height / 2 };
    };

    // The task: its band opened, then the card carried below bravo.
    const band = (text: string) => taskRow(d.page, 'essay').getByRole('button', { name: text, exact: true });
    await press(band('0 of 2 subtasks'), touch);
    await expect(band('0 of 2 subtasks')).toHaveAttribute('aria-expanded', 'true');
    const subs = d.page.getByRole('checkbox', { name: /^Done: (outline|sources)$/ }).filter({ visible: true });
    await expect(subs).toHaveCount(2);
    await settle(d.page);
    await pickUp(await titleOf(taskRow(d.page, 'essay').getByText('essay', { exact: true })));
    await expect(subs, 'the subtasks are carried open').toHaveCount(0);
    await expect(band('0 of 2 subtasks')).toHaveAttribute('aria-expanded', 'false');
    const bravo = await box(taskRow(d.page, 'bravo'));
    await hand.move(bravo.x + bravo.width / 2, bravo.y + bravo.height + 8);
    await d.page.waitForTimeout(300);
    await expect(subs, 'the subtasks opened again in the hand').toHaveCount(0);
    await hand.up();
    await settle(d.page);
    await expect.poll(() => titles(d.page)).toEqual(['bravo', 'essay']);
    await expect.poll(() => order(name)).toEqual(['bravo', 'essay']);
    await expect(band('0 of 2 subtasks'), 'set down, the band opened again').toHaveAttribute('aria-expanded', 'false');
    await expect(subs).toHaveCount(0);

    // The habit: its times opened, then the row carried below read.
    await go(d.page, 'Habits');
    await expect(habitRow(d.page, 'water')).toBeVisible();
    await settle(d.page);
    await roundsOf(d.page, 'water');
    const arrow = habitRow(d.page, 'water').getByRole('button', { name: /^Today's times, / });
    const rounds = d.page.getByRole('checkbox', { name: /^water, / }).filter({ visible: true });
    await expect(rounds).toHaveCount(3);
    await settle(d.page);
    await pickUp(await titleOf(habitRow(d.page, 'water').locator('[id^="h-"]')));
    await expect(rounds, 'the times are carried open').toHaveCount(0);
    await expect(arrow).toHaveAttribute('aria-expanded', 'false');
    const read = await box(habitRow(d.page, 'read'));
    await hand.move(read.x + read.width / 2, read.y + read.height + 8);
    await d.page.waitForTimeout(300);
    await hand.up();
    // Straight after the drop, inside the 300 ms the release's click is swallowed for: a tap on
    // the bottom bar is not that click (a finger's release makes none), so it must go through.
    await go(d.page, 'Today');
    await expect(taskRow(d.page, 'essay'), 'the tap after the drop was eaten').toBeVisible({ timeout: 1000 });
    const habits = async () =>
      [...(await serverRows(server, name, 'habit')).values()].sort((x, y) => String(x.order).localeCompare(String(y.order))).map((r) => r.title);
    await expect.poll(habits).toEqual(['read', 'water']);
    await go(d.page, 'Habits');
    await settle(d.page);
    await expect(arrow, 'set down, the times opened again').toHaveAttribute('aria-expanded', 'false');
    await expect(rounds).toHaveCount(0);
  });

  test(`${how}: an open card let go while its subtasks are still folding, and one carried and brought back to where it started: nothing moves, no sheet opens, and the band is open again`, async ({ deviceA, phone }) => {
    const d = pick({ deviceA, phone });
    const name = await ready(d, 'foldback', (node) => {
      node.engine.write('task', 'essay', { title: 'essay', order: 'A' });
      node.engine.write('task', 'b', { title: 'bravo', order: 'B' });
      ['outline', 'sources'].forEach((title, i) => node.engine.write('task', `s${i}`, { title, parent: 'essay', order: `V${i}` }));
    });
    const hand = await handOf(d.page, touch);
    const band = taskRow(d.page, 'essay').getByRole('button', { name: '0 of 2 subtasks', exact: true });
    const subs = d.page.getByRole('checkbox', { name: /^Done: (outline|sources)$/ }).filter({ visible: true });
    const words = async () => {
      const b = await box(taskRow(d.page, 'essay').getByText('essay', { exact: true }));
      return { x: b.x + Math.min(b.width / 2, 8), y: b.y + b.height / 2 };
    };
    const unchanged = async (what: string) => {
      await d.page.waitForTimeout(400);
      await expect(d.page.locator('dialog[open]'), `${what}: the release opened the task`).toHaveCount(0);
      await expect(band, `${what}: the band did not open again`).toHaveAttribute('aria-expanded', 'true');
      await expect(subs, `${what}: its subtasks are not back`).toHaveCount(2);
      // The tasks' own boxes only: an open band's subtasks have "Done:" boxes too.
      const tasks = await d.page.getByRole('checkbox', { name: /^Done: (essay|bravo)$/ }).evaluateAll((els) => els.filter((el) => !el.closest('[inert]')).map((el) => el.getAttribute('aria-label')));
      expect(tasks, `${what}: a row moved`).toEqual(['Done: essay', 'Done: bravo']);
    };
    await press(band, touch);
    await expect(band).toHaveAttribute('aria-expanded', 'true');
    await expect(subs).toHaveCount(2);
    await settle(d.page);

    // Let go at once, while it folds: the finger after its hold, the mouse as soon as it has moved past the slop.
    const at = await words();
    await hand.down(at.x, at.y);
    if (touch) await d.page.waitForTimeout(500);
    else await hand.move(at.x, at.y + 12);
    await hand.up();
    await unchanged('let go while folding');

    // Carried past bravo, then brought back to where it started, and let go there.
    await settle(d.page);
    const from = await words();
    await hand.down(from.x, from.y);
    if (touch) await d.page.waitForTimeout(500);
    else await hand.move(from.x, from.y + 12);
    await expect(d.page.locator('[data-lifted]')).toHaveCount(1);
    await d.page.waitForTimeout(400);
    const bravo = await box(taskRow(d.page, 'bravo'));
    await hand.move(from.x, bravo.y + bravo.height + 8);
    await d.page.waitForTimeout(300);
    await hand.move(from.x, from.y);
    await d.page.waitForTimeout(300);
    await hand.up();
    await settle(d.page);
    await unchanged('brought back');
    await expect.poll(() => order(name)).toEqual(['essay', 'bravo']);
  });
}

test('in the task sheet a subtask held and carried down past another: the row passed glides there, not jumps; let go, the order holds, on the server and when the sheet is opened again', async ({ deviceA: a }) => {
  await a.page.setViewportSize({ width: 1440, height: 900 });
  const { name } = await signedInto(a, 'sheetglide', (node) => {
    node.engine.write('task', 'essay', { title: 'essay', order: 'A' });
    ['one', 'two', 'three'].forEach((title, i) => node.engine.write('task', `s${i}`, { title, parent: 'essay', order: `V${i}` }));
  });
  await go(a.page, 'Today');
  const open = async () => {
    const target = taskRow(a.page, 'essay').getByRole('button', { name: /^essay/ });
    const [t, w] = [await box(target), await box(taskRow(a.page, 'essay').getByText('essay', { exact: true }))];
    await target.click({ position: { x: w.x - t.x + 4, y: w.y - t.y + w.height / 2 } });
    const sheet = a.page.getByRole('dialog', { name: 'Task', exact: true });
    await expect(sheet).toBeVisible();
    await settle(a.page);
    return sheet;
  };
  let sheet = await open();
  const shown = (dialog: typeof sheet) => dialog.getByRole('button', { name: /^Change: / }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!.slice('Change: '.length)));
  expect(await shown(sheet)).toEqual(['one', 'two', 'three']);
  const rowOf = (title: string) => sheet.locator('[data-lift]').filter({ has: a.page.getByRole('button', { name: `Change: ${title}`, exact: true }) });
  await rowOf('two').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await settle(a.page);

  const one = await box(rowOf('one'));
  const two = await box(rowOf('two'));
  await a.page.mouse.move(one.x + one.width / 2, one.y + one.height / 2);
  await a.page.mouse.down();
  await a.page.waitForTimeout(500);
  await expect(a.page.locator('[data-lifted]')).toHaveCount(1);
  // Where "two" stands, frame by frame, while "one" is carried past its middle.
  const frames = rowOf('two').evaluate(async (el) => {
    const seen: number[] = [];
    for (let i = 0; i < 45; i++) {
      seen.push(new DOMMatrix(getComputedStyle(el).transform).m42);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return seen;
  });
  await a.page.mouse.move(one.x + one.width / 2, two.y + two.height + 6, { steps: 10 });
  const seen = await frames;
  const last = seen.at(-1)!;
  expect(Math.abs(last), `"two" never moved out of the way: ${seen.join(', ')}`).toBeGreaterThan(one.height / 2);
  // Between where it stood and where it went: some frame in the middle of the way.
  expect(seen.some((y) => Math.abs(y) > 1 && Math.abs(y) < Math.abs(last) - 1), `"two" jumped, with no frame on the way: ${seen.join(', ')}`).toBe(true);
  await a.page.mouse.up();
  await settle(a.page);

  await expect.poll(() => shown(sheet)).toEqual(['two', 'one', 'three']);
  const subs = async () =>
    [...(await serverRows(server, name, 'task')).values()].filter((r) => r.parent === 'essay' && !r.deleted).sort((x, y) => String(x.order).localeCompare(String(y.order))).map((r) => r.title);
  await expect.poll(subs).toEqual(['two', 'one', 'three']);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  sheet = await open();
  expect(await shown(sheet)).toEqual(['two', 'one', 'three']);
});
