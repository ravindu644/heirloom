// Rooms, the second pass (roadmap section 22; protocol section 15's new parts; DESIGN.md "The Room
// screen"): the live order, the tabs, the hours that carry now, starting a lap together, notes,
// removing a member, pictures and the room's week. Three accounts in one room on three browsers;
// what is only the server's answer is asked through a Node device of the account.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import { PASSWORD, serverRows, signedIn, until } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { accountWith, go, ready, signIn, startButton, startNow, token, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';
import { ADDR, e2eServer } from './server.ts';

const PHONE = { width: 412, height: 915 };
const MIN = 60000;
const DAY = 24 * 60 * MIN;
const OFF = -new Date().getTimezoneOffset();
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const people = (page: Page) => page.getByRole('region', { name: 'Who is focusing now' }).locator('article');
/** The names down the People tab, "You" on one's own: the first bold word of each row, after its circle. */
const order = (page: Page) => people(page).evaluateAll((els) => els.map((el) => el.querySelector('p b')?.textContent ?? ''));
const rowOf = (page: Page, who: string) => people(page).filter({ has: page.locator('p b').getByText(who, { exact: true }) });
const tab = (page: Page, name: 'People' | 'Notes' | 'Week') => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const ask = (node: Node, path: string, body: object) => node.engine.request(path, body);
const sessionsOf = async (name: string) => [...(await serverRows(e2eServer(), name, 'session')).values()];
const timerOf = async (name: string) => (await serverRows(e2eServer(), name, 'timer')).get('current')?.state as { phase: string; run: string | null } | undefined;

/** A lap that reached its bell, on no task, written from Node. */
const lap = (node: Node, id: string, started: number, ms = 25 * MIN) =>
  node.engine.write('session', id, { kind: 'work', task: null, started, ended: started + ms, planned_ms: ms, paused_ms: 0, outcome: 'rang', device: node.engine.device });

/** A new account signed in on this browser, with its Node device kept for the server's side. */
async function person(d: Device, tag: string, seed: (node: Node) => void = () => {}, lengths: Parameters<typeof accountWith>[1] = {}) {
  const name = username(tag);
  const node = await accountWith(name, lengths);
  seed(node);
  await until(() => node.engine.unsent.value === 0, 10000, 'the seed was not sent');
  await d.page.setViewportSize(PHONE);
  await signIn(d.page, name);
  await ready(d.page);
  return { name, node, id: node.engine.account.value!.account };
}
type Person = Awaited<ReturnType<typeof person>>;

/** The first person makes the room; the rest join it with its code. Returns the room's id and code. */
async function room(first: { d: Device; p: Person }, ...rest: { d: Device; p: Person }[]) {
  await go(first.d.page, 'Room');
  await first.d.page.getByLabel('Its name').fill('study club');
  await button(first.d.page, 'Make the room').click();
  await button(first.d.page, 'Code and settings').click();
  const sheet = first.d.page.getByRole('dialog', { name: 'This room' });
  const code = (await sheet.getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  for (const { d } of rest) {
    await go(d.page, 'Room');
    await d.page.getByLabel('The code a friend gave you').fill(code);
    await button(d.page, 'Join').click();
  }
  for (const { d } of [first, ...rest]) await expect(people(d.page)).toHaveCount(rest.length + 1, { timeout: 5000 });
  const joined = await ask(first.p.node, '/api/rooms/join', { code });
  expect(joined.ok).toBe(true);
  return { id: (joined as { data: { room: string } }).data.room, code };
}

/** The next whole server minute at least a minute ahead, as /api/rooms/call wants it. */
const nextMinute = (node: Node) => Math.ceil((node.engine.now() + MIN + 1000) / MIN) * MIN;

// 1. The live order, the tabs, the hours that carry now.

test('the live order: on a lap first, then a break, then the rest, whatever the week; ranked, by the week alone; the tabs by click and by arrow keys; the hours say now and each lane draws its laps, yours in you', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  test.setTimeout(120000);
  const now = Date.now();
  // A lane draws today's laps: C's, two hours back, must still be today.
  test.skip(now - new Date(new Date(now).toDateString()).getTime() < 150 * MIN, 'too near midnight for laps earlier today');
  // C has the most this week, A the least: the live order must not follow the week.
  const pa = await person(a, 'lo_a');
  const pb = await person(b, 'lo_b', (n) => lap(n, 'b1', now - 3 * 60 * MIN), { work_ms: 3000, short_ms: 5 * MIN });
  // Inside a phone's four hours (now 5/8 across: back to two and a half hours ago), so its lane draws them.
  const pc = await person(c, 'lo_c', (n) => (lap(n, 'c1', now - 140 * MIN), lap(n, 'c2', now - 100 * MIN)));
  await room({ d: c, p: pc }, { d: a, p: pa }, { d: b, p: pb });

  // B: a 3 s lap, then its break. A: a lap. C: nothing.
  await go(b.page, 'Focus');
  await startButton(b.page).click();
  await expect(button(b.page, 'Start 5 min break')).toBeVisible({ timeout: 8000 });
  await button(b.page, 'Start 5 min break').click();
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  await go(c.page, 'Room');
  await expect.poll(() => order(c.page), { message: 'not on a lap, then on a break, then the rest' }).toEqual([pa.name, pb.name, 'You']);
  await expect(rowOf(c.page, pa.name)).toContainText('Focusing');
  await expect(rowOf(c.page, pb.name)).toContainText('Short break');

  // Ranked by the keeper (C made the room): by this week alone, C first.
  await button(c.page, 'Code and settings').click();
  await c.page.getByRole('dialog', { name: 'This room' }).getByRole('checkbox', { name: 'Order by this week' }).click();
  await c.page.getByRole('dialog', { name: 'This room' }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => order(c.page), { message: 'ranked is not by the week alone' }).toEqual(['You', pb.name, pa.name]);

  // The tabs: a tablist, by click and by the arrow keys.
  await expect(c.page.getByRole('tablist')).toBeVisible();
  await tab(c.page, 'Notes').click();
  await expect(tab(c.page, 'Notes')).toHaveAttribute('aria-selected', 'true');
  await c.page.keyboard.press('ArrowRight');
  await expect(tab(c.page, 'Week')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(c.page, 'Week')).toBeFocused();
  await c.page.keyboard.press('ArrowLeft');
  await c.page.keyboard.press('ArrowLeft');
  await expect(tab(c.page, 'People')).toHaveAttribute('aria-selected', 'true');

  // The hours row says now; A's own lane draws its running lap in you, C's laps on A's screen are not.
  await go(a.page, 'Room');
  await expect(a.page.getByRole('tabpanel').getByText('now', { exact: true })).toBeVisible();
  const you = await token(a.page, '--you');
  // Each lane's laps: the blocks in it, by their fill.
  const laps = (who: string) => rowOf(a.page, who).locator('[class*="_lap_"]').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => getComputedStyle(el).backgroundColor));
  await expect.poll(() => laps('You'), { message: 'your running lap is not drawn in you' }).toContain(you);
  const theirs = await laps(pc.name);
  expect(theirs.length, 'C\'s laps today are not drawn').toBeGreaterThan(0);
  expect(theirs, 'someone else\'s laps are drawn in you').not.toContain(you);
});

// 2. Start together.

test('start together: A calls a lap a minute ahead, B says I\'m in on one device, C does nothing; at the minute A and B are on one lap with run call-<id> (B on both devices), C is not; the call strip is on every tab; on a second call B takes it back and does not start', async ({ deviceA: a, deviceB: b, deviceC: c, phone }) => {
  // Two calls, each a whole minute or two ahead, and a minute's lap between them.
  test.setTimeout(480000);
  const [pa, pb, pc] = [await person(a, 'st_a'), await person(b, 'st_b'), await person(c, 'st_c')];
  // B's second device.
  await phone.page.setViewportSize(PHONE);
  await signIn(phone.page, pb.name);
  await ready(phone.page);
  const { id: roomId } = await room({ d: a, p: pa }, { d: b, p: pb }, { d: c, p: pc });

  const at = nextMinute(pa.node);
  const called = await ask(pa.node, '/api/rooms/call', { room: roomId, at });
  expect(called.ok, JSON.stringify(called)).toBe(true);
  const callId = (called as { data: { call: string } }).data.call;
  // The strip, on every tab, on B.
  await go(b.page, 'Room');
  for (const name of ['People', 'Notes', 'Week'] as const) {
    await tab(b.page, name).click();
    await expect(b.page.getByText(new RegExp(`^\\d\\d:\\d\\d ${pa.name} calls a lap$`)), `no call strip on ${name}`).toBeVisible({ timeout: 3000 });
  }
  await button(b.page, 'I\'m in').click();
  await expect(button(b.page, 'I\'m out')).toBeVisible();
  for (const d of [a, b, phone, c]) await go(d.page, 'Focus');

  // At the minute: A and B on the called lap, C not.
  await expect.poll(async () => (await timerOf(pa.name))?.run, { timeout: at - Date.now() + 20000, message: 'A did not start the called lap' }).toBe(`call-${callId}`);
  await expect.poll(async () => (await timerOf(pb.name))?.run, { timeout: 15000, message: 'B did not start the called lap' }).toBe(`call-${callId}`);
  for (const d of [b, phone]) await expect(button(d.page, 'Pause'), 'a device of B is not on the lap').toBeVisible({ timeout: 10000 });
  await expect(startButton(c.page), 'C, who was not in, started').toBeVisible();
  expect((await timerOf(pc.name))?.phase ?? 'idle').toBe('idle');
  // One lap for B, whichever device wrote it: stopped past a minute, one row.
  await c.page.waitForTimeout(62000 - Math.max(0, Date.now() - at));
  await button(b.page, 'Stop').click();
  await expect.poll(async () => (await sessionsOf(pb.name)).filter((r) => r.kind === 'work').length, { timeout: 5000 }).toBe(1);
  await b.page.waitForTimeout(1500);
  expect((await sessionsOf(pb.name)).filter((r) => r.kind === 'work'), 'B\'s two devices made two laps of one').toHaveLength(1);
  await button(a.page, 'Stop').click();

  // A second call: B says in and takes it back before it starts.
  await expect.poll(async () => (await timerOf(pa.name))?.phase).toBe('idle');
  const at2 = nextMinute(pa.node);
  const again = await ask(pa.node, '/api/rooms/call', { room: roomId, at: at2 });
  expect(again.ok, JSON.stringify(again)).toBe(true);
  await go(b.page, 'Room');
  await button(b.page, 'I\'m in').click();
  await button(b.page, 'I\'m out').click();
  await expect(button(b.page, 'I\'m in')).toBeVisible();
  await go(b.page, 'Focus');
  await expect.poll(async () => (await timerOf(pa.name))?.run, { timeout: at2 - Date.now() + 20000 }).toMatch(/^call-/);
  await b.page.waitForTimeout(5000);
  await expect(startButton(b.page), 'B took it back and started all the same').toBeVisible();
  expect((await timerOf(pb.name))?.phase).toBe('idle');
});

// 3. Notes.

test('notes: B writes one, A sees "1" on Notes and not on the bottom bar; on a lap the panel is folded and the count stays; off it, opening Notes clears it; 200 characters go, 201 do not', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(90000);
  const [pa, pb] = [await person(a, 'nt_a'), await person(b, 'nt_b')];
  const { id: roomId } = await room({ d: a, p: pa }, { d: b, p: pb });
  await go(a.page, 'Room');
  await tab(a.page, 'People').click();

  await go(b.page, 'Room');
  await tab(b.page, 'Notes').click();
  const field = b.page.getByLabel('Leave a note for the room');
  await field.fill('back at four');
  await field.press('Enter');
  await expect(b.page.getByRole('tabpanel')).toContainText('back at four');

  // A: the count on Notes, said to a screen reader, and none on the bottom bar.
  await expect(tab(a.page, 'Notes')).toHaveAccessibleName('Notes, 1 new', { timeout: 3000 });
  await expect(a.page.getByRole('navigation', { name: 'Screens' })).not.toContainText('1');

  // On a lap the panel is folded, says how many wait and when they open, and the count stays.
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  await expect(button(a.page, 'Pause')).toBeVisible();
  await go(a.page, 'Room');
  await tab(a.page, 'Notes').click();
  await expect(a.page.getByRole('tabpanel')).toHaveText(/^1 new note\. They open when this lap ends, at \d\d:\d\d\.$/);
  await expect(a.page.getByRole('tabpanel')).not.toContainText('back at four');
  await tab(a.page, 'People').click();
  await expect(tab(a.page, 'Notes'), 'the count went while the notes were folded').toHaveAccessibleName('Notes, 1 new');

  // Off the lap, opening Notes shows it and clears the count.
  await go(a.page, 'Focus');
  await button(a.page, 'Stop').click();
  await go(a.page, 'Room');
  await tab(a.page, 'Notes').click();
  await expect(a.page.getByRole('tabpanel')).toContainText('back at four');
  await tab(a.page, 'People').click();
  await expect(tab(a.page, 'Notes')).toHaveAccessibleName('Notes');

  // The server: 200 characters are a note, 201 are not, and nor is a line break.
  expect((await ask(pb.node, '/api/rooms/note', { room: roomId, text: 'x'.repeat(200) })).ok).toBe(true);
  expect(await ask(pb.node, '/api/rooms/note', { room: roomId, text: 'x'.repeat(201) })).toEqual({ ok: false, error: 'bad_request' });
  expect(await ask(pb.node, '/api/rooms/note', { room: roomId, text: 'two\nlines' })).toEqual({ ok: false, error: 'bad_request' });
});

test('notes read on one device are read on all: B writes two, both of A\'s devices count 2; A opens Notes on one and the other\'s count goes without a reload; B, who wrote them, has none', async ({ deviceA: a, deviceB: b, phone }) => {
  test.setTimeout(60000);
  const [pa, pb] = [await person(a, 'rd_a'), await person(b, 'rd_b')];
  // A's second device.
  await phone.page.setViewportSize(PHONE);
  await signIn(phone.page, pa.name);
  await ready(phone.page);
  const { id: roomId } = await room({ d: a, p: pa }, { d: b, p: pb });
  for (const d of [a, phone, b]) {
    await go(d.page, 'Room');
    await tab(d.page, 'People').click();
  }
  for (const text of ['back at four', 'library is full']) expect((await ask(pb.node, '/api/rooms/note', { room: roomId, text })).ok).toBe(true);

  for (const d of [a, phone]) await expect(tab(d.page, 'Notes')).toHaveAccessibleName('Notes, 2 new', { timeout: 5000 });
  await expect(tab(b.page, 'Notes'), 'B is counted their own notes').toHaveAccessibleName('Notes');

  await tab(a.page, 'Notes').click();
  await expect(a.page.getByRole('tabpanel')).toContainText('library is full');
  // The phone is not touched: no reload, no tab change. Only the server's word can clear it.
  await expect(tab(phone.page, 'Notes'), 'read on A\'s laptop, still new on A\'s phone').toHaveAccessibleName('Notes', { timeout: 5000 });
  await expect(tab(b.page, 'Notes')).toHaveAccessibleName('Notes');
});

// 4. Removing a member.

test('the keeper removes C: C sees the room gone, the old code no longer joins, the new one does; a member who is not the keeper cannot remove', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  const [pa, pb, pc] = [await person(a, 'rm_a'), await person(b, 'rm_b'), await person(c, 'rm_c')];
  const { id: roomId, code } = await room({ d: a, p: pa }, { d: b, p: pb }, { d: c, p: pc });
  expect(await ask(pb.node, '/api/rooms/remove', { room: roomId, member: pc.id })).toEqual({ ok: false, error: 'forbidden' });
  // The keeper's sheet: Who is in, Remove, and asked again.
  await go(a.page, 'Room');
  await button(a.page, 'Code and settings').click();
  const who = a.page.getByRole('dialog', { name: 'This room' }).getByRole('region', { name: 'Who is in' });
  await who.locator('li').filter({ hasText: pc.name }).getByRole('button', { name: 'Remove', exact: true }).click();
  await who.getByRole('button', { name: `Remove ${pc.name}?`, exact: true }).click();
  await a.page.getByRole('dialog', { name: 'This room' }).getByRole('button', { name: 'Close', exact: true }).click();
  await go(c.page, 'Room');
  await expect(c.page.getByRole('heading', { name: 'You are not in a room yet.' })).toBeVisible({ timeout: 3000 });
  await expect(people(a.page)).toHaveCount(2, { timeout: 3000 });
  expect(await ask(pc.node, '/api/rooms/join', { code }), 'the old code still joins').toEqual({ ok: false, error: 'code' });
  // The new code, as A's sheet shows it.
  await go(a.page, 'Room');
  await button(a.page, 'Code and settings').click();
  const fresh = (await a.page.getByRole('dialog', { name: 'This room' }).getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
  expect(fresh).not.toBe(code);
  expect((await ask(pc.node, '/api/rooms/join', { code: fresh })).ok, 'the new code does not join').toBe(true);
  await expect(people(c.page)).toHaveCount(3, { timeout: 3000 });
});

// 5. Pictures.

test('a picture: A sets one from a small PNG, which the page makes square and small; B sees it in A\'s row; an account outside the room gets 404 for it', async ({ deviceA: a, deviceB: b }) => {
  const [pa, pb] = [await person(a, 'pc_a'), await person(b, 'pc_b')];
  await room({ d: a, p: pa }, { d: b, p: pb });
  // What B's Node device hears of the room from here on: A's picture comes as its hash.
  const heard: { members?: { id: string; picture?: string | null }[] }[] = [];
  pb.node.engine.onRoom((msg) => void heard.push(msg as never));
  const hashOf = () => heard.flatMap((msg) => msg.members ?? []).filter((m) => m.id === pa.id && m.picture).map((m) => m.picture!).at(-1) ?? null;
  // A 64 by 48 PNG, made in the page: not square, and not WebP, as a phone's photo is neither.
  const png = Buffer.from(
    (await a.page.evaluate(() => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 48 });
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#c0392b';
      g.fillRect(0, 0, 64, 48);
      return canvas.toDataURL('image/png');
    })).split(',')[1]!,
    'base64',
  );
  await a.page.getByRole('link', { name: `Settings, signed in as ${pa.name}` }).click();
  await expect(a.page.getByText('Your picture', { exact: true })).toBeVisible();
  await a.page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  // The server holds a hash for A, and B's row for A draws a picture.
  await expect.poll(hashOf, { timeout: 5000, message: 'A\'s picture never reached the room' }).not.toBeNull();
  const hash = hashOf()!;
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  await go(b.page, 'Room');
  // A's circle in B's row is drawn with the picture.
  await expect(rowOf(b.page, pa.name).locator('i[style*="background-image"]').first()).toBeVisible({ timeout: 5000 });

  // Outside the room: a 404, as for a picture that does not exist.
  const outsider = username('pc_out');
  await accountWith(outsider);
  const login = await fetch(`http://${ADDR}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: outsider, password: PASSWORD, device: 'a1b2c3d4e5f60718' }) });
  const { token: bearer } = (await login.json()) as { token: string };
  const got = await fetch(`http://${ADDR}/api/pictures/${hash}`, { headers: { authorization: `Bearer ${bearer}` } });
  expect(got.status, 'an account outside the room got the picture').toBe(404);
});

// 6. The room's week.

test('the Week tab: the room\'s total for the week, ahead of last week at this time, the streak, and Your part equal to A\'s own week', async ({ deviceA: a, deviceB: b }) => {
  const now = Date.now();
  // The laps this week go back five hours: they must fall after this week's Monday began.
  const monday = Date.parse(`${localDay(now - ((new Date(`${localDay(now, OFF)}T00:00:00Z`).getUTCDay() + 6) % 7) * DAY, OFF)}T00:00:00Z`) - OFF * MIN;
  test.skip(now - monday < 6 * 60 * MIN, 'too early in the week for five hours of laps in it');
  const lastWeek = now - 7 * DAY;
  // Last week, by this time: one lap each. This week: three for A, two for B: the room is ahead.
  const pa = await person(a, 'wk_a', (n) => {
    lap(n, 'l1', lastWeek - 2 * 60 * MIN);
    for (const [i, back] of [1, 2, 3].entries()) lap(n, `t${i}`, now - back * 60 * MIN);
  });
  const pb = await person(b, 'wk_b', (n) => {
    lap(n, 'l1', lastWeek - 3 * 60 * MIN);
    for (const [i, back] of [4, 5].entries()) lap(n, `t${i}`, now - back * 60 * MIN);
  });
  await room({ d: a, p: pa }, { d: b, p: pb });
  await go(a.page, 'Room');
  await tab(a.page, 'Week').click();
  const panel = a.page.getByRole('tabpanel');
  await expect(panel).toContainText(/The room is .+ ahead of last week at this time\./, { timeout: 3000 });
  await expect(panel).toContainText(/together this week/);
  await expect(panel).toContainText(/days? in a row, everyone in/);
  await expect(panel).toContainText(/Today (is kept|counts once (all|both))/);
  // Your part: A's own week, of the room's.
  const part = (await panel.innerText()).replace(/\s+/g, ' ').match(/((?:\d+h )?\d+m) of the room\u2019s ((?:\d+h )?\d+m) this week/);
  expect(part, 'no "Your part" line').not.toBeNull();
  await go(a.page, 'Progress');
  await expect(a.page.getByText(/^Progress, week of /)).toBeVisible();
  const mine = ((await a.page.getByRole('img', { name: /^This week .* so far\./ }).filter({ visible: true }).first().getAttribute('aria-label')) ?? '').match(/^This week ((?:\d+h )?\d+m) so far/)?.[1];
  expect(part![1], 'Your part is not A\'s own week').toBe(mine);
});
