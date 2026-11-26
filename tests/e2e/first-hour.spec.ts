// What the user's first hour with the app found (roadmap section 11), each as a test, so none comes
// back. The rules are DESIGN.md's: Motion ("What you tapped stays under your finger", "A keyboard
// is the phone's business"), "It is an app, not a page", and the component bullets.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import { welcome as about } from '../../client/src/ui/strings.ts';
import { serverRows, until } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { accountWith, colourOf, go, midScreen, quickAdd, ready, selectable, server, settle, signedInto, signIn, startButton, startNow, staysPut, taskRow, token, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';
import { demoUrl } from './server.ts';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const OFF = -new Date().getTimezoneOffset();
const PHONE = { width: 412, height: 915 };
const today = () => localDay(Date.now(), OFF);

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const panel = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, level: 2, exact: true }) });
const sent = (node: Node) => until(() => node.engine.unsent.value === 0 && node.engine.sync.value === 'in-step', 10000, 'not sent');

const tasks = (n: number) => (node: Node) => {
  for (let i = 0; i < n; i++) node.engine.write('task', `t${i}`, { title: `task ${i + 1}`, estimate: 2, order: `V${String(i).padStart(2, '0')}` });
};
const openSheet = async (page: Page, title: string) => {
  // A sheet just closed stays a moment while it goes: wait, so the one opening is the only one.
  await expect(page.locator('dialog')).toHaveCount(0);
  await taskRow(page, title).getByRole('button', { name: new RegExp(title) }).click();
  const sheet = page.getByRole('dialog', { name: 'Task' });
  await expect(sheet).toBeVisible();
  await settle(page);
  return sheet;
};

// 1. What you tapped stays under your finger, at 412 with the page scrolled part way.

test('stays put in Progress: "Don\'t count it" and "Count it again" with the week and the year above, whose totals change', async ({ deviceA: a }) => {
  const since = Date.now() - midnightOf(today());
  test.skip(since < 2.5 * HOUR || since > 22 * HOUR, 'within 2.5 hours after local midnight or 2 before it, today cannot hold the seeded laps');
  await a.page.setViewportSize(PHONE);
  const start = Date.now() - 2 * HOUR;
  await signedInto(a, 'putprogress', (node) => {
    for (let back = 1; back <= 20; back++) lap(node, `old${back}`, Date.parse(`${localDay(Date.now() - back * DAY, OFF)}T12:00:00Z`) - OFF * MIN);
    lap(node, 'one', start);
    lap(node, 'two', start + 30 * MIN);
  });
  await go(a.page, 'Progress');
  const at = wall(start + 30 * MIN);
  const dont = a.page.getByRole('button', { name: `Don't count it, the lap at ${at}` });
  const again = a.page.getByRole('button', { name: `Count it again, the lap at ${at}` });
  await midScreen(dont);
  await settle(a.page);
  await staysPut(a.page, dont, () => dont.click(), again);
  await staysPut(a.page, again, () => again.click(), dont);
});

test('stays put on Today: quick add, a task ticked done and undone, the day target opened, stepped and closed', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  await signedInto(a, 'puttoday', tasks(14));
  await go(a.page, 'Today');
  const field = a.page.getByLabel('Add a task', { exact: true });

  // A row in the middle of a long list ticked done goes to Done: that is the tap's move, and the
  // rows under it glide up. What must not move is everything above it. Undone, the same in Done.
  // Done is the last list: nine rows in it leave the page room to scroll under its heading, so the
  // untick is tried mid-page (at the very end of a page nothing can scroll, and DESIGN.md lets the
  // heading move there).
  for (let n = 14; n >= 6; n--) {
    await a.page.getByRole('checkbox', { name: `Done: task ${n}` }).click();
    await settle(a.page);
  }
  const box = a.page.getByRole('checkbox', { name: 'Done: task 4' });
  const above = a.page.getByRole('checkbox', { name: 'Done: task 3' });
  await midScreen(box);
  await settle(a.page);
  await staysPut(a.page, above, () => box.click());
  const done = a.page.getByRole('heading', { name: 'Done', level: 2, exact: true });
  await midScreen(done);
  await settle(a.page);
  expect(await a.page.locator('main').evaluate((m) => m.scrollHeight - m.clientHeight - m.scrollTop), 'the page cannot scroll under the Done heading').toBeGreaterThan(100);
  // Done lists rows in the order they were ticked: task 14 stands right under its heading, on the screen.
  await staysPut(a.page, done, () => a.page.getByRole('checkbox', { name: 'Done: task 14' }).click());

  // Quick add: the field stays where it was.
  await midScreen(field);
  await settle(a.page);
  await staysPut(a.page, field, async () => {
    await field.fill('one more');
    await field.press('Enter');
  });

  // The day target: opening, stepping and closing do not move what is above or under the finger.
  const target = a.page.getByRole('group', { name: 'Day target' });
  await midScreen(target);
  await settle(a.page);
  // Opening in place: the row it opens from keeps its place.
  await staysPut(a.page, target, () => button(a.page, 'Set a day target').click());
  const more = button(a.page, 'One lap more');
  await staysPut(a.page, more, () => more.click());
  await staysPut(a.page, target, () => button(a.page, 'Done').click());
});

test('stays put on Habits: a check-in and its Undo', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  await signedInto(a, 'puthabits', (node) => {
    for (let i = 0; i < 10; i++) node.engine.write('habit', `h${i}`, { title: `habit ${i + 1}`, days: 127, target: 1, order: `V${String(i).padStart(2, '0')}` });
  });
  await go(a.page, 'Habits');
  const box = a.page.getByRole('checkbox', { name: 'Check in: habit 6', exact: true });
  await midScreen(box);
  await settle(a.page);
  await staysPut(a.page, box, () => box.click());
  // The Undo is in the bar; what the finger is near, the row, stays.
  await staysPut(a.page, box, () => a.page.getByRole('status').filter({ hasText: 'habit 6' }).getByRole('button', { name: 'Undo' }).click());
});

test('stays put in Settings, in a sheet and in a room: a switch, "Add project", and the room\'s leaving lines opening', async ({ deviceA: a }) => {
  await a.page.setViewportSize(PHONE);
  const { name } = await signedInto(a, 'putsettings', tasks(1));
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  const celebrate = a.page.getByRole('checkbox', { name: 'Mark a finished lap' });
  await midScreen(celebrate);
  await settle(a.page);
  await staysPut(a.page, celebrate, () => celebrate.click());

  // "Add project": the form closes; the group it belongs to, above it, keeps its place.
  await go(a.page, 'Today');
  const sheet = await openSheet(a.page, 'task 1');
  await sheet.getByRole('button', { name: 'New project' }).click();
  await sheet.getByLabel('Its name').fill('Thesis');
  const legend = sheet.getByText('Project', { exact: true }).first();
  await midScreen(legend);
  await settle(a.page);
  await staysPut(a.page, legend, () => sheet.getByRole('button', { name: /^Add( project)?$/ }).click());
  await a.page.keyboard.press('Escape');

  // A room's sheet: "Leave the room" opens its lines in place; the switch above it keeps its place.
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('study hall');
  await button(a.page, 'Make the room').click();
  await button(a.page, 'Code and settings').click();
  const room = a.page.getByRole('dialog', { name: 'This room' });
  const ranked = room.getByRole('checkbox', { name: 'Order by this week' });
  await midScreen(ranked);
  await settle(a.page);
  await staysPut(a.page, ranked, () => room.getByRole('button', { name: 'Leave the room' }).click());
});

// 2. The bar: at the bottom of the screen, never scrolling the page, gone by itself.

test('the bar stands at the bottom however short the list, never scrolls the page, goes after 4 s, and after 10 s with an Undo', async ({ deviceA: a }) => {
  await a.page.clock.install();
  for (const size of [PHONE, { width: 1440, height: 900 }]) {
    await a.page.setViewportSize(size);
    if (size === PHONE) await signedInto(a, 'bar', tasks(1));
    await go(a.page, 'Today');
    await settle(a.page);
    const scroll = () => a.page.evaluate(() => [window.scrollY, document.querySelector('main')?.scrollTop ?? 0]);
    const before = await scroll();
    await quickAdd(a.page, `Hello ${size.width}`);
    // The page's own timers run on the faked clock: a step lets the bar rise in.
    await a.page.clock.runFor(300);
    // The live region is a container with no height of its own; the bar is the line inside it.
    const said = a.page.getByRole('status').filter({ hasText: new RegExp(`Added:\\s*Hello ${size.width}\\.`) });
    const bar = said.locator('p').first();
    await expect(bar).toBeVisible();
    await settle(a.page);
    expect(await scroll(), 'the bar scrolled the page').toEqual(before);
    const md = parseFloat(await a.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--space-md')));
    const edge = await bar.boundingBox();
    if (size === PHONE) {
      const nav = (await a.page.getByRole('navigation', { name: 'Screens' }).boundingBox())!;
      expect(Math.abs(edge!.y + edge!.height - (nav.y - md)), `the bar's foot at ${edge!.y + edge!.height}, the bottom bar at ${nav.y}`).toBeLessThanOrEqual(2);
    } else {
      const column = (await a.page.locator('main').boundingBox())!;
      expect(Math.abs(edge!.y + edge!.height - (column.y + column.height - md)), `the bar's foot at ${edge!.y + edge!.height}, the column's at ${column.y + column.height}`).toBeLessThanOrEqual(2);
    }
    // Only a report: gone after four seconds.
    await a.page.clock.runFor(3200);
    await expect(bar).toBeVisible();
    await a.page.clock.runFor(1000);
    await expect(said).toHaveCount(0);
  }
  // With an Undo: there at nine seconds, gone at eleven.
  await a.page.getByRole('checkbox', { name: 'Done: task 1' }).click();
  await a.page.clock.runFor(300);
  const undo = a.page.getByRole('status').filter({ hasText: 'task 1' });
  await expect(undo.getByRole('button', { name: 'Undo' })).toBeVisible();
  await a.page.clock.runFor(8700);
  await expect(undo.locator('p').first()).toBeVisible();
  await a.page.clock.runFor(2000);
  await expect(undo).toHaveCount(0);
});

// 3. Sign in: the error has its own line, and a keyboard is the phone's business.

test('sign in: a wrong password\'s error and the intro are both there and apart; a window 500 tall with a field focused scrolls at most once and shows the field and its button', async ({ deviceA: a }) => {
  const name = username('signerr');
  await accountWith(name);
  await a.page.setViewportSize(PHONE);
  await signIn(a.page, name, 'not the password');
  const error = a.page.getByText('That username and password do not match.').filter({ visible: true });
  const intro = a.page.getByText(/^Your laps live on this server\./);
  await expect(error).toBeVisible();
  await expect(intro).toBeVisible();
  const [e, i] = [(await error.boundingBox())!, (await intro.boundingBox())!];
  expect(e.y >= i.y + i.height || i.y >= e.y + e.height, 'the error and the intro overlap').toBe(true);

  const password = a.page.getByLabel('Password');
  await password.focus();
  await a.page.evaluate(() => {
    const w = window as unknown as { __scrolls: string[] };
    w.__scrolls = [];
    document.addEventListener('scroll', (event) => {
      const el = event.target === document ? document.scrollingElement! : (event.target as Element);
      w.__scrolls.push(`${el.tagName}:${Math.round(el.scrollTop)}`);
    }, true);
  });
  await a.page.setViewportSize({ width: 412, height: 500 });
  await settle(a.page);
  await a.page.waitForTimeout(500);
  const scrolls = await a.page.evaluate(() => (window as unknown as { __scrolls: string[] }).__scrolls);
  // One scroll may take several events to the same place; going there and back is two.
  const places = scrolls.filter((x, k) => x !== scrolls[k - 1]);
  expect(new Set(places.map((x) => x.split(':')[0])).size <= 1 && places.length <= 2, `the page scrolled: ${places.join(' then ')}`).toBe(true);
  await expect(password).toBeFocused();
  await expect(password).toBeInViewport({ ratio: 1 });
  await expect(button(a.page, 'Sign in')).toBeInViewport({ ratio: 1 });
});

// 4. The button in a field.

test('the Add in a field: absent while it is empty, there from the first character, a click adds and empties it, Enter does too; in quick add and a subtask', async ({ deviceA: a }) => {
  await signedInto(a, 'addbutton', tasks(1));
  await go(a.page, 'Today');
  const check = async (scope: ReturnType<Page['locator']> | Page, field: ReturnType<Page['locator']>, added: (text: string) => ReturnType<Page['locator']>, tag: string) => {
    const add = scope.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toHaveCount(0);
    await field.pressSequentially('H');
    await expect(add).toBeVisible();
    await field.pressSequentially(`ello ${tag}`);
    await add.click();
    await expect(added(`Hello ${tag}`)).toBeVisible();
    await expect(field).toHaveValue('');
    await expect(add).toHaveCount(0);
    await field.pressSequentially(`Again ${tag}`);
    await field.press('Enter');
    await expect(added(`Again ${tag}`)).toBeVisible();
    await expect(field).toHaveValue('');
  };
  await check(a.page, a.page.getByLabel('Add a task', { exact: true }), (t) => taskRow(a.page, t), 'task');
  const sheet = await openSheet(a.page, 'task 1');
  await check(sheet, sheet.getByRole('textbox', { name: 'New subtask' }), (t) => sheet.getByRole('checkbox', { name: `Done: ${t}` }), 'sub');
});

// 5. The day target's editor.

test('the day target: Set a day target opens the editor with its label; the stepper changes the figure; Done closes it with the figure kept; Remove the day target; nothing else closes it', async ({ deviceA: a }) => {
  await signedInto(a, 'target', tasks(2));
  await go(a.page, 'Today');
  const target = a.page.getByRole('group', { name: 'Day target' });
  await expect(target).toContainText('No day target.');
  await target.getByRole('button', { name: 'Set a day target' }).click();
  await expect(target.getByText('Laps to run each day', { exact: true })).toBeVisible();
  const figure = async () => Number((await target.innerText()).match(/of (\d+) laps? today/)?.[1]);
  const first = await figure();
  await button(target as never, 'One lap more').click();
  await expect.poll(figure).toBe(first + 1);
  // What closes the editor: Done, and apart from it Remove the target. Nothing else looks like it.
  const closers = await target.getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.textContent!.trim()));
  expect(closers.filter((n) => /^(done|keep it|keep this|close|ok|no target|cancel)$/i.test(n)), closers.join(', ')).toEqual(['Done']);
  await button(target as never, 'Done').click();
  await expect(target.getByText('Laps to run each day', { exact: true })).toHaveCount(0);
  await expect.poll(figure).toBe(first + 1);
  await target.getByRole('button', { name: 'Change' }).click();
  await target.getByRole('button', { name: 'Remove the day target' }).click();
  await expect(target).toContainText('No day target.');
});

test('the day target removed on B while A\'s editor is open: A shows no target and still has Set a day target', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'targetgone', tasks(2));
  await signIn(b.page, name);
  await ready(b.page);
  for (const d of [a, b]) await go(d.page, 'Today');
  const target = (page: Page) => page.getByRole('group', { name: 'Day target' });
  await target(a.page).getByRole('button', { name: 'Set a day target' }).click();
  await button(target(a.page) as never, 'Done').click();
  await expect(target(b.page)).not.toContainText('No day target.', { timeout: 3000 });
  await target(a.page).getByRole('button', { name: 'Change' }).click();
  await expect(target(a.page).getByText('Laps to run each day', { exact: true })).toBeVisible();
  await target(b.page).getByRole('button', { name: 'Change' }).click();
  await target(b.page).getByRole('button', { name: 'Remove the day target' }).click();
  await expect(target(a.page)).toContainText('No day target.', { timeout: 3000 });
  await expect(target(a.page).getByRole('button', { name: 'Set a day target' })).toBeVisible();
});

// 6. A task's time (protocol section 12).

test('a task\'s time: a day and a time show as 15:30 on both devices within a second; a time with no day lands on today; No time clears it; day and time moved on two devices offline are both kept', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await signedInto(a, 'tasktime', (node) => {
    node.engine.write('task', 'call', { title: 'call the lab', due: today(), order: 'V' });
    node.engine.write('task', 'free', { title: 'no day yet', order: 'W' });
  });
  await signIn(b.page, name);
  await ready(b.page);
  for (const d of [a, b]) await go(d.page, 'Today');

  let sheet = await openSheet(a.page, 'call the lab');
  const start = Date.now();
  await sheet.getByLabel('At', { exact: true }).fill('15:30');
  await expect(taskRow(b.page, 'call the lab')).toContainText('15:30', { timeout: 1000 });
  console.log(`a task's time on A, seen on B: ${Date.now() - start} ms`);
  await a.page.keyboard.press('Escape');
  await expect(taskRow(a.page, 'call the lab')).toContainText('15:30');

  // A time on a task with no day: today is written with it.
  sheet = await openSheet(a.page, 'no day yet');
  await sheet.getByLabel('At', { exact: true }).fill('09:15');
  await expect(sheet.getByLabel('Due', { exact: true })).toHaveValue(today());
  await a.page.keyboard.press('Escape');
  await expect(taskRow(a.page, 'no day yet')).toContainText('09:15');
  await expect.poll(async () => (await serverRows(server, name, 'task')).get('free')).toMatchObject({ due: today(), time: '09:15' });

  sheet = await openSheet(a.page, 'no day yet');
  await sheet.getByRole('button', { name: 'No time' }).click();
  await a.page.keyboard.press('Escape');
  await expect(taskRow(a.page, 'no day yet')).not.toContainText('09:15');

  // Offline on both: A moves the day, B the time. Both are kept.
  const tomorrow = localDay(Date.now() + DAY, OFF);
  for (const d of [a, b]) await d.setOffline(true);
  sheet = await openSheet(a.page, 'call the lab');
  await sheet.getByLabel('Due', { exact: true }).fill(tomorrow);
  await a.page.keyboard.press('Escape');
  const other = await openSheet(b.page, 'call the lab');
  await other.getByLabel('At', { exact: true }).fill('16:45');
  await b.page.keyboard.press('Escape');
  for (const d of [a, b]) await d.setOffline(false);
  await expect.poll(async () => (await serverRows(server, name, 'task')).get('call'), { timeout: 10000 }).toMatchObject({ due: tomorrow, time: '16:45' });
  for (const d of [a, b]) await expect(taskRow(d.page, 'call the lab')).toContainText('16:45', { timeout: 5000 });
});

test('a task\'s day cleared takes its time with it: a new day set after has no time', async ({ deviceA: a }) => {
  const { name } = await signedInto(a, 'daytime', (node) => node.engine.write('task', 'call', { title: 'call the lab', due: today(), time: '15:30', order: 'V' }));
  await go(a.page, 'Today');
  await expect(taskRow(a.page, 'call the lab')).toContainText('15:30');
  let sheet = await openSheet(a.page, 'call the lab');
  await sheet.getByLabel('Due', { exact: true }).fill('');
  await expect(sheet.getByLabel('At', { exact: true })).toHaveValue('');
  await a.page.keyboard.press('Escape');
  await expect.poll(async () => (await serverRows(server, name, 'task')).get('call')?.time ?? '').toBe('');
  // Back on a day: the time it had does not come back with it.
  sheet = await openSheet(a.page, 'call the lab');
  await sheet.getByLabel('Due', { exact: true }).fill(today());
  await expect(sheet.getByLabel('At', { exact: true })).toHaveValue('');
  await a.page.keyboard.press('Escape');
  await expect(taskRow(a.page, 'call the lab')).not.toContainText('15:30');
  await expect.poll(async () => (await serverRows(server, name, 'task')).get('call')).toMatchObject({ due: today() });
  expect((await serverRows(server, name, 'task')).get('call')?.time ?? '').toBe('');
});

// 7. A project's colour.

test('a project\'s colour: two of the new named colours and a picked one fill the square as they should in light and dark, on both devices; a colour this build does not know shows in ink and hides nothing', async ({ deviceA: a, deviceB: b }) => {
  const { name, node } = await signedInto(a, 'colours', (n) => {
    for (const t of ['teal task', 'indigo task', 'picked task']) n.engine.write('task', t.split(' ')[0]!, { title: t, order: `V${t.length}` });
  });
  await go(a.page, 'Today');
  const make = async (task: string, project: string, choose: (sheet: ReturnType<Page['getByRole']>) => Promise<void>) => {
    const sheet = await openSheet(a.page, task);
    await sheet.getByRole('button', { name: 'New project' }).click();
    await sheet.getByLabel('Its name').fill(project);
    await choose(sheet);
    await sheet.getByRole('button', { name: /^Add( project)?$/ }).click();
    await expect(sheet.getByRole('button', { name: project })).toHaveAttribute('aria-pressed', 'true');
    await a.page.keyboard.press('Escape');
  };
  await make('teal task', 'Biology', (s) => s.getByRole('radio', { name: 'Teal' }).click());
  await make('indigo task', 'History', (s) => s.getByRole('radio', { name: 'Indigo' }).click());
  // The app's own picker: Pick, then its two sliders, as a finger leaves them.
  await make('picked task', 'Art', async (s) => {
    await s.getByRole('radio', { name: /Pick/ }).click();
    await s.getByRole('slider', { name: 'Colour' }).fill('214');
    await s.getByRole('slider', { name: 'Pale to deep' }).fill('60');
  });
  await expect.poll(() => colourOf(name, 'Art')).toMatch(/^#[0-9a-f]{6}$/);
  const picked = (await colourOf(name, 'Art'))!;
  const rgb = `rgb(${[1, 3, 5].map((at) => parseInt(picked.slice(at, at + 2), 16)).join(', ')})`;
  // A colour value no build has yet, written as another device would.
  node.engine.write('project', 'future', { name: 'Music', color: 'chartreuse-ish', order: 'Z' });
  node.engine.write('task', 'music', { title: 'music task', project: 'future', order: 'Z' });
  await sent(node);

  await signIn(b.page, name);
  await ready(b.page);
  await go(b.page, 'Today');
  const square = (page: Page, task: string, project: string) =>
    taskRow(page, task).locator('span', { hasText: project }).locator('i').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  for (const scheme of ['light', 'dark'] as const) {
    for (const d of [a, b]) {
      await d.page.emulateMedia({ colorScheme: scheme });
      await settle(d.page);
      expect(await square(d.page, 'teal task', 'Biology'), `teal, ${scheme}`).toBe(await token(d.page, '--teal'));
      expect(await square(d.page, 'indigo task', 'History'), `indigo, ${scheme}`).toBe(await token(d.page, '--indigo'));
      expect(await square(d.page, 'picked task', 'Art'), `picked, ${scheme}`).toBe(rgb);
      await expect(taskRow(d.page, 'music task')).toContainText('Music');
      expect(await square(d.page, 'music task', 'Music'), `unknown, ${scheme}`).toBe(await token(d.page, '--ink'));
    }
  }
  // Read, never rewritten: the unknown value is still on the server as it was.
  expect((await serverRows(server, name, 'project')).get('future')?.color).toBe('chartreuse-ish');
});

// 8. The welcome, in the browser: beside the form from 720px, under it below. Section 14: shown,
// not explained: one sentence, one drawing with its key, two small drawings.

/** The welcome's section, wherever it stands. */
const welcomeOf = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: /^Work in laps\./ }) });

test('the browser\'s signed-out screen carries the welcome: beside the form at 1440, under it at 412; its one sentence, three drawings read once each, a key of four read once each, the old sentences gone; at 1440 the form stands where it would without it and nothing scrolls', async ({ deviceA: a }) => {
  for (const [size, place] of [[{ width: 1440, height: 900 }, 'beside'], [PHONE, 'under']] as const) {
    await a.page.setViewportSize(size);
    await a.page.goto('/');
    await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    const welcome = welcomeOf(a.page);
    await expect(welcome).toBeVisible();
    await expect(welcome.getByText(about.what, { exact: true })).toBeVisible();
    await expect(a.page.getByText(/^It is free\. Everything you do is kept on a server/)).toHaveCount(1);
    for (const gone of ['A lap is one stretch of focus', '25 minutes unless you change it', 'Plan the day in laps', 'Habits get a box to tick', 'In a room, friends see']) {
      await expect(a.page.getByText(gone), `"${gone}" is still there`).toHaveCount(0);
    }
    // The pictures, each said once by its own words, and nothing inside them said again.
    const images = welcome.getByRole('img');
    expect(await images.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual([about.drawn, about.weekDrawn, about.tasksDrawn, about.roomDrawn]);
    // The key: its entries, each a list item, each said once.
    const key = welcome.getByRole('listitem');
    await expect(key).toHaveCount(Object.keys(about.key).length);
    // What a screen reader reads of each: the words, without the drawn mark (hidden from it).
    const heard = await key.evaluateAll((items) =>
      items.map((li) => {
        const copy = li.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
        return copy.textContent?.trim();
      }),
    );
    expect(heard).toEqual(Object.values(about.key));
    for (const entry of Object.values(about.key)) {
      await expect(a.page.getByText(entry), `"${entry}" is read more than once`).toHaveCount(1);
    }
    const [w, f] = [(await welcome.boundingBox())!, (await a.page.locator('form').boundingBox())!];
    if (place === 'beside') {
      expect(w.x + w.width <= f.x || f.x + f.width <= w.x, 'the welcome is not beside the form').toBe(true);
      const scrolls = await a.page.evaluate(() => [document.scrollingElement!, document.querySelector('main')].filter((el) => el && el.scrollHeight > el.clientHeight + 1).length);
      expect(scrolls, 'at 1440 by 900 the signed-out screen scrolls').toBe(0);
      // Where the form would stand with no welcome beside it.
      const alone = await a.page.evaluate(() => {
        const section = [...document.querySelectorAll('section')].find((el) => el.querySelector('h1, h2')?.textContent?.startsWith('Work in laps.'))!;
        section.style.display = 'none';
        const r = document.querySelector('form')!.getBoundingClientRect();
        section.style.display = '';
        return { x: r.x, y: r.y };
      });
      expect([Math.round(f.x), Math.round(f.y)], 'the welcome moved the form').toEqual([Math.round(alone.x), Math.round(alone.y)]);
    } else {
      expect(w.y >= f.y + f.height, 'the welcome is not under the form').toBe(true);
    }
  }
});

/**
 * When the sixth lap of the welcome's race first stood in the page, and when its fill reached
 * its end, in ms: read every frame from the first script on, so a test's own latency adds nothing.
 */
const watchRace = () => {
  const seen: { first: number | null; done: number | null; last: string | null } = { first: null, done: null, last: null };
  (window as unknown as { race: typeof seen }).race = seen;
  const look = () => {
    const lap = [...document.querySelectorAll<HTMLElement>('[role="img"] span:not([class*="past"]) > i')].find((i) => i.style.getPropertyValue('--i').trim() === '5' && i.style.getPropertyValue('--share').trim() === '0.6');
    if (lap) {
      seen.first ??= performance.now();
      const now = getComputedStyle(lap, '::after').transform;
      if (now !== seen.last) seen.done = null;
      if (/^matrix\(0\.6, 0, 0, 1, 0, 0\)$/.test(now)) seen.done ??= performance.now();
      seen.last = now;
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
};

test('the welcome\'s race: with reduced motion it stands in its end state at once; with motion its sixth lap has filled within 2 s and nothing moves for a second after', async ({ deviceA: a }) => {
  await a.page.addInitScript(watchRace);
  const read = () => a.page.evaluate(() => (window as unknown as { race: { first: number | null; done: number | null; last: string | null } }).race);
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await a.page.goto('/');
  await expect(welcomeOf(a.page).getByRole('img').first()).toBeVisible();
  await expect.poll(async () => (await read()).done).not.toBeNull();
  let race = await read();
  expect(race.done! - race.first!, 'under reduced motion the race moved').toBeLessThanOrEqual(100);

  await a.page.emulateMedia({ reducedMotion: 'no-preference' });
  await a.page.reload();
  await expect(welcomeOf(a.page).getByRole('img').first()).toBeVisible();
  await expect.poll(async () => (await read()).done, { timeout: 3000 }).not.toBeNull();
  race = await read();
  expect(race.done! - race.first!, 'the race took more than 2 s to fill').toBeLessThanOrEqual(2000);
  const settled = race.last;
  await a.page.waitForTimeout(1000);
  race = await read();
  expect(race.last, 'the race moved again after it filled').toBe(settled);
  expect(await a.page.evaluate(() => document.getAnimations().filter((x) => x.playState === 'running').length), 'something in the welcome is still moving').toBe(0);
});

// 9. Nothing selects, but fields and what is there to be copied.

test('nothing selects: a heading, a task title, a button\'s words and a sentence on three screens; a field does; an invite link and a room code do', async ({ deviceA: a }) => {
  const { name } = await signedInto(a, 'select', tasks(1));
  await go(a.page, 'Today');
  await expect(a.page.getByRole('heading', { level: 1 })).toHaveText(/^Today/);
  await settle(a.page);
  for (const [what, l] of [
    ['Today\'s heading', a.page.getByRole('heading', { level: 1 })],
    ['a task title', taskRow(a.page, 'task 1').getByText('task 1', { exact: true })],
    ['a button\'s words', a.page.getByRole('button', { name: 'Set a day target' })],
    ['a sentence', a.page.getByText('No day target.')],
  ] as const) expect(await selectable(l), `Today: ${what} selects`).toBe(false);
  expect(await selectable(a.page.getByLabel('Add a task', { exact: true })), 'the quick-add field does not select').toBe(true);
  // A word dragged over selects nothing.
  await a.page.getByRole('heading', { level: 1 }).click({ clickCount: 3 });
  expect(await a.page.evaluate(() => String(getSelection()))).toBe('');

  await go(a.page, 'Focus');
  for (const l of [a.page.getByText(/^Start now and it ends at/).first(), startButton(a.page)]) expect(await selectable(l), 'Focus selects').toBe(false);
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  // Not "keeps step with the server at ...": the address in it is there to be copied.
  expect(await selectable(a.page.getByRole('heading', { name: 'Settings', level: 1 })), 'Settings: the heading selects').toBe(false);
  expect(await selectable(a.page.getByText(/^Off, every start is yours to tap/)), 'Settings: a sentence selects').toBe(false);

  // What is there to be copied: a room's code.
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('study hall');
  await button(a.page, 'Make the room').click();
  await button(a.page, 'Code and settings').click();
  const code = a.page.getByRole('dialog', { name: 'This room' }).getByRole('region', { name: 'The code to share' }).locator('p').first();
  expect(await selectable(code), 'the room code does not select').toBe(true);
});

// 10. Reduced motion, and a row that goes.

test('reduced motion: after a tap nothing runs and no transition is longer than 0 s; with motion, a row deleted is still there a frame later and gone within 400 ms', async ({ deviceA: a, deviceB: b }) => {
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await signedInto(a, 'still', tasks(3));
  const moving = (page: Page) =>
    page.evaluate(() => {
      const running = document.getAnimations().filter((x) => x.playState === 'running').map((x) => {
        const effect = x.effect as KeyframeEffect | null;
        const any = x as unknown as { animationName?: string; transitionProperty?: string };
        return `${any.animationName ?? any.transitionProperty ?? 'an animation'} on ${(effect?.target as Element | null)?.tagName.toLowerCase()}${effect?.pseudoElement ?? ''} for ${effect?.getComputedTiming().duration} ms`;
      });
      const long = [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).transitionDuration.split(',').some((d) => parseFloat(d) > 0)).length;
      return { running, long };
    });
  const taps: [string, () => Promise<void>][] = [
    ['a tick on Today', async () => (await go(a.page, 'Today'), await a.page.getByRole('checkbox', { name: 'Done: task 1' }).click())],
    ['a quick add', () => quickAdd(a.page, 'still here')],
    ['a sheet', async () => void (await openSheetFast(a.page, 'task 2'))],
    ['a check-in', async () => {
      await a.page.keyboard.press('Escape');
      await go(a.page, 'Habits');
      const add = a.page.getByLabel('Add a habit', { exact: true });
      await add.fill('read');
      await add.press('Enter');
      await a.page.getByRole('checkbox', { name: 'Check in: read', exact: true }).click();
    }],
  ];
  for (const [what, tap] of taps) {
    await tap();
    await a.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(await moving(a.page), `after ${what}`).toEqual({ running: [], long: 0 });
  }

  // With motion: a row that goes takes its time, then is gone.
  await signedInto(b, 'moving', tasks(3));
  await go(b.page, 'Today');
  const sheet = await openSheet(b.page, 'task 3');
  const timing = await sheet.getByRole('button', { name: 'Delete', exact: true }).evaluate(async (del) => {
    const row = document.querySelector('[role="checkbox"][aria-label="Done: task 3"]')!.parentElement!;
    const t0 = performance.now();
    (del as HTMLElement).click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterAFrame = document.contains(row);
    while (document.contains(row) && performance.now() - t0 < 2000) await new Promise((r) => requestAnimationFrame(r));
    return { afterAFrame, gone: Math.round(performance.now() - t0) };
  });
  expect(timing.afterAFrame, 'the row went between two frames').toBe(true);
  expect(timing.gone, 'the row took too long to go').toBeLessThanOrEqual(400);
});

test('a task\'s sheet opened again within 200 ms of Close shows, and stays', async ({ deviceA: a }) => {
  await signedInto(a, 'reopen', tasks(2));
  await go(a.page, 'Today');
  const sheet = await openSheet(a.page, 'task 1');
  const close = await sheet.getByRole('button', { name: 'Close', exact: true }).elementHandle();
  const opener = await taskRow(a.page, 'task 1').getByRole('button', { name: /task 1/ }).elementHandle();
  // In the page, so the second tap lands inside the first sheet's 200 ms on its way out.
  const gap = await a.page.evaluate(async ([close, opener]) => {
    const t0 = performance.now();
    (close as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 80));
    (opener as HTMLElement).click();
    return performance.now() - t0;
  }, [close, opener] as const);
  expect(gap, 'the second tap came too late to test anything').toBeLessThan(200);
  const open = a.page.locator('dialog[open][aria-label="Task"]');
  await expect(open).toBeVisible();
  await a.page.waitForTimeout(600);
  await expect(open, 'the sheet opened again and then went').toBeVisible();
  await expect(open.getByRole('heading', { name: 'Task' })).toBeVisible();
});

test('reduced motion: Escape or Close on a habit\'s sheet hands the focus back to its row', async ({ deviceA: a }) => {
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await signedInto(a, 'focusback');
  await go(a.page, 'Habits');
  const add = a.page.getByLabel('Add a habit', { exact: true });
  await add.fill('stretch');
  await add.press('Enter');
  const opener = a.page.getByRole('checkbox', { name: 'Check in: stretch', exact: true }).locator('xpath=..').getByRole('button', { name: /stretch/ });
  for (const how of ['Escape', 'Close']) {
    await opener.focus();
    await a.page.keyboard.press('Enter');
    const sheet = a.page.getByRole('dialog', { name: 'Habit', exact: true });
    await expect(sheet).toBeVisible();
    if (how === 'Escape') await a.page.keyboard.press('Escape');
    else await sheet.getByRole('button', { name: 'Close', exact: true }).press('Enter');
    await expect(a.page.locator('dialog[open]')).toHaveCount(0);
    await expect(opener, `after ${how}`).toBeFocused();
  }
});

test('with motion, a row that changes place glides there in the fill time, 160 ms, in the built app', async ({ deviceA: a }) => {
  await signedInto(a, 'glide');
  await go(a.page, 'Habits');
  const add = a.page.getByLabel('Add a habit', { exact: true });
  for (const t of ['alpha', 'bravo', 'charlie']) {
    await add.fill(t);
    await add.press('Enter');
  }
  // Alt and up on charlie: the rows trade places and glide there.
  const charlie = a.page.getByRole('checkbox', { name: 'Check in: charlie', exact: true }).locator('xpath=..').getByRole('button', { name: /charlie/ });
  await charlie.focus();
  const up = await charlie.elementHandle();
  // Every glide started, caught as it starts: one that lasts a fraction of a millisecond is over
  // before a frame could see it.
  const glides = await a.page.evaluate(async (up) => {
    const seen: number[] = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      const x = animate.apply(this, args);
      if ((x.effect as KeyframeEffect).getKeyframes().some((k) => String(k.transform).includes('translateY'))) seen.push(Number(x.effect!.getTiming().duration));
      return x;
    };
    up!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    Element.prototype.animate = animate;
    return seen;
  }, up);
  // Fewer than 160 ms is a jump with extra steps: the built CSS writes 160ms as .16s.
  expect(glides.length, 'nothing glided').toBeGreaterThan(0);
  expect(glides.every((ms) => ms === 160), `glides lasted ${glides.join(', ')} ms`).toBe(true);
});

// 11. Words that are gone: across the demo's states and the live screens.

// The button "Keep it" is gone; "Two rest days a week keep it going." is a sentence, and stays.
// Section 12: one word for one thing (DESIGN.md, "Said so a stranger knows"): estimate, never
// guess; Restore, never bring back; a lap reaches its bell, never rings or rang; not counted,
// never void; and the buttons that went: Skip break, Stop and log, Don't count this lap, the free
// "when", the order mode, Another colour, Ghost. Section 13: the old hint and the second start button.
// Sections 14 and 15: the set of four on any screen, and the welcome's old sentences.
const GONE = /[Ss]et aside|[Cc]ounts? nowhere|\bKeep it\b|Skip break|Stop and log|Don't count this lap|\b[Gg]uess|[Bb]ring back|\brings\b|\brang\b|\b[Vv]oid\b|When in the day|Change the order|Keep this order|Another colour|\bGhost\b|No target today|End with ~3 for three laps|Start without a task|in this set|\bset of\b|of 4 in|A full set|25 minutes unless you change it/;

test('the words that went are nowhere: not in any demo state, not on the live screens', async ({ deviceA: a }) => {
  test.setTimeout(180000);
  const found: string[] = [];
  const scan = async (where: string) => {
    const text = await a.page.locator('body').innerText();
    for (const line of text.split('\n')) if (GONE.test(line)) found.push(`${where}: "${line.trim().slice(0, 80)}"`);
  };
  await a.page.goto(`${demoUrl()}/demo.html`);
  const states = await a.page.locator('a[href*="state="]').evaluateAll((as) => as.map((x) => x.getAttribute('href')!));
  expect(states.length, 'the demo lists no states').toBeGreaterThan(10);
  for (const href of states) {
    // A demo state may set its own address as it opens, which aborts the navigation that led there.
    await a.page.goto(`${demoUrl()}/demo.html${href.replace(/^.*\?/, '?')}`).catch(() => a.page.waitForLoadState());
    await a.page.waitForTimeout(150);
    await scan(`demo ${href}`);
  }

  // Live: a lap not counted on Progress, the day target open, a sheet, and an invite's take-back step.
  const since = Date.now() - midnightOf(today());
  await a.page.goto('/');
  const { name } = await signedInto(a, 'words', (node) => {
    node.engine.write('task', 't1', { title: 'task 1', order: 'V' });
    if (since > 2.5 * HOUR) lap(node, 'aside', Date.now() - 2 * HOUR, 'void');
  }, { work_ms: 3000, short_ms: 60000 });
  await startButton(a.page).click();
  await scan('Focus, running');
  await expect(startNow(a.page)).toBeVisible({ timeout: 8000 });
  await scan('Focus, result');
  await button(a.page, 'Start 1 min break').click();
  await expect(button(a.page, 'Done for now')).toBeVisible();
  await scan('Focus, a break');
  await go(a.page, 'Today');
  await scan('Today, in a break');
  await button(a.page, 'Set a day target').click();
  await scan('Today, the target open');
  await openSheet(a.page, 'task 1');
  await scan('Today, a task sheet');
  await a.page.keyboard.press('Escape');
  await go(a.page, 'Progress');
  await scan('Progress');
  await go(a.page, 'Habits');
  await scan('Habits');
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  await scan('Settings');
  expect(found, found.join('\n')).toEqual([]);
});

// The helpers the tests above share.

function midnightOf(day: string) {
  return Date.parse(`${day}T00:00:00Z`) - OFF * MIN;
}
function wall(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function lap(node: Node, id: string, started: number, outcome: 'rang' | 'void' = 'rang') {
  node.engine.write('session', id, { kind: 'work', task: null, started, ended: started + 25 * MIN, planned_ms: 25 * MIN, paused_ms: 0, outcome, device: node.engine.device });
}
async function openSheetFast(page: Page, title: string) {
  await taskRow(page, title).getByRole('button', { name: new RegExp(title) }).click();
  return page.getByRole('dialog', { name: 'Task' });
}
