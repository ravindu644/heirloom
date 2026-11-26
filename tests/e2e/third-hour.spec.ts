// What the user's third hour found (roadmap section 13), each as the person meets it, at 412x915
// unless a test says otherwise: the keyboard after an add, a reminder for each time of a habit's
// day, squares eight to a line, a task's own lengths, the hint as an example, the task chosen on
// Focus, and a count that says of what. Then two no-loss cases through two real devices.
import type { Page } from '@playwright/test';
import { serverRows } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { go, lapLine, list, ready, server, settle, signedInto, signIn, startButton, startNow, staysPut, taskRow } from './app.ts';
import { expect, test } from './devices.ts';

const PHONE = { width: 412, height: 915 };
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const rowOf = async (name: string, dataset: string, id: string) => (await serverRows(server, name, dataset)).get(id);
const timer = async (name: string) => (await serverRows(server, name, 'timer')).get('current')?.state as { phase: string; task: string | null } | undefined;

/** A second browser of the same account, signed in and ready for whichever lap of today is next. */
async function also(d: { page: Page }, name: string) {
  await signIn(d.page, name);
  await expect(startButton(d.page)).toBeVisible();
}

// 1. Adding puts the keyboard away.

/** The field with the focus, by its name, or null. */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('name') ?? null);

test('adding a task or a habit on a phone with its keyboard up lets go of the field and the bar says what was added, in sight; a subtask keeps the keyboard; on a laptop every field keeps the focus', async ({ phone, deviceA: laptop }) => {
  const { name } = await signedInto(phone, 'keys', (node) => node.engine.write('task', 'parent', { title: 'thesis', order: 'V' }));
  const fields: [string, string, (page: Page) => Promise<void>][] = [
    ['task', 'Add a task', (page) => go(page, 'Today')],
    ['habit', 'Add a habit', (page) => go(page, 'Habits')],
    ['subtask', 'New subtask', async (page) => {
      await go(page, 'Today');
      await taskRow(page, 'thesis').getByRole('button', { name: /thesis/ }).click();
      await expect(page.getByRole('dialog', { name: 'Task', exact: true })).toBeVisible();
    }],
  ];
  let n = 0;
  for (const [field, label, reach] of fields) {
    for (const how of ['Enter', 'Add'] as const) {
      await phone.page.setViewportSize(PHONE);
      await reach(phone.page);
      const box = phone.page.getByLabel(label, { exact: true });
      await box.tap();
      // The keyboard, as the window sees it: a third of the screen gone from under the field.
      await phone.page.setViewportSize({ width: 412, height: 560 });
      await phone.page.waitForTimeout(250);
      const typed = `${field} by ${how} ${++n}`;
      await box.pressSequentially(typed);
      if (how === 'Enter') await phone.page.keyboard.press('Enter');
      else await phone.page.getByRole('button', { name: 'Add', exact: true }).tap();
      await expect(box).toHaveValue('');
      if (field === 'subtask') {
        // A subtask's field keeps the keyboard: no bar speaks there, and the next piece follows.
        await phone.page.waitForTimeout(200);
        expect(await focused(phone.page), 'subtask: the field let go of the focus').toBe(field);
      } else {
        await expect.poll(() => focused(phone.page), { message: `${field}, ${how}: the field kept the focus, so the keyboard stays` }).not.toBe(field);
      }
      // The keyboard gone, the window is tall again, and the bar is there to read.
      await phone.page.setViewportSize(PHONE);
      if (field !== 'subtask') {
        // The bar's region is a zero-height line at the screen's foot: its words are what is seen.
        const bar = phone.page.getByRole('status').filter({ hasText: `Added: ${typed}` }).locator('p').first();
        // Soft: the rest of the walk still runs when one field's bar is missing.
        await expect.soft(bar, `${field}, ${how}: no bar says "Added: ${typed}" (the bars: ${await phone.page.getByRole('status').allInnerTexts()})`).toBeVisible();
        const r = ((await bar.count()) ? await bar.boundingBox() : null) ?? { y: -1, height: 0 };
        expect.soft(r.y >= 0 && r.y + r.height <= PHONE.height, `${field}, ${how}: the bar is out of sight`).toBe(true);
      } else {
        await expect(phone.page.getByRole('dialog', { name: 'Task', exact: true }).getByRole('checkbox', { name: `Done: ${typed}` })).toBeVisible();
        await phone.page.keyboard.press('Escape');
      }
    }
  }

  // A laptop: no keyboard to put away, the field is kept for the next one, by Enter or by the mouse on Add.
  await signIn(laptop.page, name);
  await ready(laptop.page);
  for (const [field, label, reach] of fields) {
    await reach(laptop.page);
    const box = laptop.page.getByLabel(label, { exact: true });
    await box.click();
    await box.pressSequentially(`${field} on a laptop`);
    await laptop.page.keyboard.press('Enter');
    await expect(box).toHaveValue('');
    expect(await focused(laptop.page), `${field}: Enter took the focus away on a laptop`).toBe(field);
    await box.pressSequentially(`${field} on a laptop, twice`);
    await laptop.page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(box).toHaveValue('');
    expect(await focused(laptop.page), `${field}: a click on Add took the focus away on a laptop`).toBe(field);
    if (field === 'subtask') await laptop.page.keyboard.press('Escape');
  }
});

// 2. A reminder for each time of a habit's day.

test('a habit three times a day: two times set out of order stand sorted when it is opened again, with one empty field after them; lowered to once, one time is left, named Reminder; B shows the same', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'reminds');
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Habits');
  const add = a.page.getByLabel('Add a habit', { exact: true });
  await add.fill('water');
  await add.press('Enter');
  const open = async (page: Page) => {
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Check in: water', exact: true }).locator('xpath=..').getByRole('button', { name: /water/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Habit', exact: true });
    await expect(sheet).toBeVisible();
    return sheet;
  };
  const times = (sheet: ReturnType<Page['locator']>) =>
    sheet.locator('input[type="time"]').evaluateAll((els) => els.map((el) => [(el as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? '', (el as HTMLInputElement).value]));

  let sheet = await open(a.page);
  // Once a day: one field, "Reminder", and no way to remove what is not set.
  expect((await times(sheet)).map(([label]) => label)).toEqual(['Reminder']);
  await expect(sheet.getByRole('button', { name: 'Remove the reminders' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'One time more' }).click();
  await sheet.getByRole('button', { name: 'One time more' }).click();
  await expect(sheet).toContainText('3 times a day');
  // Nothing set yet: one empty field to start from, not three.
  await expect.poll(() => times(sheet), { message: 'with no time set, the sheet shows more than one empty field' }).toEqual([['1st reminder', '']]);
  await sheet.getByLabel('1st reminder', { exact: true }).fill('22:00');
  await sheet.getByLabel('2nd reminder', { exact: true }).fill('06:00');
  await expect.poll(async () => (await rowOf(name, 'habit', [...(await serverRows(server, name, 'habit')).keys()][0]!))?.reminds).toEqual(['06:00', '22:00']);
  await sheet.getByRole('button', { name: 'Close' }).click();

  sheet = await open(a.page);
  await expect.poll(() => times(sheet), { message: 'the times do not stand in order, or the fields are not the filled ones and one empty' }).toEqual([
    ['1st reminder', '06:00'],
    ['2nd reminder', '22:00'],
    ['3rd reminder', ''],
  ]);
  expect((await times(sheet)).length).toBeLessThanOrEqual(3);
  const other = await open(b.page);
  await expect.poll(() => times(other)).toEqual([
    ['1st reminder', '06:00'],
    ['2nd reminder', '22:00'],
    ['3rd reminder', ''],
  ]);
  await other.getByRole('button', { name: 'Close' }).click();

  // Removed, said in the sheet with its Undo; the Undo puts both times back.
  const habitId = [...(await serverRows(server, name, 'habit')).keys()][0]!;
  await sheet.getByRole('button', { name: 'Remove the reminders' }).click();
  await expect(sheet.getByText('Reminders removed.')).toBeVisible();
  await expect.poll(async () => (await rowOf(name, 'habit', habitId))?.reminds).toEqual([]);
  await expect(sheet.getByRole('button', { name: 'Remove the reminders' }), 'the link stays with nothing to remove').toHaveCount(0);
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await rowOf(name, 'habit', habitId))?.reminds).toEqual(['06:00', '22:00']);
  await expect.poll(() => times(sheet)).toEqual([
    ['1st reminder', '06:00'],
    ['2nd reminder', '22:00'],
    ['3rd reminder', ''],
  ]);

  // Lowered to once a day: the first time is kept, under its one name.
  await sheet.getByRole('button', { name: 'One time less' }).click();
  await sheet.getByRole('button', { name: 'One time less' }).click();
  await expect(sheet).toContainText('Once a day');
  await expect.poll(() => times(sheet)).toEqual([['Reminder', '06:00']]);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect.poll(async () => (await rowOf(name, 'habit', [...(await serverRows(server, name, 'habit')).keys()][0]!))?.reminds).toEqual(['06:00']);
  const again = await open(b.page);
  await expect.poll(() => times(again)).toEqual([['Reminder', '06:00']]);
  await again.getByRole('button', { name: 'Close' }).click();

  // Once a day there is one to remove, and the link says so.
  sheet = await open(a.page);
  await expect(sheet.getByRole('button', { name: 'Remove the reminder', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
});

// 3. Squares: eight to a line, four lines, never hidden, never past the row.

const LONG = (n: number) => `${n} laps: a title of sixty characters, to give the row a time`.slice(0, 60).padEnd(60, '.');

test('squares at 1, 8, 9, 16, 17, 32 and 33 laps beside a 60 character title, at 412, 471, 1440 and 206: all drawn and inside the row, eight to a line, four lines at most, on one right edge, one pair with the count at their right, never split by the control; 33 shows its count alone; the title keeps 60px and whole words', async ({ deviceA: a }) => {
  const sizes = [1, 8, 9, 16, 17, 32, 33];
  await signedInto(a, 'squares', (node) => sizes.forEach((n, i) => node.engine.write('task', `s${n}`, { title: LONG(n), estimate: n, order: `V${i}` })));
  await go(a.page, 'Today');
  for (const [width, height] of [[412, 915], [471, 915], [1440, 900], [206, 457]] as const) {
    await a.page.setViewportSize({ width, height });
    await settle(a.page);
    for (const n of sizes) {
      const row = taskRow(a.page, LONG(n));
      await row.scrollIntoViewIfNeeded();
      const m = await row.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(el).paddingRight);
        const edge = r.right - pad;
        // The pair is drawn beside the words and under them, one of the two shown.
        const squares = [...el.querySelectorAll('[data-squares] i')].filter((i) => i.checkVisibility()).map((i) => i.getBoundingClientRect());
        const tops = [...new Set(squares.map((s) => Math.round(s.top)))];
        const lines = tops.map((top) => squares.filter((s) => Math.round(s.top) === top));
        const count = [...el.querySelectorAll('[class*="count"]')].find((c) => c.checkVisibility())?.getBoundingClientRect();
        const control = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Start');
        const controlBox = control ? control.getBoundingClientRect() : null;
        const title = el.querySelector('[class*="title"]') as HTMLElement;
        const broken: string[] = [];
        const walk = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) {
          const range = document.createRange();
          for (const w of (t.textContent ?? '').matchAll(/\S+/g)) {
            range.setStart(t, w.index!);
            range.setEnd(t, w.index! + w[0].length);
            if (new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size > 1) broken.push(w[0]);
          }
        }
        return {
          drawn: squares.length,
          perLine: lines.map((l) => l.length),
          rights: [...new Set(lines.map((l) => Math.round(Math.max(...l.map((s) => s.right)))))],
          inside: squares.every((s) => s.width > 0 && s.height > 0 && s.left >= r.left - 0.5 && s.right <= r.right + 0.5 && s.top >= r.top - 0.5 && s.bottom <= r.bottom + 0.5),
          edge: Math.round(edge),
          count: count ? { left: Math.round(count.left), right: Math.round(count.right), top: Math.round(count.top), bottom: Math.round(count.bottom) } : null,
          control: controlBox ? { left: Math.round(controlBox.left), right: Math.round(controlBox.right), bottom: Math.round(controlBox.bottom) } : null,
          first: lines[0] ? { top: Math.round(Math.min(...lines[0].map((s) => s.top))), bottom: Math.round(Math.max(...lines[0].map((s) => s.bottom))) } : null,
          titleWide: Math.round(title.getBoundingClientRect().width),
          broken,
        };
      });
      const where = `${n} laps at ${width}`;
      expect(m.count, `${where}: no count`).not.toBeNull();
      if (n > 32) {
        expect(m.drawn, `${where}: past 32 the count stands alone`).toBe(0);
      } else {
        expect(m.drawn, `${where}: squares hidden`).toBe(n);
        expect(m.inside, `${where}: a square is outside its row or not drawn`).toBe(true);
        expect(Math.max(...m.perLine), `${where}: ${m.perLine.join(',')} to a line`).toBeLessThanOrEqual(8);
        expect(m.perLine.length, `${where}: more than four lines`).toBeLessThanOrEqual(4);
        expect(m.rights, `${where}: the lines do not end on one edge`).toHaveLength(1);
        const right = m.rights[0]!;
        // Squares and count are one pair: the squares end before the count, with a gap, and the
        // count stands at the right of their first line.
        expect(right, `${where}: the squares end at ${right}, the count starts at ${m.count!.left}`).toBeLessThan(m.count!.left);
        expect(m.count!.top <= m.first!.bottom && m.count!.bottom >= m.first!.top, `${where}: the count is not beside the first line of squares`).toBe(true);
        // Never split across the row's control.
        if (m.control) expect(right <= m.control.left && m.count!.left >= m.control.right, `${where}: the control stands between the squares and the count`).toBe(false);
      }
      // The pair ends on the row's edge, or beside the title just left of the row's control.
      const besideControl = m.control !== null && m.count!.right <= m.control.left && m.count!.top < m.control.bottom;
      expect.soft(Math.abs(m.count!.right - m.edge) <= 1 || besideControl, `${where}: the count ends at ${m.count!.right}, the edge is ${m.edge}`).toBe(true);
      expect(m.titleWide, `${where}: the title is squeezed`).toBeGreaterThanOrEqual(60);
      expect(m.broken, `${where}: words broken across lines`).toEqual([]);
    }
  }
});

// 4. A task's own lengths.

test('a task\'s own lengths: set in its sheet, shown on Focus before a start, on a second device, and cleared by My usual lengths; a lap on it rings at its own length and offers its own break; a task on the usual lengths keeps the account\'s; neither sheet nor Settings takes a lap over 360: a figure past it comes to 360', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'own', (node) => {
    node.engine.write('task', 'own', { title: 'proofs', estimate: 2, order: 'A' });
    node.engine.write('task', 'usual', { title: 'reading', estimate: 2, order: 'B' });
    // A lap of four seconds and a break of three minutes, written as another device would: the bell comes in the test's time.
    node.engine.write('task', 'quick', { title: 'quick one', estimate: 1, order: 'C', work_ms: 4000, short_ms: 180000, long_ms: 1200000 });
  });
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Today');
  const open = async (page: Page, title: string) => {
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await taskRow(page, title).getByRole('button', { name: new RegExp(title) }).click();
    const sheet = page.getByRole('dialog', { name: 'Task', exact: true });
    await expect(sheet).toBeVisible();
    return sheet;
  };
  let sheet = await open(a.page, 'proofs');
  await expect(sheet.getByRole('button', { name: 'My usual lengths' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Its own' }).click();
  // At a person's pace: the steppers have opened before anything is typed into them.
  await settle(a.page);
  for (const [label, minutes] of [['A lap', '10'], ['A short break', '3'], ['The long break, after four laps', '20']] as const) {
    const field = sheet.getByRole('spinbutton', { name: label });
    await field.fill(minutes);
    await field.press('Enter');
  }
  await expect.poll(async () => {
    const row = await rowOf(name, 'task', 'own');
    return [row?.work_ms, row?.short_ms, row?.long_ms];
  }).toEqual([600000, 180000, 1200000]);
  // My usual lengths, then Its own again in the same open sheet: the three come back.
  await sheet.getByRole('button', { name: 'My usual lengths' }).click();
  await expect(sheet.getByRole('spinbutton', { name: 'A lap' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Its own' }).click();
  await expect(sheet.getByRole('spinbutton', { name: 'A lap' })).toHaveValue('10');
  await expect(sheet.getByRole('spinbutton', { name: 'A short break' })).toHaveValue('3');
  await expect(sheet.getByRole('spinbutton', { name: 'The long break, after four laps' })).toHaveValue('20');
  await expect.poll(async () => {
    const row = await rowOf(name, 'task', 'own');
    return [row?.work_ms, row?.short_ms, row?.long_ms];
  }).toEqual([600000, 180000, 1200000]);
  // Over 360 for a lap comes to 360, the top (section 15); then back to 10.
  const lap = sheet.getByRole('spinbutton', { name: 'A lap' });
  await lap.fill('361');
  await lap.press('Enter');
  await expect(lap).toHaveValue('360');
  await expect.poll(async () => (await rowOf(name, 'task', 'own'))?.work_ms).toBe(360 * 60000);
  await lap.fill('10');
  await lap.press('Enter');
  await expect.poll(async () => (await rowOf(name, 'task', 'own'))?.work_ms).toBe(600000);
  await sheet.getByRole('button', { name: 'Close' }).click();

  // B: the same lengths in its sheet.
  const other = await open(b.page, 'proofs');
  await expect(other.getByRole('button', { name: 'Its own' })).toHaveAttribute('aria-pressed', 'true');
  await expect(other.getByRole('spinbutton', { name: 'A lap' })).toHaveValue('10');
  await expect(other.getByRole('spinbutton', { name: 'A short break' })).toHaveValue('3');
  await expect(other.getByRole('spinbutton', { name: 'The long break, after four laps' })).toHaveValue('20');
  await other.getByRole('button', { name: 'Close' }).click();

  // Focus before a start: the task's own lap, and it says so. The usual task: the account's 25.
  await go(a.page, 'Focus');
  const digits = a.page.locator('[class*="digits"]');
  await expect(digits).toHaveText('10:00');
  await expect(a.page.getByText(/This task has its own lengths\.$/).filter({ visible: true })).toBeVisible();
  const choose = async (title: string) => {
    await a.page.getByRole('button', { name: /^This lap is for / }).click();
    await a.page.getByRole('dialog', { name: 'This lap is for' }).getByRole('button', { name: new RegExp(`^${title}`) }).click();
    await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  };
  await choose('reading');
  await expect(digits).toHaveText('25:00');
  await expect(a.page.getByText(/This task has its own lengths\./)).toHaveCount(0);

  // A lap on a task of four seconds: it rings then, and the break offered is its own three minutes.
  await choose('quick one');
  await expect(digits).toHaveText('00:04');
  await startButton(a.page).click();
  await expect(button(a.page, 'Start 3 min break')).toBeVisible({ timeout: 8000 });
  await button(a.page, 'Done for now').click();

  // My usual lengths clears all three, on the server and on B.
  await go(a.page, 'Today');
  sheet = await open(a.page, 'proofs');
  await sheet.getByRole('button', { name: 'My usual lengths' }).click();
  await expect(sheet.getByRole('spinbutton', { name: 'A lap' })).toHaveCount(0);
  await expect.poll(async () => {
    const row = await rowOf(name, 'task', 'own');
    return [row?.work_ms ?? null, row?.short_ms ?? null, row?.long_ms ?? null];
  }).toEqual([null, null, null]);
  await sheet.getByRole('button', { name: 'Close' }).click();
  const back = await open(b.page, 'proofs');
  await expect(back.getByRole('button', { name: 'My usual lengths' })).toHaveAttribute('aria-pressed', 'true');
  await back.getByRole('button', { name: 'Close' }).click();

  // Settings: 361 typed for a lap comes to 360, and the plus stops there.
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  const account = a.page.getByRole('spinbutton', { name: 'A lap' });
  await account.fill('361');
  await account.press('Enter');
  await expect(account).toHaveValue('360');
  await expect(a.page.getByRole('button', { name: 'A lap, one minute more' })).toBeDisabled();
  await expect.poll(async () => (await rowOf(name, 'settings', 'current'))?.work_ms).toBe(360 * 60000);
});

// 5. The hint is an example.

test('the hint: "Add a task", and with the focus in it "Essay draft ~3 plans it at 3 laps." under it while the field stays put; typed, it is a task of 3 laps; the habit field says how a habit starts', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'hint');
  await go(a.page, 'Today');
  const field = a.page.getByLabel('Add a task', { exact: true });
  await expect(field).toHaveAttribute('placeholder', 'Add a task');
  const example = a.page.getByText('Essay draft ~3 plans it at 3 laps.', { exact: true });
  await expect(example).toHaveCount(0);
  // Measured once the screen has come in: it rises into place as it arrives.
  await settle(a.page);
  await staysPut(a.page, field, () => field.click());
  await expect(example).toBeVisible();
  await field.pressSequentially('Essay draft ~3');
  await field.press('Enter');
  await expect(taskRow(a.page, 'Essay draft')).toContainText('0 of 3');
  await expect.poll(async () => [...(await serverRows(server, name, 'task')).values()].find((r) => r.title === 'Essay draft')?.estimate).toBe(3);

  await go(a.page, 'Habits');
  const habit = a.page.getByLabel('Add a habit', { exact: true });
  await expect(habit).toHaveAttribute('placeholder', 'Add a habit');
  await habit.click();
  await expect(a.page.getByText('It starts as once a day, every day. Open it to change that.', { exact: true })).toBeVisible();
});

// 6. The task is chosen on Focus.

test('the two lines over the digits choose the task: a sheet of the open tasks and "Nothing in particular" last; the digits keep still; Focus stays on the task of the last lap, through its break; a lap begun from Today makes that task the choice; ticking the chosen one done goes back to the next; the chooser closes when a lap starts elsewhere; no "Start without a task"', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(90000);
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'choose', (node) => ['alpha', 'bravo', 'charlie'].forEach((title, i) => node.engine.write('task', title, { title, estimate: 2, order: `V${i}` })), { work_ms: 3000, short_ms: 60000 });
  const lines = (title: string) => a.page.getByRole('button', { name: new RegExp(`^This lap is for ${title}\\.`) });
  const sheet = a.page.getByRole('dialog', { name: 'This lap is for' });
  const choose = async (from: string, to: string) => {
    await lines(from).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: new RegExp(`^${to}`) }).click();
    await expect(a.page.locator('dialog[open]')).toHaveCount(0);
    await expect(lines(to)).toBeVisible();
  };
  const digitsTop = async () => (await a.page.locator('[class*="digits"]').boundingBox())!.y;
  const onTask = async () => (await timer(name))?.task ?? null;
  await expect(lines('alpha')).toBeVisible();
  await expect(lines('alpha')).toContainText('Change task');
  await expect(a.page.getByRole('button', { name: 'Start without a task' })).toHaveCount(0);
  await settle(a.page);
  const top = await digitsTop();

  await lines('alpha').click();
  await expect(sheet).toBeVisible();
  const offered = await sheet.getByRole('button').evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? '').filter((t) => t && t !== 'Close'));
  expect(offered.map((t) => t.replace(/\d+ of \d+$/, '').trim())).toEqual(['alpha', 'bravo', 'charlie', 'Nothing in particular']);
  await sheet.getByRole('button', { name: /^charlie/ }).click();
  await expect(lines('charlie')).toBeVisible();
  await settle(a.page);
  expect(Math.abs((await digitsTop()) - top), 'the digits moved when a task was chosen').toBeLessThanOrEqual(1);

  // It lasts a visit to Today.
  await go(a.page, 'Today');
  await go(a.page, 'Focus');
  await expect(lines('charlie')).toBeVisible();

  // The lap, its bell, its break, and the next lap at once: all on charlie.
  await startButton(a.page).click();
  await expect.poll(onTask).toBe('charlie');
  await expect(a.page.getByRole('button', { name: /^This lap is for/ }), 'during a lap the lines are words only').toHaveCount(0);
  await expect(button(a.page, 'Start 1 min break')).toBeVisible({ timeout: 8000 });
  await button(a.page, 'Start 1 min break').click();
  await startNow(a.page).click();
  await expect.poll(async () => (await timer(name))?.phase).toBe('work');
  expect(await onTask(), 'the next lap left the task of the last one').toBe('charlie');
  await button(a.page, 'Stop').click();
  await expect(lines('charlie'), 'after the lap Focus went back to the next task').toBeVisible();

  // A lap begun from Today's row is the choice from then on.
  await go(a.page, 'Today');
  await list(a.page, 'Next').getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(onTask).toBe('alpha');
  await go(a.page, 'Focus');
  await button(a.page, 'Stop').click();
  await expect(lines('alpha'), 'a lap begun from Today did not become the choice').toBeVisible();

  // The chosen task ticked done: back to Today's next.
  await choose('alpha', 'bravo');
  await go(a.page, 'Today');
  await taskRow(a.page, 'bravo').getByRole('checkbox').click();
  await go(a.page, 'Focus');
  await expect(lines('alpha'), 'a task ticked done is still the choice').toBeVisible();

  // Nothing in particular: a lap for no task.
  await choose('alpha', 'Nothing in particular');
  await settle(a.page);
  expect(Math.abs((await digitsTop()) - top)).toBeLessThanOrEqual(1);
  await startButton(a.page).click();
  await expect.poll(async () => (await timer(name))?.phase).toBe('work');
  expect(await onTask()).toBeNull();
  await button(a.page, 'Stop').click();

  // The chooser open on A, and a lap started on B: it closes.
  await also(b, name);
  await expect(a.page.getByRole('button', { name: /^This lap is for / })).toBeVisible();
  await a.page.getByRole('button', { name: /^This lap is for / }).click();
  await expect(sheet).toBeVisible();
  await startButton(b.page).click();
  await expect(sheet, 'the chooser stayed open over a lap that had started').toBeHidden({ timeout: 3000 });
});

test('with automatic starts, the lap after the break is on the task of the last lap; ticked done during the break, the next lap is on no task', async ({ deviceA: a }) => {
  test.setTimeout(60000);
  await a.page.setViewportSize(PHONE);
  const { name, node } = await signedInto(a, 'autochoose', (n) => ['alpha', 'bravo'].forEach((title, i) => n.engine.write('task', title, { title, estimate: 4, order: `V${i}` })), { work_ms: 3000, short_ms: 3000 });
  node.engine.write('settings', 'current', { auto_break: true, auto_work: true });
  const onTask = async () => (await timer(name))?.task ?? null;
  const phase = async () => (await timer(name))?.phase;
  await a.page.getByRole('button', { name: /^This lap is for alpha\./ }).click();
  await a.page.getByRole('dialog', { name: 'This lap is for' }).getByRole('button', { name: /^bravo/ }).click();
  await expect(a.page.getByRole('button', { name: /^This lap is for bravo\./ })).toBeVisible();
  await startButton(a.page).click();
  await expect.poll(onTask).toBe('bravo');
  // Lap, break by itself, lap by itself.
  await expect.poll(phase, { timeout: 8000 }).toBe('short');
  await expect.poll(phase, { timeout: 8000 }).toBe('work');
  expect(await onTask(), 'the lap that started by itself left the task').toBe('bravo');
  // Its next break: bravo is ticked done in it, and the lap after is on no task.
  await expect.poll(phase, { timeout: 8000 }).toBe('short');
  await go(a.page, 'Today');
  await taskRow(a.page, 'bravo').getByRole('checkbox').click();
  await expect.poll(phase, { timeout: 8000 }).toBe('work');
  expect(await onTask(), 'the lap after a task was ticked done is still on it').toBeNull();
});

// 7. A count says of what.

test('a count says of what: with a target of 2 and a task of 3, Focus\'s bar has the task\'s three segments and no words over it; Today\'s bar has the target\'s two and says "laps today"; the row "of 3"; no bare "of 4" and no set anywhere on Focus; the room row says "Focusing"', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'ofwhat', (node) => {
    node.engine.write('settings', 'current', { day_target: 2 });
    node.engine.write('task', 'essay', { title: 'essay', estimate: 3, order: 'V' });
  });
  const stray = () =>
    a.page.locator('main').evaluate((main: HTMLElement) =>
      main.innerText
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => /\bof 4\b|\bset\b/.test(line)),
    );
  await expect(lapLine(a.page)).toHaveText('');
  expect(await stray(), 'Focus counts the set').toEqual([]);
  const bar = () => a.page.locator('main [aria-hidden="true"]').filter({ has: a.page.locator('i[style*="--i:"]') }).first().evaluate((el) => el.children.length);
  expect(await bar(), 'Focus\'s bar is not the task\'s estimate').toBe(3);
  await startButton(a.page).click();
  await expect(a.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(lapLine(a.page)).toHaveText('');
  expect(await stray(), 'Focus counts the set during a lap').toEqual([]);

  await go(a.page, 'Today');
  const target = a.page.getByRole('group', { name: 'Day target' });
  await expect(target).toContainText('0 of 2 laps today');
  expect(await target.locator('[aria-hidden="true"]').first().evaluate((el) => el.children.length)).toBe(2);
  await expect(taskRow(a.page, 'essay')).toContainText('0 of 3');

  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('reading room');
  await button(a.page, 'Make the room').click();
  const me = a.page.getByRole('region', { name: 'Who is focusing now' }).locator('article').filter({ hasText: 'You' }).first();
  await expect(me).toContainText('Focusing', { timeout: 3000 });
  await expect(me).not.toContainText(/\blap \d|set of/);
});

// 8. No work lost, through two real devices against the server.

test('a task\'s own lengths set on A while B, offline, retitles it: both are kept, on both', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'lostlen', (node: Node) => node.engine.write('task', 't', { title: 'chapter', order: 'V' }));
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Today');
  await b.setOffline(true);
  await taskRow(b.page, 'chapter').getByRole('button', { name: /chapter/ }).click();
  await b.page.getByRole('dialog', { name: 'Task', exact: true }).getByLabel('Title').fill('chapter, with notes');
  await b.page.keyboard.press('Escape');
  await taskRow(a.page, 'chapter').getByRole('button', { name: /chapter/ }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Task', exact: true });
  await sheet.getByRole('button', { name: 'Its own' }).click();
  await settle(a.page);
  const lap = sheet.getByRole('spinbutton', { name: 'A lap' });
  await lap.fill('40');
  await lap.press('Enter');
  await expect.poll(async () => (await rowOf(name, 'task', 't'))?.work_ms).toBe(2400000);
  await a.page.keyboard.press('Escape');
  await b.setOffline(false);
  await expect.poll(async () => {
    const row = await rowOf(name, 'task', 't');
    return [row?.title, row?.work_ms];
  }, { timeout: 10000 }).toEqual(['chapter, with notes', 2400000]);
  for (const d of [a, b]) {
    await expect(taskRow(d.page, 'chapter, with notes')).toBeVisible({ timeout: 5000 });
    await taskRow(d.page, 'chapter, with notes').getByRole('button', { name: /chapter, with notes/ }).click();
    await expect(d.page.getByRole('dialog', { name: 'Task', exact: true }).getByRole('spinbutton', { name: 'A lap' })).toHaveValue('40');
    await d.page.keyboard.press('Escape');
  }
});

test('a habit\'s times set on A while B, offline, checks it in: the check-in and the times are both kept, on both', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'lostrem', (node: Node) => node.engine.write('habit', 'h', { title: 'stretch', days: 127, target: 2, order: 'V' }));
  await also(b, name);
  for (const d of [a, b]) await go(d.page, 'Habits');
  await b.setOffline(true);
  await b.page.getByRole('checkbox', { name: 'Check in: stretch', exact: true }).click();
  await a.page.getByRole('checkbox', { name: 'Check in: stretch', exact: true }).locator('xpath=..').getByRole('button', { name: /stretch/ }).click();
  const sheet = a.page.getByRole('dialog', { name: 'Habit', exact: true });
  await sheet.getByLabel('1st reminder', { exact: true }).fill('07:00');
  await sheet.getByLabel('2nd reminder', { exact: true }).fill('19:30');
  await expect.poll(async () => (await rowOf(name, 'habit', 'h'))?.reminds).toEqual(['07:00', '19:30']);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await b.setOffline(false);
  await expect.poll(async () => [...(await serverRows(server, name, 'checkin')).values()].filter((r) => r.habit === 'h' && !r.deleted).length, { timeout: 10000 }).toBe(1);
  expect((await rowOf(name, 'habit', 'h'))?.reminds).toEqual(['07:00', '19:30']);
  for (const d of [a, b]) {
    await expect(d.page.getByRole('checkbox', { name: 'Check in: stretch', exact: true }).locator('xpath=..')).toContainText('1 of 2', { timeout: 5000 });
  }
  await b.page.getByRole('checkbox', { name: 'Check in: stretch', exact: true }).locator('xpath=..').getByRole('button', { name: /stretch/ }).click();
  const other = b.page.getByRole('dialog', { name: 'Habit', exact: true });
  await expect(other.getByLabel('1st reminder', { exact: true })).toHaveValue('07:00');
  await expect(other.getByLabel('2nd reminder', { exact: true })).toHaveValue('19:30');
});

// 9. A phone at 200% zoom (206 CSS px wide): what the design review found there.

test('at 206 wide: the five words of the bottom bar keep a gap between them, Today\'s three figures are whole, and no sliver of the username shows in the header', async ({ deviceA: a }) => {
  const DAY = 24 * 3600000;
  const { name } = await signedInto(a, 'zoomed', (node) => {
    // A lap a week ago today, so Today has its third figure, last week's day.
    const started = Date.now() - 7 * DAY - 3600000;
    node.engine.write('session', 'lastweek', { kind: 'work', task: null, started, ended: started + 1500000, planned_ms: 1500000, paused_ms: 0, outcome: 'rang', device: node.engine.device });
    node.engine.write('task', 't', { title: 'essay', estimate: 2, order: 'V' });
  });
  await a.page.setViewportSize({ width: 206, height: 457 });
  await go(a.page, 'Today');
  await settle(a.page);

  const words = await a.page.getByRole('navigation', { name: 'Screens' }).getByRole('link').evaluateAll((links) =>
    links.map((link) => {
      // The words themselves: the link's text, not its whole touch target.
      const range = document.createRange();
      range.selectNodeContents(link);
      const r = range.getBoundingClientRect();
      return { text: link.textContent?.trim(), left: r.left, right: r.right, cut: (link as HTMLElement).scrollWidth > (link as HTMLElement).clientWidth + 1 };
    }),
  );
  expect(words.map((w) => w.text)).toEqual(['Focus', 'Today', 'Progress', 'Habits', 'Room']);
  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.left - words[i - 1]!.right;
    expect.soft(gap, `"${words[i - 1]!.text}" touches "${words[i]!.text}" (${gap.toFixed(1)}px apart)`).toBeGreaterThan(1);
  }
  expect(words.filter((w) => w.cut).map((w) => w.text), 'a word of the bar is cut').toEqual([]);

  const figures = await a.page.locator('main dl > div').evaluateAll((items) =>
    items.map((item) => {
      const r = item.getBoundingClientRect();
      const cut = [item, ...item.querySelectorAll('*')].filter((el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1).map((el) => el.textContent?.trim());
      return { text: item.textContent?.trim(), shown: r.width > 0 && r.height > 0 && r.left >= -0.5 && r.right <= innerWidth + 0.5, cut };
    }),
  );
  expect(figures, 'Today does not show its three figures').toHaveLength(3);
  for (const f of figures) {
    expect(f.shown, `"${f.text}" is not wholly on the screen`).toBe(true);
    expect(f.cut, `"${f.text}" is cut`).toEqual([]);
  }

  // The username: wholly shown or not drawn at all, never a few pixels of it.
  const slivers = await a.page.locator('header').first().evaluate((header, name) => {
    const out: string[] = [];
    const walk = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!t.textContent?.includes(name)) continue;
      const el = t.parentElement!;
      const range = document.createRange();
      range.selectNodeContents(t);
      const text = range.getBoundingClientRect();
      if (text.width < 1 || getComputedStyle(el).visibility === 'hidden' || el.closest('.sr')) continue;
      // What of the text is really on the screen: clipped by every box that hides its overflow.
      let left = text.left;
      let right = text.right;
      for (let up: Element | null = el; up; up = up.parentElement) {
        if (getComputedStyle(up).overflowX === 'visible') continue;
        const box = up.getBoundingClientRect();
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
      left = Math.max(left, 0);
      right = Math.min(right, innerWidth);
      const seen = Math.max(0, right - left);
      if (seen > 0.5 && seen < text.width - 1) out.push(`${Math.round(seen)} of ${Math.round(text.width)}px`);
    }
    return out;
  }, name);
  expect(slivers, 'a sliver of the username shows').toEqual([]);
});
