// Rooms through the screen (protocol section 15): three accounts in three browser contexts, and a
// fourth outside. The roadmap's box: presence within 1 s, totals right, privacy holds.
import type { Page } from '@playwright/test';
import { accountWith, digits, go, ready, signIn, startButton, startNow, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

type Lengths = Parameters<typeof accountWith>[1];
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
// Someone's lane on a screen: their name, or "You" on their own.
// The person chip draws the initial in the same span as the name: "Rra_x1" is ra_x1, "YYou" is you.
const lane = (page: Page, who: string) =>
  page.getByRole('region', { name: 'Who is focusing now' }).locator('article').filter({ has: page.getByText(new RegExp(`^.${who}$`)) });

async function person(d: Device, tag: string, lengths: Lengths = {}) {
  const name = username(tag);
  await accountWith(name, lengths);
  await signIn(d.page, name);
  await ready(d.page);
  return name;
}

// A makes a room; B and C join it with the code read off A's sheet.
async function trio(a: Device, b: Device, c: Device, lengths: Lengths = {}) {
  const names = [await person(a, 'ra', lengths), await person(b, 'rb', lengths), await person(c, 'rc', lengths)];
  await go(a.page, 'Room');
  await expect(a.page.getByRole('heading', { name: 'You are not in a room yet.' })).toBeVisible();
  await a.page.getByLabel('Its name').fill('study hall');
  await button(a.page, 'Make the room').click();
  await expect(a.page.getByRole('heading', { name: 'Only you here so far. The code brings a friend in.' })).toBeVisible();
  await button(a.page, 'Code and settings').click();
  const sheet = a.page.getByRole('dialog', { name: 'This room' });
  const code = (await sheet.getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  await button(sheet as never, 'Close').click();
  for (const d of [b, c]) {
    await go(d.page, 'Room');
    // Read out over the phone: in small letters, with the space in the middle.
    await d.page.getByLabel('The code a friend gave you').fill(`${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`);
    await button(d.page, 'Join').click();
    await expect(d.page.getByText('Room: study hall')).toBeVisible();
  }
  for (const d of [a, b, c]) await expect(d.page.getByRole('region', { name: 'Who is focusing now' }).locator('article')).toHaveCount(3);
  return { names, code };
}

test('presence: a lap on A shows on B and C within a second with the same time left; pause and stop too; an outsider sees nothing and a wrong code says so', async ({ deviceA: a, deviceB: b, deviceC: c, browser }) => {
  const { names } = await trio(a, b, c);
  const [nameA] = names;
  await go(a.page, 'Focus');
  const start = Date.now();
  await startButton(a.page).click();
  for (const d of [b, c]) await expect(lane(d.page, nameA!)).toContainText('Focusing', { timeout: 1000 });
  // The set is on no screen: the row says Focusing and the time left, no lap number.
  for (const d of [b, c]) await expect(lane(d.page, nameA!)).not.toContainText(/\blap \d|set of/);
  console.log(`start on A, seen on B and C: ${Date.now() - start} ms`);
  // Time left on the lane, against A's own digits: within a second.
  const seconds = (text: string) => Number(text.split(':')[0]) * 60 + Number(text.split(':')[1]);
  for (const d of [b, c]) {
    const theirs = seconds(await lane(d.page, nameA!).locator('b').first().innerText());
    const mine = seconds((await digits(a.page).innerText()));
    expect(Math.abs(theirs - mine), `${theirs} s on the lane, ${mine} s on A`).toBeLessThanOrEqual(1);
  }
  await button(a.page, 'Pause').click();
  for (const d of [b, c]) await expect(lane(d.page, nameA!)).toContainText('Paused', { timeout: 1000 });
  await button(a.page, 'Resume').click();
  await a.page.getByRole('button', { name: 'Stop', exact: true }).click();
  for (const d of [b, c]) await expect(lane(d.page, nameA!)).toContainText('Not on a lap', { timeout: 1000 });

  // A fourth account: nothing of the room reaches it, and a wrong code is said in words.
  const outside = await browser.newContext();
  const page = await outside.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const nameD = username('rd');
  await accountWith(nameD);
  await signIn(page, nameD);
  await ready(page);
  await go(page, 'Room');
  await expect(page.getByRole('heading', { name: 'You are not in a room yet.' })).toBeVisible();
  await page.getByLabel('The code a friend gave you').fill('ABCD2345');
  await button(page, 'Join').click();
  // Each door's refusal is a region that is always there; the join door's says why, the make door's is empty.
  await expect(page.locator('form').filter({ has: page.getByLabel('The code a friend gave you') }).getByRole('alert')).toHaveText('No room has that code.');
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(1);
  await expect(page.getByText('study hall')).toHaveCount(0);
  expect(errors).toEqual([]);
  await outside.close();
});

test('totals after short laps, a cheer once and then only a sentence, never on your own lane, named on the Focus result; ranked order', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  const { names } = await trio(a, b, c, { work_ms: 3000, short_ms: 60000 });
  const [nameA, nameB, nameC] = names as [string, string, string];
  // The lanes top to bottom, as the names they show ("You" on one's own). Joined order, before any ranking.
  // Each lane's name, from its person chip: the span that starts with the initial.
  const order = (page: Page) =>
    page
      .getByRole('region', { name: 'Who is focusing now' })
      .locator('article')
      .evaluateAll((els) => els.map((el) => [...el.querySelectorAll('span')].find((span) => span.firstElementChild?.tagName === 'I')?.textContent?.slice(1) ?? ''));
  await expect.poll(() => order(b.page)).toEqual([nameA, 'You', nameC]);

  // A runs one lap, B two.
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  await go(b.page, 'Focus');
  await startButton(b.page).click();
  await expect(startNow(b.page)).toBeVisible({ timeout: 8000 });
  await startNow(b.page).click();
  await expect(startNow(b.page)).toBeVisible({ timeout: 8000 });
  await expect(startNow(a.page)).toBeVisible();
  await go(b.page, 'Room');
  await expect(lane(c.page, nameA)).toContainText('0m today in 1 lap, 0m this week.', { timeout: 3000 });
  await expect(lane(c.page, nameB)).toContainText('0m today in 2 laps, 0m this week.');

  // B cheers A: shown at once, once.
  const cheer = lane(b.page, nameA).getByRole('button', { name: /^Cheer / });
  await expect(cheer).toHaveAccessibleName(/^Cheer .* for the lap that ended at \d\d:\d\d$/);
  await cheer.click();
  // Given, the cheer is a sentence, and nothing more to press.
  await expect(lane(b.page, nameA)).toContainText('You cheered this lap.');
  await expect(lane(b.page, nameA).getByRole('button', { name: /^Cheer/ })).toHaveCount(0);
  await expect(lane(c.page, nameA)).toContainText(`${nameB} cheered this lap.`, { timeout: 2000 });
  await expect(lane(b.page, 'You').getByRole('button', { name: /Cheer/ })).toHaveCount(0);
  // A's own Focus result names who cheered.
  await expect(a.page.getByText(`${nameB} cheered.`)).toBeVisible({ timeout: 2000 });

  // Ranked: B, with two laps, first.
  await button(c.page, 'Code and settings').click();
  await c.page.getByRole('dialog', { name: 'This room' }).getByRole('checkbox', { name: 'Order by this week' }).click();
  await c.page.getByRole('dialog', { name: 'This room' }).getByRole('button', { name: 'Close' }).click();
  await go(a.page, 'Room');
  await expect.poll(() => order(a.page)).toEqual([nameB, 'You', nameC]);
});

test('privacy: the task title only while A shares it, gone at once when A stops; C hides rooms, loses Room, is away to A, and C\'s lap still counts', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  const { names } = await trio(a, b, c, { work_ms: 3000, short_ms: 60000 });
  const [nameA, , nameC] = names as [string, string, string];
  const settingsOf = async (d: Device, name: string) => {
    await d.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
    await expect(d.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  };

  // A's lap on a task. Not shared by default.
  await go(a.page, 'Today');
  const box = a.page.getByLabel('Add a task', { exact: true });
  await box.fill('secret thesis');
  await box.press('Enter');
  await settingsOf(a, nameA);
  await a.page.getByRole('checkbox', { name: 'Show the room what I am on' }).click();
  await go(a.page, 'Today');
  await a.page.locator('section').filter({ has: a.page.getByRole('heading', { name: 'Next' }) }).getByRole('button', { name: 'Start', exact: true }).click();
  await expect(lane(b.page, nameA)).toContainText('secret thesis', { timeout: 1000 });
  await settingsOf(a, nameA);
  await a.page.getByRole('checkbox', { name: 'Show the room what I am on' }).click();
  // Within the 3 s lap, the title is gone at once.
  await expect(lane(b.page, nameA)).not.toContainText('secret thesis', { timeout: 1000 });

  // C hides rooms.
  await settingsOf(c, nameC);
  await c.page.getByRole('checkbox', { name: 'Hide rooms' }).click();
  await expect(c.page.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name: 'Room' })).toHaveCount(0);
  await go(b.page, 'Room');
  await expect(lane(b.page, nameC)).toContainText('Away', { timeout: 2000 });
  await go(c.page, 'Focus');
  await startButton(c.page).click();
  await expect(startNow(c.page)).toBeVisible({ timeout: 8000 });
  await expect(lane(b.page, nameC)).toContainText('in 1 lap', { timeout: 3000 });
  await expect(lane(b.page, nameC)).toContainText('Away');
  await expect(lane(b.page, nameC).getByRole('button', { name: /Cheer/ })).toHaveCount(0);
});

test('rename and a target; leaving takes a second tap, and the last one out ends the room; no connection: the stale line, and making or joining needs a connection', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  const { names } = await trio(a, b, c);
  await button(a.page, 'Code and settings').click();
  let sheet = a.page.getByRole('dialog', { name: 'This room' });
  await sheet.getByLabel('Its name').fill('night owls');
  await button(sheet as never, 'Rename').click();
  // The target: plus nudges it, a whole number is typed, anything else is put back.
  const target = sheet.getByRole('spinbutton', { name: 'Together in a week' });
  await sheet.getByRole('button', { name: 'One hour more', exact: true }).click();
  await expect(target).toHaveValue('1');
  await expect(b.page.getByText('0m of 1h together this week.')).toBeVisible({ timeout: 2000 });
  await target.fill('20');
  await target.press('Enter');
  await expect(b.page.getByText('0m of 20h together this week.')).toBeVisible({ timeout: 2000 });
  // A fraction is put back; past either end a figure comes to the nearest one it can be (DESIGN.md).
  await target.fill('2.5');
  await target.press('Enter');
  await expect(target, '"2.5" was kept').toHaveValue('20');
  for (const [typed, kept, said] of [['201', '200', '0m of 200h together this week.'], ['-1', '0', '0m together this week.'], ['20', '20', '0m of 20h together this week.']] as const) {
    await target.fill(typed);
    await target.press('Enter');
    await expect(target, `"${typed}" typed`).toHaveValue(kept);
    await expect(b.page.getByText(said), `"${typed}" typed`).toBeVisible({ timeout: 2000 });
  }
  // An emptied field is put back too: it must not wipe the room's target for everyone.
  await target.fill('');
  await target.press('Enter');
  await b.page.waitForTimeout(1000);
  await expect(b.page.getByText('0m of 20h together this week.'), 'an emptied field set the room\'s target to none').toBeVisible();
  await expect(target).toHaveValue('20');
  await button(sheet as never, 'Close').click();
  await expect(b.page.getByText('Room: night owls')).toBeVisible({ timeout: 2000 });
  await expect(b.page.getByText('0m of 20h together this week.')).toBeVisible();

  // A and B on laps; then B without a connection: old news is said in the past, and only B's own time left shows.
  for (const d of [a, b]) {
    await go(d.page, 'Focus');
    await startButton(d.page).click();
    await go(d.page, 'Room');
  }
  await expect(b.page.getByRole('heading', { level: 1 })).toHaveText('2 of 3 focusing now.', { timeout: 2000 });
  await b.setOffline(true);
  await expect(b.page.getByRole('heading', { level: 1 })).toHaveText('2 of 3 were focusing when the room was last heard from.', { timeout: 3000 });
  await expect(lane(b.page, 'You').locator('b')).toHaveCount(1);
  await expect(lane(b.page, names[0]!).locator('b')).toHaveCount(0);
  await b.setOffline(false);
  await expect(b.page.getByRole('heading', { level: 1 })).toHaveText('2 of 3 focusing now.', { timeout: 5000 });
  await expect(lane(b.page, names[0]!).locator('b')).toHaveCount(1);

  // Everyone leaves; C is last, and is told leaving ends the room.
  for (const d of [a, c]) {
    await button(d.page, 'Code and settings').click();
    sheet = d.page.getByRole('dialog', { name: 'This room' });
    await button(sheet as never, 'Leave the room').click();
    await expect(sheet).toContainText('Your laps leave the room’s week with you. The code brings you back.');
    await button(sheet as never, 'Leave').click();
    await expect(d.page.getByRole('heading', { name: 'You are not in a room yet.' })).toBeVisible({ timeout: 3000 });
  }
  await button(b.page, 'Code and settings').click();
  sheet = b.page.getByRole('dialog', { name: 'This room' });
  await button(sheet as never, 'Leave the room').click();
  await expect(sheet).toContainText('You are the last one here. Leaving ends the room.');
  // Stay takes it back; the second tap is the one that leaves.
  await button(sheet as never, 'Stay').click();
  await expect(sheet.getByRole('button', { name: 'Leave', exact: true })).toHaveCount(0);
  await button(sheet as never, 'Leave the room').click();
  await button(sheet as never, 'Leave').click();
  await expect(b.page.getByRole('heading', { name: 'You are not in a room yet.' })).toBeVisible({ timeout: 3000 });

  // No connection: making or joining says it needs one.
  await a.setOffline(true);
  await expect(a.page.getByText('Making or joining a room needs a connection.')).toBeVisible({ timeout: 3000 });
  await a.page.getByLabel('Its name').fill('offline room');
  await button(a.page, 'Make the room').click();
  await expect(a.page.locator('form').filter({ has: a.page.getByLabel('Its name') }).getByRole('alert')).toHaveText('Needs a connection. Nothing was sent.');
  await expect(a.page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(1);
});
