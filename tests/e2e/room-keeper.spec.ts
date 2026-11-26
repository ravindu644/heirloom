// A room's keeper (roadmap section 21, protocol section 15 `keeper`, DESIGN.md "A room's keeper"):
// only the one who made the room changes its name, target and ranking; everyone else reads them
// as words and is told who can. The keeper leaving hands the room to the member who joined next.
import type { Page } from '@playwright/test';
import { signedIn } from '../sync/harness.ts';
import { accountWith, go, ready, signIn, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';
import { e2eServer } from './server.ts';

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const sheetOf = (page: Page) => page.getByRole('dialog', { name: 'This room' });

async function person(d: Device, tag: string) {
  const name = username(tag);
  await accountWith(name);
  await signIn(d.page, name);
  await ready(d.page);
  return name;
}
async function openSheet(page: Page) {
  await go(page, 'Room');
  await button(page, 'Code and settings').click();
  await expect(sheetOf(page)).toBeVisible();
  return sheetOf(page);
}
async function closeSheet(page: Page) {
  await button(sheetOf(page) as never, 'Close').click();
  await expect(sheetOf(page)).toBeHidden();
}
async function join(d: Device, code: string) {
  await go(d.page, 'Room');
  await d.page.getByLabel('The code a friend gave you').fill(code);
  await button(d.page, 'Join').click();
}
/** The sheet of someone who is not the keeper: the code and Copy, the settings as words, who can change them, and no control for them. */
async function readOnly(page: Page, keeper: string, roomName: string, target: string) {
  const sheet = await openSheet(page);
  await expect(sheet.getByRole('region', { name: 'The code to share' })).toBeVisible();
  await expect(button(sheet as never, 'Copy the code')).toBeVisible();
  await expect(sheet).toContainText(roomName);
  await expect(sheet).toContainText(target);
  await expect(sheet).toContainText('Off: in the order people joined.');
  await expect(sheet.getByText(`Only ${keeper} can change these.`, { exact: true })).toBeVisible();
  await expect(sheet.getByRole('textbox'), 'a member who is not the keeper can type a name').toHaveCount(0);
  await expect(button(sheet as never, 'Rename')).toHaveCount(0);
  await expect(button(sheet as never, 'One hour more')).toHaveCount(0);
  await expect(button(sheet as never, 'One hour less')).toHaveCount(0);
  await expect(sheet.getByRole('checkbox', { name: 'Order by this week' })).toHaveCount(0);
  return sheet;
}
/** The keeper's sheet: the controls are there. */
async function keeps(page: Page) {
  const sheet = await openSheet(page);
  await expect(button(sheet as never, 'Rename')).toBeVisible();
  await expect(button(sheet as never, 'One hour more')).toBeVisible();
  await expect(sheet.getByRole('checkbox', { name: 'Order by this week' })).toBeVisible();
  await expect(sheet.getByText(/^Only .* can change these\.$/)).toHaveCount(0);
  return sheet;
}

test('only the keeper changes a room: B reads the name, target and ranking as words with "Only A can change these." and no controls, and the server refuses B\'s update; A\'s rename and target reach B; A leaves and B keeps the room, and C, who joined after, reads "Only B can change these."', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  test.setTimeout(90000);
  const [nameA, nameB] = [await person(a, 'ka'), await person(b, 'kb'), await person(c, 'kc')];

  // A makes the room; B joins with its code.
  await go(a.page, 'Room');
  await a.page.getByLabel('Its name').fill('study hall');
  await button(a.page, 'Make the room').click();
  const sheetA = await keeps(a.page);
  const code = (await sheetA.getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
  await closeSheet(a.page);
  await join(b, code);
  await expect(b.page.getByText('Room: study hall')).toBeVisible();

  // B's sheet: words, not controls.
  await readOnly(b.page, nameA, 'study hall', 'No target');
  await closeSheet(b.page);

  // B, around the screen, straight to the server: refused, and nothing changes.
  const nodeB = await signedIn(e2eServer(), nameB);
  try {
    const joined = await nodeB.engine.request('/api/rooms/join', { code });
    expect(joined.ok, 'B is not in the room').toBe(true);
    const room = (joined as { data: { room: string } }).data.room;
    expect(await nodeB.engine.request('/api/rooms/update', { room, name: 'mine now', target_ms: 3600000, ranked: true })).toEqual({ ok: false, error: 'forbidden' });
  } finally {
    await nodeB.engine.stop();
  }
  for (const d of [a, b]) {
    await go(d.page, 'Room');
    await expect(d.page.getByText('Room: study hall')).toBeVisible();
    await expect(d.page.getByText('Room: mine now')).toHaveCount(0);
  }

  // A renames it and sets a target of 2 hours: both see it.
  const sheet = await keeps(a.page);
  const field = sheet.getByRole('textbox').first();
  await field.fill('reading room');
  await button(sheet as never, 'Rename').click();
  await button(sheet as never, 'One hour more').click();
  await button(sheet as never, 'One hour more').click();
  await closeSheet(a.page);
  for (const d of [a, b]) {
    await go(d.page, 'Room');
    await expect(d.page.getByText('Room: reading room')).toBeVisible({ timeout: 3000 });
    await expect(d.page.getByText(/ of 2h(?: 0m)? together this week\.$/)).toBeVisible({ timeout: 3000 });
  }
  await readOnly(b.page, nameA, 'reading room', '2 hours a week together');
  await closeSheet(b.page);

  // C joins after B; then A leaves. B joined next after A, so B keeps the room.
  await join(c, code);
  await expect(c.page.getByText('Room: reading room')).toBeVisible();
  const leaving = await openSheet(a.page);
  await button(leaving as never, 'Leave the room').click();
  await button(a.page, 'Leave').click();
  await expect(a.page.getByRole('heading', { name: 'You are not in a room yet.' })).toBeVisible({ timeout: 3000 });

  // B's sheet now has the controls.
  await keeps(b.page);
  await closeSheet(b.page);
  await readOnly(c.page, nameB, 'reading room', '2 hours a week together');
  await closeSheet(c.page);
});
